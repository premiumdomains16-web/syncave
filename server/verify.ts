// Domain verification and install checks for a customer's site.
//
// Ownership is proven by any ONE of:
//   1. meta tag   <meta name="syncave-verification" content="TOKEN">  anywhere in the page
//   2. snippet    this bot's own widget script (widget.js?id=BOT_ID) on the page; only the
//                 site's owner would install a bot they created, so it proves control too
//   3. DNS        a TXT record "syncave-verification=TOKEN" on the domain (or its parent,
//                 for www.); works with site builders that can't edit page HTML
import * as cheerio from "cheerio/slim";
import type { Bot } from "../shared/types.js";
import { BlockedAddress, fetchPage } from "./safeFetch.js";
import { HttpError } from "./errors.js";

export type VerifyMethod = "meta" | "snippet" | "dns";

export interface WidgetScript {
  /** The script's src as written on the page, resolved to an absolute URL. */
  src: string;
  /** Host serving widget.js (e.g. syncave.web.app). */
  host: string;
  /** Bot id in the URL, if any. */
  botId: string | null;
}

export interface SiteSignals {
  metaTokens: string[];
  widgetScripts: WidgetScript[];
}

const META_NAMES = new Set(["syncave-verification", "sitebot-verification"]);

/** Finds verification tags and Syncave widget scripts in a page's HTML (pure; no network). */
export function parseSiteSignals(html: string, pageUrl: string): SiteSignals {
  const $ = cheerio.load(html);
  const metaTokens = $("meta")
    .toArray()
    .filter((el) => META_NAMES.has(String($(el).attr("name") ?? "").trim().toLowerCase()))
    .map((el) => String($(el).attr("content") ?? "").trim())
    .filter(Boolean);

  const widgetScripts: WidgetScript[] = [];
  $("script[src]").each((_, el) => {
    const raw = String($(el).attr("src") ?? "").trim();
    let u: URL;
    try { u = new URL(raw, pageUrl); } catch { return; }
    if (!/\/widget\.js$/i.test(u.pathname)) return;
    const botId = u.searchParams.get("id");
    // Only Syncave-looking scripts: carry a bot id.
    if (!botId) return;
    widgetScripts.push({ src: u.toString(), host: u.host, botId });
  });
  return { metaTokens, widgetScripts };
}

/** Turns a failed page fetch into a message the site owner can act on. */
export function siteFetchError(err: unknown, url: string): HttpError {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  const msg = err instanceof Error ? err.message : String(err);
  const name = (err as { name?: string })?.name ?? "";
  if (err instanceof BlockedAddress) return new HttpError(400, `${host} points to a private or internal address, so it can't be checked.`);
  if (name === "TimeoutError" || name === "AbortError" || /timed? ?out/i.test(msg)) return new HttpError(504, `${host} took too long to respond. Make sure the site is online, then try again.`);
  if (/resolve|ENOTFOUND|EAI_AGAIN|dns/i.test(msg)) return new HttpError(502, `We couldn't find ${host}. Check that the domain is correct and already pointing to your website.`);
  const status = Number(msg.match(/^HTTP (\d{3})/)?.[1]);
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    return new HttpError(502, `${host} blocked our check (HTTP ${status}). This often happens with Cloudflare or other bot protection, a login, or a maintenance page. Use the DNS method instead, or allow our check temporarily.`);
  }
  if (status === 404) return new HttpError(502, `${host} answered "page not found" (404). Make sure your homepage is published at this address.`);
  if (status) return new HttpError(502, `${host} returned an error (HTTP ${status}). Make sure the site is online, then try again.`);
  if (/Not an HTML page/i.test(msg)) return new HttpError(502, `${host} didn't return a web page. Check that the site address is your homepage.`);
  if (/too large/i.test(msg)) return new HttpError(502, `${host}'s homepage is too large to check (over 2 MB). Use the DNS method instead.`);
  if (/redirect/i.test(msg)) return new HttpError(502, `${host} redirects too many times. Check your site's redirect settings.`);
  return new HttpError(502, `We couldn't reach ${host}. Make sure the site is public, then try again.`);
}

/** TXT records for a host, each record's chunks joined. Empty when none or on lookup errors. */
export async function txtRecords(host: string): Promise<string[]> {
  try {
    const Deno = (globalThis as any).Deno;
    if (Deno?.resolveDns) return ((await Deno.resolveDns(host, "TXT")) as string[][]).map((r) => r.join(""));
    const dns = await import("node:dns/promises");
    return (await dns.resolveTxt(host)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

/** Hosts to look for the DNS record on: the site's host, plus the parent for www. */
export function dnsHostsFor(url: string): string[] {
  const host = new URL(url).hostname.toLowerCase();
  return host.startsWith("www.") ? [host, host.slice(4)] : [host];
}

export const dnsRecordValue = (token: string) => `syncave-verification=${token}`;

/**
 * Checks ownership by every method. Resolves with the method that worked, or throws an
 * HttpError explaining what was found (e.g. an old token, or the site blocking us).
 */
export async function verifyOwnership(bot: Bot): Promise<VerifyMethod> {
  let pageError: HttpError | null = null;
  let signals: SiteSignals | null = null;
  try {
    const page = await fetchPage(bot.url, { timeout: 10_000 });
    signals = parseSiteSignals(page.html, page.finalUrl);
  } catch (e) {
    pageError = siteFetchError(e, bot.url);
  }

  if (signals) {
    if (signals.metaTokens.includes(bot.verificationToken)) return "meta";
    if (signals.widgetScripts.some((s) => s.botId === bot.id)) return "snippet";
  }

  // DNS works even when the page blocks us or builds its <head> with JavaScript.
  const records = (await Promise.all(dnsHostsFor(bot.url).map(txtRecords))).flat();
  if (records.some((r) => r.trim() === dnsRecordValue(bot.verificationToken))) return "dns";

  if (pageError) throw pageError;
  if (records.some((r) => r.trim().startsWith("syncave-verification="))) {
    throw new HttpError(400, "Found a Syncave DNS record, but its value doesn't match this site's token. Copy the record value again.");
  }
  if (signals!.metaTokens.length) {
    throw new HttpError(400, "Found a verification tag, but its token doesn't match. Make sure you copied this site's latest tag.");
  }
  if (signals!.widgetScripts.length) {
    throw new HttpError(400, "Found a Syncave chat script, but it belongs to a different site in your account. Copy the snippet from this site's Install tab.");
  }
  throw new HttpError(400, "We couldn't find the verification tag or this site's chat script on your homepage. If your site builder adds code with JavaScript, use the DNS method instead.");
}

export interface InstallStatus {
  /** This bot's script is on the page. */
  installed: boolean;
  /** Every Syncave widget script found, so the dashboard can flag old or wrong addresses. */
  scripts: WidgetScript[];
  checkedUrl: string;
}

/** Looks for the widget snippet on the site's homepage. */
export async function installStatus(bot: Bot): Promise<InstallStatus> {
  let page;
  try {
    page = await fetchPage(bot.url, { timeout: 10_000 });
  } catch (e) {
    throw siteFetchError(e, bot.url);
  }
  const { widgetScripts } = parseSiteSignals(page.html, page.finalUrl);
  return { installed: widgetScripts.some((s) => s.botId === bot.id), scripts: widgetScripts, checkedUrl: page.finalUrl };
}

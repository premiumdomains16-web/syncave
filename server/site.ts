// Fetching and inspecting the customer's own website.
import * as cheerio from "cheerio/slim"; // slim = no Node-only network code, runs in Edge Functions
import { fetchPage } from "./safeFetch.js";

/** Accepts "example.com" or "https://example.com/" and returns a canonical http(s) URL, or null. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Best-effort page title; falls back to the bare hostname/path. */
export async function fetchSiteTitle(url: string): Promise<string> {
  const fallback = url.replace(/https?:\/\//, "").replace(/\/$/, "");
  try {
    const $ = cheerio.load((await fetchPage(url, { timeout: 8000 })).html);
    return ($("title").text() || $("h1").first().text() || fallback).trim().substring(0, 80) || fallback;
  } catch {
    return fallback;
  }
}

/** Reads the syncave-verification meta tag (or the legacy sitebot-verification one) from the homepage. Throws if the site is unreachable. */
export async function fetchVerificationToken(url: string): Promise<string | undefined> {
  const $ = cheerio.load((await fetchPage(url, { userAgent: "Syncave-Verifier/1.0" })).html);
  return (
    $('meta[name="syncave-verification"]').attr("content") ??
    $('meta[name="sitebot-verification"]').attr("content")
  );
}

// In the sandboxed (opaque-origin) preview frame, touching localStorage,
// sessionStorage or document.cookie throws — and many JavaScript-built sites
// crash on that and render a blank page. Swap in throwaway in-memory versions.
const SANDBOX_STORAGE_SHIM = `<script>(function(){
function mem(){var s={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(s,k)?s[k]:null},setItem:function(k,v){s[k]=String(v)},removeItem:function(k){delete s[k]},clear:function(){s={}},key:function(i){return Object.keys(s)[i]||null},get length(){return Object.keys(s).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
try{document.cookie}catch(e){try{var c="";Object.defineProperty(document,"cookie",{get:function(){return c},set:function(){},configurable:true})}catch(_){}}
})();</script>`;

// Page builders and animation libraries hide content until their scripts
// animate it in (e.g. Elementor's .elementor-invisible, AOS, WOW.js). Those
// triggers often don't fire in the sandboxed preview, leaving a blank page —
// so force such content visible. Best-effort; doesn't affect the live site.
const REVEAL_HIDDEN_CONTENT = `<style data-syncave-preview>
.elementor-invisible,[data-aos],.wow,.animated{visibility:visible!important;opacity:1!important;transform:none!important}
</style>`;

export interface SitePreview {
  html: string;
  finalUrl: string;
  title: string;
  /** Best guess at the page's main language — picks the demo bot's language. */
  lang: "ar" | "en";
}

/**
 * Fetches a page and prepares it to be shown inside the simulator frame:
 * relative links/assets keep pointing at the real site (<base>), links open in
 * a new tab, and anything that would fight the preview is removed.
 */
export async function buildSitePreview(url: string): Promise<SitePreview> {
  const { html, finalUrl } = await fetchPage(url);
  const $ = cheerio.load(html);

  // Respect a site's own <base>, resolved against where we actually landed.
  const ownBase = $("base[href]").first().attr("href");
  const baseHref = ownBase ? new URL(ownBase, finalUrl).toString() : finalUrl;
  $("base").remove();
  // CSP / refresh meta tags would block the site's own assets or navigate away.
  $('meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="refresh" i]').remove();
  // If the site already has a Syncave widget installed, don't show it twice.
  $('script[src*="/widget.js?id="]').remove();

  const head = $("head").length ? $("head") : $("html").prepend("<head></head>").find("head");
  // Order matters: <base> first so every later URL resolves against the real site,
  // then the storage shim before any of the site's own scripts run.
  head.prepend(`<base href="${baseHref.replace(/"/g, "&quot;")}" target="_blank">`, SANDBOX_STORAGE_SHIM);
  head.append(REVEAL_HIDDEN_CONTENT); // last, so it wins over the site's own CSS

  const title = ($("title").first().text() || $("h1").first().text() || new URL(finalUrl).hostname).trim().substring(0, 80);
  const htmlLang = ($("html").attr("lang") || "").toLowerCase();
  const text = $("body").text();
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const lang = htmlLang.startsWith("ar") || arabic > latin ? "ar" : "en";

  return { html: $.html(), finalUrl, title, lang };
}

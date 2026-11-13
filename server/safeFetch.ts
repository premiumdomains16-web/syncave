// Fetching URLs that users type in, without letting them reach our own network.
// Every connection (including each redirect hop) resolves DNS through
// `safeLookup`, which refuses private, loopback, link-local and similar
// addresses — so "http://localhost", "http://169.254.169.254" (cloud metadata),
// or a public name that resolves to 10.x.x.x are all rejected.
import axios, { type AxiosResponse } from "axios";
import dns from "dns";
import http from "http";
import https from "https";
import net from "net";

export class BlockedAddress extends Error {}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||   // carrier-grade NAT
    (a === 169 && b === 254) ||             // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224                                 // multicast + reserved
  );
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6); // unique-local, link-local, multicast
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      return callback(new BlockedAddress(`Blocked address for ${hostname}`), "", 4);
    }
    if ((options as dns.LookupOptions).all) return (callback as any)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

const httpAgent = new http.Agent({ lookup: safeLookup });
const httpsAgent = new https.Agent({ lookup: safeLookup });

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface FetchedPage {
  html: string;
  /** URL after redirects — what relative links on the page resolve against. */
  finalUrl: string;
}

/** GETs an http(s) page as text, refusing internal addresses, big bodies and non-HTML. */
export async function fetchPage(url: string, opts: { userAgent?: string; timeout?: number; maxBytes?: number } = {}): Promise<FetchedPage> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedAddress("Only http and https are allowed");
  // Literal IPs skip DNS, so check them directly too.
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateIp(host)) throw new BlockedAddress("Blocked address");

  let res: AxiosResponse<string>;
  try {
    res = await axios.get(url, {
      httpAgent,
      httpsAgent,
      proxy: false,
      timeout: opts.timeout ?? 10000,
      maxRedirects: 5,
      maxContentLength: opts.maxBytes ?? 2 * 1024 * 1024,
      responseType: "text",
      headers: { "User-Agent": opts.userAgent ?? BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
    });
  } catch (e: any) {
    // axios wraps errors from the DNS lookup; surface our block reason as-is.
    if (e?.cause instanceof BlockedAddress) throw e.cause;
    throw e;
  }
  const type = String(res.headers["content-type"] ?? "");
  if (type && !/html|xml/i.test(type)) throw new Error(`Not an HTML page (${type})`);
  const finalUrl = (res.request as any)?.res?.responseUrl || url;
  return { html: typeof res.data === "string" ? res.data : String(res.data), finalUrl };
}

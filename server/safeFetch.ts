// Fetching URLs that users type in, without letting them reach internal networks.
// Every hop (including each redirect) is checked: only http(s), no private,
// loopback, link-local or metadata addresses, whether given literally or via DNS.
// Works in Supabase Edge Functions (Deno.resolveDns) and in Node (node:dns).

export class BlockedAddress extends Error {}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(IPV4);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
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
  if (IPV4.test(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6); // unique-local, link-local, multicast
}

const isIpLiteral = (h: string) => IPV4.test(h) || h.includes(":");

async function resolveAll(host: string): Promise<string[]> {
  const Deno = (globalThis as any).Deno;
  if (Deno?.resolveDns) {
    const results = await Promise.allSettled([Deno.resolveDns(host, "A"), Deno.resolveDns(host, "AAAA")]);
    const ips = results.flatMap((r) => (r.status === "fulfilled" ? (r.value as string[]) : []));
    if (!ips.length) throw new Error(`Could not resolve ${host}`);
    return ips;
  }
  const dns = await import("node:dns/promises");
  return (await dns.lookup(host, { all: true })).map((a) => a.address);
}

async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIpLiteral(host)) {
    if (isPrivateIp(host)) throw new BlockedAddress("Blocked address");
    return;
  }
  if (host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw new BlockedAddress("Blocked address");
  const ips = await resolveAll(host);
  if (ips.some(isPrivateIp)) throw new BlockedAddress(`Blocked address for ${host}`);
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface FetchedPage {
  html: string;
  /** URL after redirects — what relative links on the page resolve against. */
  finalUrl: string;
}

/** GETs an http(s) page as text, refusing internal addresses, big bodies and non-HTML. */
export async function fetchPage(url: string, opts: { userAgent?: string; timeout?: number; maxBytes?: number } = {}): Promise<FetchedPage> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const signal = AbortSignal.timeout(opts.timeout ?? 10_000);
  let current = new URL(url);

  for (let hop = 0; ; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new BlockedAddress("Only http and https are allowed");
    await assertPublicHost(current.hostname);
    const res = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { "User-Agent": opts.userAgent ?? BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      if (hop >= 5) throw new Error("Too many redirects");
      current = new URL(res.headers.get("location")!, current);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) {
      await res.body?.cancel();
      throw new Error(`Not an HTML page (${type})`);
    }

    // Read at most maxBytes, so a huge page can't exhaust memory.
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("Page is too large");
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.length; }
    const charset = type.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
    let decoder: TextDecoder;
    try { decoder = new TextDecoder(charset || "utf-8"); } catch { decoder = new TextDecoder("utf-8"); }
    return { html: decoder.decode(bytes), finalUrl: current.toString() };
  }
}

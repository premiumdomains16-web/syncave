// End-to-end tests for the API, run in Node against throwaway local JSON data
// (never the real Supabase project). Sign-in is simulated with fake tokens.
//   npm run test:api
import os from "os";
import path from "path";
import fs from "fs/promises";

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "syncave-test-"));
process.env.DATA_DIR = dataDir; // must be set before the JSON store module loads

const { createApp } = await import("../server/app.js");
const { setDatabase, db } = await import("../server/db/index.js");
const { createJsonDatabase } = await import("../server/db/json.js");
type AuthIdentity = import("../server/auth.js").AuthIdentity;

setDatabase(createJsonDatabase());

// Fake Supabase Auth: token "tok:<authId>:<email>:<confirmed 0|1>[:name]".
const verifyToken = async (token: string): Promise<AuthIdentity | null> => {
  const [p, id, email, confirmed, name] = token.split(":");
  if (p !== "tok" || !id) return null;
  return { id, email, emailConfirmed: confirmed === "1", name };
};
const app = createApp({ verifyToken });

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function call(method: string, p: string, opts: { token?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body = opts.body;
  if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
  const res = await app.fetch(new Request(`http://edge.test${p}`, { method, headers, body }));
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, headers: res.headers };
}

const alice = "tok:auth-alice:alice@example.com:1:Alice";

// --- basics ---
let r = await call("GET", "/api/health");
check("health", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("OPTIONS", "/api/bots", { headers: { Origin: "https://syncave.web.app", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
check("CORS preflight allows Authorization", r.status === 204 && /authorization/i.test(r.headers.get("access-control-allow-headers") ?? ""), String(r.status));
r = await call("GET", "/api/bots");
check("no token → 401", r.status === 401);
r = await call("GET", "/api/bots", { token: "garbage" });
check("bad token → 401", r.status === 401);
r = await call("GET", "/api/nope");
check("unknown route → 404 JSON", r.status === 404 && r.data.error === "Not found");

// --- accounts ---
r = await call("GET", "/api/me", { token: alice });
check("first sign-in creates account", r.status === 200 && r.data.user.email === "alice@example.com" && r.data.user.plan === "free", JSON.stringify(r.data));
const aliceId = r.data.user?.id;
r = await call("GET", "/api/me", { token: alice });
check("same login → same account", r.data.user?.id === aliceId);

// Legacy (pre-Supabase-Auth) account: linked only after email confirmation.
await db().users.insert({ id: "u_legacy0001", name: "Bob", email: "bob@example.com", plan: "starter", createdAt: new Date().toISOString(), passwordHash: "scrypt$old" });
r = await call("GET", "/api/me", { token: "tok:auth-bob:bob@example.com:0" });
check("legacy account not linked before email confirmed", r.status === 403, String(r.status));
r = await call("GET", "/api/me", { token: "tok:auth-bob:bob@example.com:1" });
check("legacy account linked after confirmation (keeps plan)", r.data.user?.id === "u_legacy0001" && r.data.user?.plan === "starter", JSON.stringify(r.data));
r = await call("GET", "/api/me", { token: "tok:auth-mallory:bob@example.com:1" });
check("second login can't take a linked email", r.status === 409, String(r.status));

// --- bots ---
r = await call("POST", "/api/bots", { token: alice, json: { url: "example.com", templateId: "ecommerce" } });
const bot = r.data;
check("create bot", r.status === 200 && !!bot.id && bot.ownerId === aliceId, String(r.status));
r = await call("POST", "/api/bots", { token: alice, json: { url: "second.example" } });
check("free plan: second site blocked", r.status === 403, String(r.status));
r = await call("GET", "/api/bots", { token: "tok:auth-eve:eve@example.com:1" });
check("other user sees none", r.status === 200 && Array.isArray(r.data) && r.data.length === 0);
r = await call("PATCH", `/api/bots/${bot.id}`, { token: "tok:auth-eve:eve@example.com:1", json: { name: "hijack" } });
check("other user can't edit (404)", r.status === 404);
r = await call("PATCH", `/api/bots/${bot.id}`, { token: alice, json: { logoUrl: "javascript:alert(1)" } });
check("bad image URL rejected", r.status === 400);
r = await call("PATCH", `/api/bots/${bot.id}`, { token: alice, json: { welcomeMessage: "y".repeat(5000) } });
check("long text trimmed", r.status === 200 && r.data.welcomeMessage.length === 1000);
r = await call("PATCH", `/api/bots/${bot.id}`, { token: alice, body: "{bad", headers: { "Content-Type": "application/json" } });
check("malformed JSON → 400", r.status === 400);
r = await call("POST", `/api/bots/${bot.id}/publish`, { token: alice });
check("publish needs verification", r.status === 403);

// --- upload (free plan has no branding) ---
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const form = new FormData();
form.append("fieldName", "logoUrl");
form.append("file", new Blob([png], { type: "image/png" }), "logo.png");
r = await call("POST", `/api/bots/${bot.id}/upload`, { token: alice, body: form });
check("upload blocked on free plan", r.status === 403, String(r.status));

// --- test chats + needs-human ---
const cid = "cTEST" + Date.now();
r = await call("POST", `/api/bots/${bot.id}/test-messages`, { token: alice, json: { conversationId: cid, messages: [{ role: "visitor", text: "Bulk order?", toTeam: true }, { role: "bot", text: "Sent." }] } });
check("test message saved", r.status === 200);
r = await call("GET", `/api/bots/${bot.id}/conversations`, { token: alice });
check("conversation flagged needs-human", r.data.conversations?.[0]?.needsHuman === true);
r = await call("POST", `/api/bots/${bot.id}/conversations/${cid}/reply`, { token: alice, json: { text: "Sure!" } });
check("owner reply", r.status === 200);
r = await call("GET", `/api/bots/${bot.id}/conversations`, { token: alice });
check("reply clears flag", r.data.conversations?.[0]?.needsHuman === false);

// --- widget (public) ---
r = await call("GET", `/api/bot/${bot.id}/public`);
check("unpublished bot not public", r.status === 404);
r = await call("POST", `/api/bots/${bot.id}/orders`, { json: { name: "A", email: "a@b.co" } });
check("orders off → 403", r.status === 403);
r = await call("POST", `/api/bots/${bot.id}/orders`, { json: { name: { x: 1 }, email: "nope" } });
check("bad order → 400", r.status === 400);

// --- CSV ---
r = await call("GET", `/api/bots/${bot.id}/orders/export/csv`, { token: alice });
check("csv export", r.status === 200 && String(r.data).includes("ID,Name,Email") && /attachment/.test(r.headers.get("content-disposition") ?? ""));

// --- simulator: internal addresses refused ---
r = await call("POST", "/api/simulate", { json: { url: "http://127.0.0.1:8080" } });
check("simulator refuses internal address", r.status === 400, String(r.status));
r = await call("POST", "/api/simulate", { json: { url: "http://localhost" } });
check("simulator refuses localhost", r.status === 400, String(r.status));

// --- verification helpers (no network) ---
{
  const { parseSiteSignals, siteFetchError, dnsHostsFor, dnsRecordValue } = await import("../server/verify.js");
  const { BlockedAddress } = await import("../server/safeFetch.js");
  const html = `<!doctype html><html><head><title>x</title>
    <meta content=" tok123 " NAME="Syncave-Verification">
  </head><body>
    <meta name="sitebot-verification" content="legacy9">
    <script src="https://syncave.web.app/widget.js?id=bot111" async></script>
    <script src="/widget.js?id=bot222"></script>
    <script src="https://cdn.example.com/other.js?id=zzz"></script>
    <script src="https://x.example/widget.js"></script>
  </body></html>`;
  const s = parseSiteSignals(html, "https://shop.example.com/home");
  check("meta tag found anywhere, any case/order, trimmed", s.metaTokens.includes("tok123") && s.metaTokens.includes("legacy9"), JSON.stringify(s.metaTokens));
  check("widget scripts found with bot ids", s.widgetScripts.map((w) => w.botId).join(",") === "bot111,bot222", JSON.stringify(s.widgetScripts));
  check("relative widget src resolved to the site's host", s.widgetScripts[1].host === "shop.example.com");
  check("blocked → actionable message", /bot protection/.test(siteFetchError(new Error("HTTP 403"), "https://a.example").message));
  check("timeout → actionable message", /too long/.test(siteFetchError(Object.assign(new Error("x"), { name: "TimeoutError" }), "https://a.example").message));
  check("private address → 400", siteFetchError(new BlockedAddress("x"), "https://a.example").status === 400);
  check("dns hosts include parent for www", dnsHostsFor("https://www.shop.com/").join(",") === "www.shop.com,shop.com");
  check("dns record value", dnsRecordValue("sb_abc") === "syncave-verification=sb_abc");
}

// --- billing: manual payments ---
{
  const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: "image/png" });
  const payForm = (fields: Record<string, string>, proof = true) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (proof) f.append("proof", pngBlob, "receipt.png");
    return f;
  };
  const good = { plan: "starter", period: "monthly", method: "vodafone_cash", sender: "01012345678", reference: "TXN998877" };

  r = await call("POST", "/api/billing/requests", { token: alice, body: payForm({ ...good, plan: "agency" }) });
  check("agency can't be bought online", r.status === 400);
  r = await call("POST", "/api/billing/requests", { token: alice, body: payForm({ ...good, plan: "business" }) });
  check("business can't be bought online", r.status === 400);
  r = await call("POST", "/api/billing/requests", { token: alice, body: payForm({ ...good, reference: "" }) });
  check("reference required", r.status === 400);
  r = await call("POST", "/api/billing/requests", { token: alice, body: payForm({ ...good, amountEgp: "1" } as any) });
  const pay = r.data;
  check("payment submitted, amount computed by server", r.status === 201 && pay.amountEgp === 150 && pay.status === "pending" && pay.hasProof === true && !("proofPath" in pay), JSON.stringify(pay));
  r = await call("POST", "/api/billing/requests", { token: alice, body: payForm(good) });
  check("only one pending request at a time", r.status === 409);
  r = await call("GET", "/api/billing", { token: alice });
  check("customer sees own request", r.status === 200 && r.data.requests.length === 1 && r.data.plan === "free");

  // Admin is limited to ADMIN_EMAILS.
  r = await call("GET", "/api/admin/payments", { token: alice });
  check("non-admin can't see admin routes (404)", r.status === 404);
  const admin = "tok:auth-admin:minataallap@gmail.com:1:Mina";
  r = await call("GET", "/api/me", { token: admin });
  check("admin flagged on /me", r.data.user?.isAdmin === true);
  r = await call("GET", "/api/admin/payments", { token: admin });
  check("admin sees pending with receipt link", r.status === 200 && r.data.payments.length === 1 && !!r.data.payments[0].proofUrl && r.data.payments[0].user.email === "alice@example.com");
  r = await call("POST", `/api/admin/payments/${pay.id}/approve`, { token: admin });
  check("approve", r.status === 200 && r.data.plan === "starter");
  r = await call("POST", `/api/admin/payments/${pay.id}/approve`, { token: admin });
  check("can't approve twice", r.status === 409);
  // Token cache is 30 s, so read the account directly to confirm the plan change.
  const acct = await db().users.findByAuthId("auth-alice");
  const days = (Date.parse(acct!.planExpiresAt!) - Date.now()) / 86400000;
  check("plan active for about a month", acct?.plan === "starter" && days > 27 && days < 32, `${acct?.plan} ${days.toFixed(1)}d`);

  // Rejection with a reason; then a fresh request is allowed.
  r = await call("POST", "/api/billing/requests", { token: alice, body: payForm({ ...good, period: "yearly", method: "instapay", sender: "01098765432" }) });
  check("yearly = 1200 EGP", r.status === 201 && r.data.amountEgp === 1200);
  r = await call("POST", `/api/admin/payments/${r.data.id}/reject`, { token: admin, json: { note: "Amount not received" } });
  check("reject with note", r.status === 200);
  r = await call("GET", "/api/billing", { token: alice });
  check("customer sees rejection reason", r.data.requests[0].status === "rejected" && r.data.requests[0].note === "Amount not received");
  // An expired plan counts as Free.
  await db().users.setPlan(acct!.id, "starter", new Date(Date.now() - 1000).toISOString());
  const { toPublicUser } = await import("../server/auth.js");
  check("expired plan counts as free", toPublicUser((await db().users.findById(acct!.id))!).plan === "free");
}

// --- delete ---
r = await call("DELETE", `/api/bots/${bot.id}`, { token: alice });
check("delete bot", r.status === 200);

await fs.rm(dataDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Supabase Edge Function entry point ("api"). Bundled by scripts/build-api.mjs into
// supabase/functions/api/index.js, then deployed with `npm run deploy:api`.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createApp } from "./app.js";
import { supabaseTokenVerifier } from "./auth.js";
import { setDatabase } from "./db/index.js";
import { createSupabaseDatabase } from "./db/supabase.js";

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): unknown };

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

setDatabase(createSupabaseDatabase(url, key));
const app = createApp({ verifyToken: supabaseTokenVerifier(url, key) });

Deno.serve(app.fetch);

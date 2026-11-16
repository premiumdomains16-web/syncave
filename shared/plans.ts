// Plan limits — the single source of truth for what each plan may store.
// Server: enforced in server/routes/bots.ts (dashboard) and server/routes/public.ts (orders).
// Client: shown as usage meters and locked features in the dashboard.
// Keep in sync with the pricing copy in src/landing/content.ts.

import type { Plan } from "./types.js";

export interface PlanLimits {
  /** Websites per account; null = unlimited. */
  sites: number | null;
  /** Q&A pairs per website; null = unlimited. */
  questionsPerSite: number | null;
  /** Whether the chat may collect orders at all. */
  orders: boolean;
  /** Orders stored per website (oldest are dropped past this); null = unlimited. */
  ordersKept: number | null;
  /** Conversations stored per website (oldest activity dropped past this); null = unlimited. */
  conversationsKept: number | null;
  /** Logo and background image uploads. */
  branding: boolean;
  /** Max upload size for logo / background images. */
  uploadMB: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:     { sites: 1,    questionsPerSite: 20,   orders: false, ordersKept: 0,    conversationsKept: 100,   branding: false, uploadMB: 0 },
  starter:  { sites: 1,    questionsPerSite: null, orders: true,  ordersKept: 500,  conversationsKept: 1000,  branding: true,  uploadMB: 5 },
  business: { sites: 5,    questionsPerSite: null, orders: true,  ordersKept: 5000, conversationsKept: 10000, branding: true,  uploadMB: 5 },
  agency:   { sites: null, questionsPerSite: null, orders: true,  ordersKept: null, conversationsKept: null,  branding: true,  uploadMB: 5 },
};

export const PLAN_ORDER: Plan[] = ["free", "starter", "business", "agency"];

/**
 * Whether customers can buy paid plans (manual InstaPay / Vodafone Cash payment, see
 * shared/billing.ts). false = pricing shows "Coming soon" and sign-up is Free only.
 */
export const PAID_PLANS_AVAILABLE = true;

export const PLAN_NAMES: Record<Plan, string> = { free: "Free", starter: "Starter", business: "Business", agency: "Agency" };

/** Limits for a plan; accounts without a plan (legacy data) are treated as Free. */
export function limitsFor(plan: Plan | null | undefined): PlanLimits {
  return PLAN_LIMITS[plan && plan in PLAN_LIMITS ? plan : "free"];
}

/** The cheapest plan above `from` whose limits satisfy `ok`, or null if none does. */
export function nextPlanWhere(from: Plan, ok: (l: PlanLimits) => boolean): Plan | null {
  const start = PLAN_ORDER.indexOf(from) + 1;
  for (const p of PLAN_ORDER.slice(start)) if (ok(PLAN_LIMITS[p])) return p;
  return null;
}

export const formatLimit = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en-US"));

/** Why a bot can't be published on `plan`, or null when it's within limits. */
export function publishBlockers(plan: Plan, bot: { qa: unknown[]; enableOrders: boolean; logoUrl: string | null; backgroundImageUrl: string | null }): string[] {
  const l = limitsFor(plan);
  const out: string[] = [];
  if (l.questionsPerSite !== null && bot.qa.length > l.questionsPerSite) {
    out.push(`${PLAN_NAMES[plan]} includes up to ${l.questionsPerSite} questions per site — you have ${bot.qa.length}.`);
  }
  if (bot.enableOrders && !l.orders) out.push(`Order collection isn't included in ${PLAN_NAMES[plan]}. Turn it off in Appearance.`);
  if ((bot.logoUrl || bot.backgroundImageUrl) && !l.branding) out.push(`Logo and background images aren't included in ${PLAN_NAMES[plan]}. Remove them in Appearance.`);
  return out;
}

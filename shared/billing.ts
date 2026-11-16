// Manual payments (InstaPay / Vodafone Cash): prices, where customers send money,
// and who can approve payments. Used by the API (server/app.ts) and the dashboard.
import type { Plan } from "./types.js";

/** The plan customers can buy. (Business/Agency still exist for accounts set up by hand.) */
export type PaidPlan = "starter";
export const PAID_PLANS: PaidPlan[] = ["starter"];

export type BillingPeriod = "monthly" | "yearly";
export type PaymentMethod = "instapay" | "vodafone_cash";
export type PaymentStatus = "pending" | "approved" | "rejected";

/** Prices in EGP: the single source for the pricing page, the Billing page and the API. */
export const PRICES_EGP: Record<PaidPlan, Record<BillingPeriod, number>> = {
  starter: { monthly: 150, yearly: 1200 },
};

export function priceFor(plan: PaidPlan, period: BillingPeriod): number {
  return PRICES_EGP[plan][period];
}

/** How much yearly saves vs. 12 monthly payments, in percent (150 × 12 = 1800 → 1200 saves 33%). */
export function yearlySavingPct(plan: PaidPlan): number {
  const p = PRICES_EGP[plan];
  return Math.round((1 - p.yearly / (p.monthly * 12)) * 100);
}

/**
 * Where customers send the money. Shown on the dashboard's Billing page.
 * `name` is optional: when set, it's shown so customers can check the recipient name.
 */
export const PAYMENT_DETAILS = {
  instapay: {
    /** InstaPay mobile number (or payment address, e.g. name@instapay) */
    address: "01028847909",
    name: "",
  },
  vodafoneCash: {
    /** Vodafone Cash wallet number */
    number: "01028847909",
    name: "",
  },
};

/** True once real payment details are filled in above. */
export const PAYMENT_DETAILS_SET = !!PAYMENT_DETAILS.instapay.address && !!PAYMENT_DETAILS.vodafoneCash.number;

/**
 * Accounts that can review and approve payments (Admin page). Only list emails whose
 * account is already linked to your login; an unclaimed email could be signed up by anyone.
 */
export const ADMIN_EMAILS = ["minataallap@gmail.com"];

export const isAdminEmail = (email: string | undefined | null) => !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());

/** A plan whose paid period has ended counts as Free. */
export function effectivePlan(plan: Plan, expiresAt: string | null | undefined, now = Date.now()): Plan {
  if (plan === "free" || !expiresAt) return plan;
  return Date.parse(expiresAt) > now ? plan : "free";
}

/** New expiry after paying: extends an active same-plan period, otherwise starts now. */
export function extendExpiry(current: { plan: Plan; expiresAt: string | null | undefined }, plan: Plan, period: BillingPeriod, now = new Date()): string {
  const active = current.plan === plan && current.expiresAt && Date.parse(current.expiresAt) > now.getTime();
  const start = active ? new Date(current.expiresAt!) : new Date(now);
  start.setMonth(start.getMonth() + (period === "yearly" ? 12 : 1));
  return start.toISOString();
}

export interface PaymentRequest {
  id: string;
  userId: string;
  plan: PaidPlan;
  period: BillingPeriod;
  amountEgp: number;
  method: PaymentMethod;
  /** Phone number or InstaPay address the customer paid from. */
  sender: string;
  /** Transaction / reference number from the receipt. */
  reference: string;
  /** Storage path of the receipt screenshot in the private "payment-proofs" bucket. */
  proofPath: string | null;
  status: PaymentStatus;
  /** Reason shown to the customer when rejected. */
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

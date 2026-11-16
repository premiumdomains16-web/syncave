// Manual payments (InstaPay / Vodafone Cash): prices, where customers send money,
// and who can approve payments. Used by the API (server/app.ts) and the dashboard.
import type { Plan } from "./types.js";

/** Plans customers can buy themselves. Agency is custom-priced ("Contact us"). */
export type PaidPlan = "starter" | "business";
export const PAID_PLANS: PaidPlan[] = ["starter", "business"];

export type BillingPeriod = "monthly" | "yearly";
export type PaymentMethod = "instapay" | "vodafone_cash";
export type PaymentStatus = "pending" | "approved" | "rejected";

/** Monthly price in EGP. Yearly = 10 months (2 months free). Keep in sync with the pricing page. */
export const MONTHLY_PRICE_EGP: Record<PaidPlan, number> = { starter: 399, business: 1499 };

export function priceFor(plan: PaidPlan, period: BillingPeriod): number {
  const m = MONTHLY_PRICE_EGP[plan];
  return period === "yearly" ? m * 10 : m;
}

/**
 * Where customers send the money. Shown on the dashboard's Billing page.
 * TODO(owner): replace the placeholders with your real InstaPay address and wallet number.
 */
export const PAYMENT_DETAILS = {
  instapay: {
    /** InstaPay payment address (IPA), e.g. yourname@instapay */
    address: "yourname@instapay",
    /** Name the customer will see when sending */
    name: "Syncave",
  },
  vodafoneCash: {
    /** Vodafone Cash wallet number */
    number: "01000000000",
    name: "Syncave",
  },
};

/** True once the placeholders above have been replaced. */
export const PAYMENT_DETAILS_SET =
  PAYMENT_DETAILS.instapay.address !== "yourname@instapay" && PAYMENT_DETAILS.vodafoneCash.number !== "01000000000";

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

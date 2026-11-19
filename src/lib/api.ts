// Thin typed wrapper around the dashboard API (server/app.ts, running as the Supabase
// Edge Function "api"). Every call carries the Supabase Auth access token.
import type { Bot, BotPatch, ChatMessage, Conversation, Order, Plan, Unanswered } from '@shared/types';
import type { PaymentRequest, PaymentStatus } from '@shared/billing';
import { accessToken, API_BASE } from './supabase';

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await authed(path, init);
  } catch {
    throw new Error('Could not reach the server.');
  }
  if (res.status === 401) {
    // Session expired or logged out in another tab: go log in, then come back here.
    const next = window.location.pathname + window.location.hash;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    throw new Error('Please log in.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  listBots: () => request<Bot[]>('/api/bots'),
  createBot: (url: string, templateId: string) => request<Bot>('/api/bots', json('POST', { url, templateId })),
  patchBot: (id: string, patch: BotPatch) => request<Bot>(`/api/bots/${id}`, json('PATCH', patch)),
  deleteBot: (id: string) => request<{ success: true }>(`/api/bots/${id}`, { method: 'DELETE' }),
  verify: (id: string) => request<{ success: true; method: VerifyMethod; bot: Bot }>(`/api/bots/${id}/verify`, { method: 'POST' }),
  installStatus: (id: string) => request<InstallStatus>(`/api/bots/${id}/install-status`),
  publish: (id: string) => request<Bot>(`/api/bots/${id}/publish`, { method: 'POST' }),
  discard: (id: string) => request<Bot>(`/api/bots/${id}/discard`, { method: 'POST' }),
  orders: (id: string, { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) =>
    request<{ orders: Order[]; total: number }>(`/api/bots/${id}/orders?limit=${limit}&offset=${offset}`),
  unanswered: (id: string) => request<Unanswered[]>(`/api/bots/${id}/unanswered`),
  dismissUnanswered: (id: string, uid: string) => request<{ success: true }>(`/api/bots/${id}/unanswered/${uid}`, { method: 'DELETE' }),
  clearUnanswered: (id: string) => request<{ success: true }>(`/api/bots/${id}/unanswered`, { method: 'DELETE' }),
  conversations: (id: string, { limit = 30, offset = 0 }: { limit?: number; offset?: number } = {}) =>
    request<{ conversations: Conversation[]; total: number }>(`/api/bots/${id}/conversations?limit=${limit}&offset=${offset}`),
  conversation: (id: string, cid: string) => request<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/bots/${id}/conversations/${cid}`),
  replyConversation: (id: string, cid: string, text: string) => request<ChatMessage>(`/api/bots/${id}/conversations/${cid}/reply`, json('POST', { text })),
  deleteConversation: (id: string, cid: string) => request<{ success: true }>(`/api/bots/${id}/conversations/${cid}`, { method: 'DELETE' }),
  logTestMessages: (id: string, conversationId: string, messages: { role: 'visitor' | 'bot'; text: string; toTeam?: boolean }[], pageUrl = '') =>
    request<{ conversationId: string }>(`/api/bots/${id}/test-messages`, json('POST', { conversationId, pageUrl, messages })),
  testReplies: (id: string, cid: string, after?: string) =>
    request<{ messages: { id: string; text: string; createdAt: string }[] }>(`/api/bots/${id}/test-messages/${cid}${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  deleteTestConversations: (id: string) => request<{ deleted: number }>(`/api/bots/${id}/test-conversations`, { method: 'DELETE' }),
  billing: () => request<BillingInfo>('/api/billing'),
  submitPayment: (form: FormData) => request<OwnPayment>('/api/billing/requests', { method: 'POST', body: form }),
  adminPayments: (status: PaymentStatus) => request<{ payments: AdminPayment[] }>(`/api/admin/payments?status=${status}`),
  approvePayment: (id: string) => request<{ success: true; plan: string; planExpiresAt: string }>(`/api/admin/payments/${id}/approve`, { method: 'POST' }),
  adminUsers: (q = '') => request<{ users: AdminUser[] }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminSetPlan: (id: string, plan: Plan, months: number | null) => request<{ success: true; plan: Plan; planExpiresAt: string | null }>(`/api/admin/users/${id}/plan`, json('POST', { plan, months })),
  adminStats: () => request<AdminStats>('/api/admin/stats'),
  rejectPayment: (id: string, note: string) => request<{ success: true }>(`/api/admin/payments/${id}/reject`, json('POST', { note })),
  /** Downloads all orders as an Excel file (.xlsx), fetched with the sign-in token, then saved. */
  downloadOrdersExcel: async (id: string) => {
    const res = await authed(`/api/bots/${id}/orders/export/xlsx`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Download failed (${res.status})`);
    const name = res.headers.get('content-disposition')?.match(/filename="?([^";]+)/)?.[1] ?? `orders-${id}.xlsx`;
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  },
  upload: (id: string, field: 'logoUrl' | 'backgroundImageUrl', file: File) => {
    const form = new FormData();
    form.append('fieldName', field);
    form.append('file', file);
    return request<Partial<Bot>>(`/api/bots/${id}/upload`, { method: 'POST', body: form });
  },
};

export type VerifyMethod = 'meta' | 'snippet' | 'dns';
export type OwnPayment = Omit<PaymentRequest, 'proofPath' | 'userId'> & { hasProof: boolean };
export interface AdminUser { id: string; name: string; email: string; createdAt: string; plan: Plan; storedPlan: Plan; planExpiresAt: string | null; sites: number; hasPendingPayment: boolean; linked: boolean }
export interface AdminStats { users: number; newUsers30d: number; paying: number; expiringSoon: number; pendingPayments: number; revenueThisMonth: number; revenueTotal: number }
export interface BillingInfo { plan: Plan; planExpiresAt: string | null; requests: OwnPayment[] }
export type AdminPayment = Omit<PaymentRequest, 'proofPath'> & { proofUrl: string | null; user: { id: string; name: string; email: string; plan: Plan; planExpiresAt: string | null } | null };
export interface InstallStatus { installed: boolean; scripts: { src: string; host: string; botId: string | null }[]; checkedUrl: string }

/**
 * Public address of this website, where customers load widget.js from. Set VITE_SITE_URL
 * (e.g. your custom domain) to pin it; otherwise the address the dashboard is open on,
 * except locally, where it falls back to the live Firebase address.
 */
export const SITE_URL = (() => {
  const fixed = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '');
  if (fixed) return fixed;
  const local = /^(localhost$|127\.|10\.|192\.168\.)/.test(window.location.hostname);
  return local ? 'https://easybot-7be3f.web.app' : window.location.origin;
})();

export const SITE_HOST = new URL(SITE_URL).host;

export function embedSnippet(botId: string) {
  return `<script src="${SITE_URL}/widget.js?id=${botId}" async></script>`;
}

/** DNS TXT record that verifies ownership (alternative to the meta tag). */
export function verificationDnsRecord(token: string) {
  return `syncave-verification=${token}`;
}

export function verificationMetaTag(token: string) {
  return `<meta name="syncave-verification" content="${token}">`;
}

// Keyword-overlap matcher, English + Arabic (incl. Egyptian colloquial).
// Mirrors tokens()/bestMatch() in public/widget.js so the dashboard preview
// answers exactly like the live widget — change both together.
import type { QA } from '@shared/types';

const STOP = new Set([
  // English
  ...'a an the is are was were do does did how what when where why who which can could would should i my me you your we our this that of to in on at for with and or but if it its please tell know want much many'.split(' '),
  // Arabic (already normalized: ا not أ/إ, ي not ى, ه not ة)
  ...'في من علي الي عن ما ماذا كيف هل متي اين لماذا هو هي انا انت انتم نحن هذا هذه ذلك تلك التي الذي و او ثم مع كم عند لو ان يا اي لا لم لن قد كل بعض'.split(' '),
  // Egyptian colloquial
  ...'ازاي فين امتي ليه ايه عايز عاوزه عايزه عاوز عايزين عاوزين ممكن انا احنا ده دي دا بتاع بتاعكم عندكم كام بكام اعرف نعرف اسال سمحت حضرتك لو سمحت طيب بس برضه'.split(' '),
]);

/** Folds Arabic spelling variants so e.g. "الأسعار" and "الاسعار" compare equal. */
function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')       // diacritics (tashkeel) and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Light Arabic stemming: strip the definite article and attached conjunctions/prepositions. */
function stripArabicPrefix(t: string): string {
  for (const p of ['وال', 'بال', 'كال', 'فال', 'لل', 'ال']) {
    if (t.startsWith(p) && t.length - p.length >= 2) return t.slice(p.length);
  }
  if (t.length > 3 && (t[0] === 'و' || t[0] === 'ف')) return t.slice(1);
  return t;
}

export function tokens(s: string): string[] {
  return normalizeArabic(s.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map(stripArabicPrefix)
    .filter((t) => t && !STOP.has(t));
}

export function bestMatch(query: string, qa: QA[]): QA | null {
  const q = tokens(query);
  if (!q.length) return null;
  let best: QA | null = null;
  let bestScore = 0;
  for (const item of qa) {
    const t = tokens(item.question);
    if (!t.length) continue;
    const set = new Set(t);
    let hits = 0;
    for (const w of q) if (set.has(w)) hits++;
    const score = hits / Math.max(t.length, q.length);
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 0.34 ? best : null;
}

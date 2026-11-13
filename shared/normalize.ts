// Text normalization shared by the server (deduping unanswered questions) and
// the dashboard. Folds Arabic spelling variants the same way the matcher does
// (src/lib/matcher.ts / public/widget.js) so "الأسعار؟" and "الاسعار" count as one.

export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "") // diacritics (tashkeel) and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Dedupe key for a free-text question: case, punctuation and spelling-variant insensitive. */
export function questionKey(s: string): string {
  return normalizeArabic(s.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "ar" when most letters are Arabic, else "en" — used to tag the anonymized global log. */
export function scriptOf(s: string): "ar" | "en" {
  const arabic = (s.match(/[؀-ۿ]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  return arabic > latin ? "ar" : "en";
}

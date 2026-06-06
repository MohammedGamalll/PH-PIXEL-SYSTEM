/**
 * Normalize Arabic text so search ignores common variations.
 * - أ إ آ ٱ → ا
 * - ة → ه
 * - ى → ي
 * - ؤ → و, ئ → ي
 * - Remove tashkeel/diacritics
 * - Collapse whitespace, lowercase
 */
export function normalizeArabicText(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/[\u064B-\u065F\u0670]/g, "") // tashkeel
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // آ أ إ ٱ -> ا
    .replace(/\u0629/g, "\u0647") // ة -> ه
    .replace(/\u0649/g, "\u064A") // ى -> ي
    .replace(/\u0624/g, "\u0648") // ؤ -> و
    .replace(/\u0626/g, "\u064A") // ئ -> ي
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

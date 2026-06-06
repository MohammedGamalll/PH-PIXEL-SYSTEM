/** Normalize Arabic text: remove tashkeel/tatweel, unify hamza/alef/ya/ta marbuta, lowercase. */
export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/[\u064B-\u065F\u0640\u0670]/g, "") // tashkeel, tatweel, dagger alef
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}

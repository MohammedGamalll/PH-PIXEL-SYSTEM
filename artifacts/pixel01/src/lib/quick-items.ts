const STORAGE_KEY = "cashier_quick_items_v1";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  const next = Array.from(new Set(ids.filter(Boolean)));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("quick-items-changed"));
}

export function getQuickItemIds(): string[] {
  return readIds();
}

export function isQuickItem(productId: string): boolean {
  return readIds().includes(productId);
}

export function addQuickItem(productId: string) {
  const ids = readIds();
  if (!ids.includes(productId)) writeIds([...ids, productId]);
}

export function removeQuickItem(productId: string) {
  writeIds(readIds().filter((id) => id !== productId));
}

export function toggleQuickItem(productId: string): boolean {
  const ids = readIds();
  if (ids.includes(productId)) {
    writeIds(ids.filter((id) => id !== productId));
    return false;
  }
  writeIds([...ids, productId]);
  return true;
}

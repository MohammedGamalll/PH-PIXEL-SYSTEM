import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Receipt, Search, PauseCircle, Maximize2, Undo2, Calculator as CalcIcon,
  Info, LogOut, Plus, Minus, X, History, Image as ImageIcon, List as ListIcon,
  ArrowDownCircle, ArrowUpCircle, Star,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useContacts } from "@/hooks/use-contacts";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { useCategories, usePriceGroups } from "@/hooks/use-product-meta";
import { useCreateInvoice } from "@/hooks/use-invoices";
import { useCashierHotkeys } from "@/lib/cashier-hotkeys";
import { ReceiptPrintable } from "./ReceiptPrintable";
import { CloseSessionModal } from "./CloseSessionModal";
import { SessionDetailsModal } from "./SessionDetailsModal";
import { AddExpenseModal } from "./AddExpenseModal";
import { MultiPayModal } from "./MultiPayModal";
import { RecentTransactionsModal } from "./RecentTransactionsModal";
import { SelectExpiryDateModal } from "./SelectExpiryDateModal";
import { ContactPaymentModal } from "./ContactPaymentModal";
import { unitOptions, baseUnitsPer, toBase, formatBaseQuantity, type UnitLevel } from "@/lib/units";
import { usePromotions } from "@/hooks/use-promotions";
import { pickActivePromo, scalePromoForLevel } from "@/lib/promotions";
import { ReturnLookupModal } from "@/components/sales/ReturnLookupModal";
import { ReturnFormModal } from "@/components/sales/ReturnFormModal";
import { useI18n } from "@/lib/i18n";
import { normalizeArabicText } from "@/lib/arabic";
import { playAdd, playSuccess } from "@/lib/sounds";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { useCan } from "@/lib/can";
import { useOwnerId } from "@/lib/owner";
import { computeProductBatches } from "@/lib/product-batches";
import { useRecalcProductStock } from "@/hooks/use-recalc-stock";
import { getQuickItemIds } from "@/lib/quick-items";

type CartItem = {
  key: string;
  product: any;
  description: string;
  unitName: string;
  unitLevel: UnitLevel;
  originalPrice: number;
  discountAmount: number;
  unitPrice: number;
  quantity: number;
  discountValue: number;
  discountType: "fixed" | "percent";
  promoId?: string | null;
  expiryDate?: string | null;
};

type Props = { sessionId: string };

const POS_FONT = '"Segoe UI", Tahoma, Arial, sans-serif';

const win7Panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e3e5ea",
  borderRadius: 8,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d6d9de",
  background: "#fff",
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: POS_FONT,
  borderRadius: 6,
  color: "#1f2937",
};

const formatBalance = (val: number) => {
  const absVal = Math.abs(val).toFixed(2);
  if (val > 0) return `${absVal} (عليه)`;
  if (val < 0) return `${absVal} (له)`;
  return `0.00`;
};

export function CashierApp({ sessionId }: Props) {
  const { t, dir, lang } = useI18n();
  useRecalcProductStock();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: customers = [] } = useContacts("customer");
  const { data: customerBalances } = useContactBalances();
  const { data: categories = [] } = useCategories();
  const { data: priceGroups = [] } = usePriceGroups();
  const createInvoice = useCreateInvoice();
  const { data: promotions = [] } = usePromotions();
  const [payInOpen, setPayInOpen] = useState(false);
  const [payOutOpen, setPayOutOpen] = useState(false);


  const { can } = useCurrentEmployee();
  const { isAdmin, canSpecial } = useCan();
  const ownerId = useOwnerId();
  const [customerId, setCustomerId] = useState<string>("cash");
  const [priceGroupId, setPriceGroupId] = useState<string>("default");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const [editKind, setEditKind] = useState<null | "discount" | "tax" | "shipping">(null);
  const [itemEditFor, setItemEditFor] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("0");
  const [multiPayOpen, setMultiPayOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false);
  const [suspendedOpen, setSuspendedOpen] = useState(false);
  const [suspendedList, setSuspendedList] = useState<any[]>([]);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [returnLookupOpen, setReturnLookupOpen] = useState(false);
  const [returnFormFor, setReturnFormFor] = useState<any | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ openingCash: number; openedAt: string; warehouseId: string | null } | null>(null);
  // System locked to the single main pharmacy stock (products.stock). No secondary warehouses.
  const sessionWarehouseId: string | null = null;
  const [showImages, setShowImages] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("cashier_show_images") !== "0";
  });
  const [mobilePanel, setMobilePanel] = useState<"products" | "cart">("cart");
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("cashier_show_images", showImages ? "1" : "0");
  }, [showImages]);
  const [expiryFor, setExpiryFor] = useState<any | null>(null);
  const [showExtraTotals, setShowExtraTotals] = useState<boolean>(false);
  const [win7Error, setWin7Error] = useState<string | null>(null);

  const [productsRaw, setProductsRaw] = useState<any[]>([]);
  const [quickItemIds, setQuickItemIds] = useState<string[]>([]);
  const [stockRefreshKey, setStockRefreshKey] = useState(0);
  const [batchStockMap, setBatchStockMap] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase.from("products") as any).select("*").order("name");
      setProductsRaw((data ?? []).filter((p: any) => p.is_active !== false));
    })();
  }, [user, stockRefreshKey]);

  useEffect(() => {
    const load = () => setQuickItemIds(getQuickItemIds());
    load();
    window.addEventListener("quick-items-changed", load as EventListener);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("quick-items-changed", load as EventListener);
      window.removeEventListener("storage", load);
    };
  }, []);

  const [pwsMap, setPwsMap] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!sessionWarehouseId) { setPwsMap({}); return; }
    (async () => {
      const { data } = await supabase
        .from("product_warehouse_stock")
        .select("product_id, stock")
        .eq("warehouse_id", sessionWarehouseId);
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) m[r.product_id] = Number(r.stock ?? 0);
      setPwsMap(m);
    })();
  }, [sessionWarehouseId, productsRaw, stockRefreshKey]);

  const products = useMemo(
    () => productsRaw.map((p) => ({ ...p, stock: sessionWarehouseId ? (pwsMap[p.id] ?? 0) : Number(p.stock ?? 0) })),
    [productsRaw, pwsMap, sessionWarehouseId],
  );

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("cashier_sessions" as any) as any)
        .select("opening_cash, opened_at, warehouse_id")
        .eq("id", sessionId)
        .maybeSingle();
      if (data) setSessionInfo({ openingCash: Number(data.opening_cash || 0), openedAt: data.opened_at, warehouseId: (data as any).warehouse_id ?? null });
    })();
  }, [sessionId]);

  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownItemRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [productsPanelOpen, setProductsPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cashier_products_panel") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("cashier_products_panel", productsPanelOpen ? "1" : "0");
  }, [productsPanelOpen]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // While the cashier is on screen, redirect ALL toast.error calls (from this
  // page or any hook it triggers) into the red Win7-style modal.
  useEffect(() => {
    const origError = toast.error;
    (toast as any).error = (msg: any) => {
      const text = typeof msg === "string" ? msg : (msg?.message ?? String(msg ?? "خطأ"));
      setWin7Error(text);
      return "" as any;
    };
    return () => { (toast as any).error = origError; };
  }, []);

  // Keep input flow on product search after adding an item.
  useEffect(() => {
    if (!lastAddedKey) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [lastAddedKey]);

  // Keyboard navigation across cart rows (↑/↓) + Esc to clear selection.
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (node as any).isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (cart.length === 0) return;
      if (e.key === "Escape") { setSelectedRowKey(null); return; }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      const idx = Math.max(0, cart.findIndex((c) => c.key === selectedRowKey));
      const cur = selectedRowKey ? idx : -1;
      const next = e.key === "ArrowDown"
        ? Math.min(cart.length - 1, cur + 1)
        : Math.max(0, cur - 1);
      setSelectedRowKey(cart[next]?.key ?? null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart, selectedRowKey]);

  // Click outside the cart table clears the selection.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest(".cashier-cart-table")) setSelectedRowKey(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);


  // ── Draft autosave (offline-friendly) ──
  const DRAFT_KEY = `cashier_draft_${sessionId}`;
  // Restore on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.cart) && parsed.cart.length > 0) {
        setCart(parsed.cart);
        setDiscount(Number(parsed.discount || 0));
        setTax(Number(parsed.tax || 0));
        setShipping(Number(parsed.shipping || 0));
        if (parsed.customerId) setCustomerId(parsed.customerId);
        toast.info("تم استرجاع مسودة الفاتورة المحفوظة");
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  // Save on change
  useEffect(() => {
    try {
      if (cart.length === 0) {
        window.localStorage.removeItem(DRAFT_KEY);
        return;
      }
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, discount, tax, shipping, customerId }));
    } catch { /* ignore quota */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, discount, tax, shipping, customerId]);



  const filteredProducts = useMemo(() => {
    const s = normalizeArabicText(search);
    const quickOnly = search.trim() === "*";
    const source = quickOnly
      ? products.filter((p) => quickItemIds.includes(p.id))
      : products;
    return source.filter((p) => {
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      if (quickOnly) return true;
      if (!s) return true;
      return (
        normalizeArabicText(p.name).includes(s) ||
        normalizeArabicText(p.name_en || "").includes(s) ||
        normalizeArabicText(p.sku || "").includes(s)
      );
    });
  }, [products, categoryFilter, search, quickItemIds]);

  const totalQty = cart.reduce((a, b) => a + b.quantity, 0);
  const subtotal = cart.reduce((a, b) => a + b.unitPrice * b.quantity, 0);
  const grandTotal = Math.max(0, subtotal - discount + tax + shipping);

  const priceForLevel = (p: any, level: UnitLevel) => {
    const perMain = baseUnitsPer(p, "main") || 1;
    const perLevel = baseUnitsPer(p, level);
    return Number(((Number(p.price) || 0) * (perLevel / perMain)).toFixed(2));
  };

  const stockLimitFor = (p: any, expiry: string | null | undefined) => {
    const map = batchStockMap[p.id];
    if (expiry && map?.[expiry] != null) return map[expiry];
    if (map && Object.keys(map).length > 0) {
      return Object.values(map).reduce((s, v) => s + v, 0);
    }
    return Number(p.stock || 0);
  };

  const addProductWithExpiry = (p: any, expiry: string | null) => {
    const stockBase = stockLimitFor(p, expiry);
    if (stockBase <= 0) {
      toast.error(t("sales.cashier.toast.no_stock"));
      return;
    }
    const opts = unitOptions(p);
    const main = opts[0] ?? { level: "main" as UnitLevel, name: p.main_unit || p.unit || "", ratio: 1 };
    const key = `${p.id}-${main.level}${expiry ? `-${expiry}` : ""}`;
    const basePrice = priceForLevel(p, main.level);
    const promo = pickActivePromo(p, promotions as any);
    const scaled = scalePromoForLevel(p, main.level, basePrice, promo);

    const existing = cart.find((c) => c.key === key);
    const otherRowsBase = cart
      .filter((c) => c.product.id === p.id && c.key !== key)
      .reduce((s, c) => s + toBase(c.quantity, c.unitLevel, c.product), 0);
    const proposedQty = (existing?.quantity ?? 0) + 1;
    const proposedBase = otherRowsBase + toBase(proposedQty, main.level, p);
    if (proposedBase > stockBase) {
      toast.error(t("sales.cashier.toast.over_stock"));
      return;
    }

    setCart((prev) => {
      const exists = prev.find((c) => c.key === key);
      if (exists) {
        return prev.map((c) => c.key === key ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [
        ...prev,
        {
          key,
          product: p,
          description: p.name,
          unitName: main.name,
          unitLevel: main.level,
          originalPrice: scaled.originalPrice,
          discountAmount: scaled.discountAmount,
          unitPrice: scaled.finalPrice,
          quantity: 1,
          discountValue: scaled.discountAmount,
          discountType: "fixed",
          promoId: promo?.id ?? null,
          expiryDate: expiry,
        },
      ];
    });
    setLastAddedKey(key);
    requestAnimationFrame(() => searchRef.current?.focus());
    playAdd();
  };

  const addProduct = async (p: any) => {
    const today = new Date().toISOString().slice(0, 10);
    const batches = await computeProductBatches(p.id);
    const valid = batches.filter(
      (b) => b.expiry_date && b.remaining > 0 && b.expiry_date >= today,
    );
    const batchMap = Object.fromEntries(valid.map((b) => [b.expiry_date, b.remaining]));
    setBatchStockMap((prev) => ({ ...prev, [p.id]: batchMap }));

    const available = valid.map((b) => b.expiry_date).sort();

    if (available.length === 1) {
      addProductWithExpiry(p, available[0]);
      return;
    }
    if (available.length > 1) {
      setExpiryFor(p);
      return;
    }
    const hasExpiryStock = batches.some((b) => b.expiry_date && b.remaining > 0);
    if (hasExpiryStock || p?.has_expiry === true) {
      setWin7Error(`المنتج «${p.name}» لا توجد له دفعات صلاحية سارية — لا يمكن بيعه.`);
      return;
    }
    addProductWithExpiry(p, null);
  };

  // Auto-add when exactly one product matches the search
  useEffect(() => {
    const s = search.trim();
    if (!s) return;
    if (filteredProducts.length !== 1) return;
    const id = window.setTimeout(() => {
      addProduct(filteredProducts[0]);
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filteredProducts]);


  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const list = filteredProducts.slice(0, 50);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.length === 0) return;
      setActiveIndex((i) => {
        const next = Math.min(list.length - 1, i + 1);
        requestAnimationFrame(() => dropdownItemRefs.current[next]?.scrollIntoView({ block: "nearest" }));
        return next;
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      setActiveIndex((i) => {
        const next = Math.max(0, i - 1);
        requestAnimationFrame(() => dropdownItemRefs.current[next]?.scrollIntoView({ block: "nearest" }));
        return next;
      });
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSearch("");
      return;
    }
    if (e.key === "Enter") {
      const s = search.trim();
      if (!s) return;
      // Prefer the highlighted result if any
      if (list.length > 0) {
        const target = list[Math.min(activeIndex, list.length - 1)];
        const out = Number(target.stock || 0) <= 0;
        if (!out) {
          addProduct(target);
          setSearch("");
          return;
        }
      }
      const exact = products.find(
        (p) => (p.sku || "").toLowerCase() === s.toLowerCase() ||
               (p.name || "").toLowerCase() === s.toLowerCase()
      );
      if (exact) {
        addProduct(exact);
        setSearch("");
      }
    }
  };

  const updateQty = (key: string, q: number) => {
    if (q <= 0) {
      setCart((c) => c.filter((x) => x.key !== key));
      return;
    }
    setCart((c) => c.map((x) => {
      if (x.key !== key) return x;
      const stockBase = stockLimitFor(x.product, x.expiryDate);
      const otherRowsBase = c
        .filter((r) => r.product.id === x.product.id && r.key !== key)
        .reduce((s, r) => s + toBase(r.quantity, r.unitLevel, r.product), 0);
      const proposedBase = otherRowsBase + toBase(q, x.unitLevel, x.product);
      if (proposedBase > stockBase) {
        const perUnit = baseUnitsPer(x.product, x.unitLevel) || 1;
        const maxQty = Math.max(0, Math.floor((stockBase - otherRowsBase) / perUnit));
        toast.error(t("sales.cashier.toast.over_stock"));
        return { ...x, quantity: maxQty };
      }
      return { ...x, quantity: q };
    }).filter((x) => x.quantity > 0));
  };
  const updateUnit = (key: string, level: UnitLevel) => {
    setCart((c) =>
      c.map((x) => {
        if (x.key !== key) return x;
        const opts = unitOptions(x.product);
        const next = opts.find((o) => o.level === level);
        if (!next) return x;

        const stockBase = stockLimitFor(x.product, x.expiryDate);
        const otherRowsBase = c
          .filter((r) => r.product.id === x.product.id && r.key !== key)
          .reduce((s, r) => s + toBase(r.quantity, r.unitLevel, r.product), 0);
        const perUnit = baseUnitsPer(x.product, level) || 1;
        const maxQty = Math.max(0, Math.floor((stockBase - otherRowsBase) / perUnit));
        let newQty = x.quantity;
        if (newQty > maxQty) {
          toast.error(t("sales.cashier.toast.over_stock"));
          newQty = maxQty;
        }
        if (newQty <= 0) return x;

        const basePrice = priceForLevel(x.product, level);
        // If user has applied a manual discount, keep it; otherwise re-apply promo for the new unit
        const hasManual = (Number(x.discountValue) || 0) > 0 && !x.promoId;
        if (hasManual) {
          const dv = Number(x.discountValue) || 0;
          const discAmt = x.discountType === "percent" ? basePrice * (dv / 100) : dv;
          const clamped = Math.max(0, Math.min(basePrice, discAmt));
          return {
            ...x,
            unitLevel: level,
            unitName: next.name,
            originalPrice: basePrice,
            discountAmount: clamped,
            unitPrice: Math.max(0, basePrice - clamped),
            promoId: null,
            quantity: newQty,
          };
        }
        const promo = (promotions as any[]).find((pp) => pp.id === x.promoId) ?? pickActivePromo(x.product, promotions as any);
        const scaled = scalePromoForLevel(x.product, level, basePrice, promo);
        return {
          ...x,
          unitLevel: level,
          unitName: next.name,
          originalPrice: scaled.originalPrice,
          discountAmount: scaled.discountAmount,
          unitPrice: scaled.finalPrice,
          discountValue: scaled.discountAmount,
          discountType: "fixed",
          promoId: promo?.id ?? null,
          quantity: newQty,
        };
      }),
    );
  };
  const updatePrice = (_key: string, _price: number) => {
    toast.error("تعديل سعر الصنف في الكاشير مقفول");
  };
  const updateDiscount = (key: string, value: number, type?: "fixed" | "percent") => {
    setCart((c) => c.map((x) => {
      if (x.key !== key) return x;
      const t = type ?? x.discountType;
      const v = Math.max(0, Number(value) || 0);
      const original = x.originalPrice;
      const rawDisc = t === "percent" ? original * (v / 100) : v;
      const disc = Math.max(0, Math.min(original, rawDisc));
      return {
        ...x,
        discountValue: v,
        discountType: t,
        discountAmount: disc,
        unitPrice: Math.max(0, original - disc),
        promoId: null,
      };
    }));
  };
  const updateDescription = (key: string, description: string) =>
    setCart((c) => c.map((x) => (x.key === key ? { ...x, description } : x)));
  const removeRow = (key: string) => {
    const removed = cart.find((x) => x.key === key);
    if (removed && ownerId) {
      // entity_id is a uuid column → use the product id (or a generated uuid) so the row is accepted.
      const entityUuid = removed.product?.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`);
      void (async () => {
        const { error } = await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "cashier_removed_item",
          entity_id: entityUuid,
          entity_label: removed.description,
          snapshot: {
            session_id: sessionId,
            removed_at: new Date().toISOString(),
            customer_id: customerId,
            customer_name: customerName,
            performed_by_account: user?.email ?? null,
            item: {
              key: removed.key,
              product_id: removed.product?.id ?? null,
              sku: removed.product?.sku ?? null,
              description: removed.description,
              unit_level: removed.unitLevel,
              unit_name: removed.unitName,
              quantity: removed.quantity,
              original_price: removed.originalPrice,
              discount_amount: removed.discountAmount,
              final_unit_price: removed.unitPrice,
              total: removed.unitPrice * removed.quantity,
              expiry_date: removed.expiryDate ?? null,
            },
          },
          deleted_by: user?.id ?? null,
        });
        if (error) console.warn("cashier soft-delete log failed", error);
      })();
    }
    setCart((c) => c.filter((x) => x.key !== key));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setTax(0);
    setShipping(0);
    setLastAddedKey(null);
    setSearch("");
    setCustomerId("cash");
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const [printing, setPrinting] = useState<null | { invoice: any; items: any[]; customerName?: string; payments?: { label: string; amount: number }[] }>(null);

  const buildItems = () => cart.map((c) => ({
    product_id: c.product.id,
    description: c.description,
    quantity: c.quantity,
    unit_price: c.originalPrice,
    discount_amount: c.discountAmount * c.quantity,
    total: c.unitPrice * c.quantity,
    unit_name: c.unitName,
    base_quantity: toBase(c.quantity, c.unitLevel, c.product),
    sold_price_at_time: c.unitPrice,
    promotional_discount_id: c.promoId ?? null,
    expiry_date: c.expiryDate ?? null,
  }));

  type Kind = "draft" | "quotation" | "suspend" | "credit" | "card" | "cash" | "multi";

  const customerName = (() => {
    if (customerId === "cash") return t("sales.cashier.cash_customer");
    const c: any = customers.find((x: any) => x.id === customerId);
    return c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : t("sales.cashier.cash_customer");
  })();

  const submit = async (kind: Kind, multiPayments?: { label: string; amount: number }[]) => {
    if (kind === "cancel" as any) return;
    if (kind === "credit" && !can("cashier", "sell_on_credit")) {
      toast.error("لا تملك صلاحية البيع الآجل");
      return;
    }
    if (kind === "credit" && customerId === "cash") {
      toast.error("لا يمكن تسجيل آجل على الزبون النقدي");
      return;
    }
    if (cart.length === 0 && kind !== "suspend") {
      toast.error(t("sales.cashier.toast.cart_empty"));
      return;
    }

    let type: "sale" | "draft" | "quotation" = "sale";
    let payment_status: "paid" | "unpaid" | "partial" = "paid";
    let payment_method: string | null = "cash";
    let notes: string | null = null;
    let paid_amount = grandTotal;
    let status = "final";

    switch (kind) {
      case "draft":
        type = "draft"; status = "draft"; payment_status = "unpaid"; payment_method = null; paid_amount = 0; break;
      case "quotation":
        type = "quotation"; status = "draft"; payment_status = "unpaid"; payment_method = null; paid_amount = 0; break;
      case "suspend":
        type = "draft"; status = "draft"; payment_status = "unpaid"; payment_method = null; paid_amount = 0;
        notes = "[SUSPENDED]"; break;
      case "credit":
        type = "sale"; payment_status = "unpaid"; payment_method = "credit"; paid_amount = 0; break;
      case "card":
        type = "sale"; payment_status = "paid"; payment_method = "card"; paid_amount = grandTotal; break;
      case "cash":
        type = "sale"; payment_status = "paid"; payment_method = "cash"; paid_amount = grandTotal; break;
      case "multi":
        type = "sale"; payment_method = "multi";
        paid_amount = (multiPayments || []).reduce((a, b) => a + b.amount, 0);
        payment_status = paid_amount >= grandTotal ? "paid" : paid_amount > 0 ? "partial" : "unpaid";
        notes = (multiPayments || []).map((p) => `${p.label}: ${p.amount}`).join(" | ");
        break;
    }

    try {
      const id = await createInvoice.mutateAsync({
        type,
        customer_id: customerId === "cash" ? null : customerId,
        issue_date: new Date().toISOString().slice(0, 10),
        notes,
        status,
        subtotal,
        tax,
        discount,
        shipping_cost: shipping,
        total: grandTotal,
        paid_amount,
        payment_status,
        payment_method,
        session_id: sessionId,
        warehouse_id: sessionWarehouseId,
        items: buildItems(),
      });

      playSuccess();
      setStockRefreshKey((k) => k + 1);
      if (kind === "cash" || kind === "card" || kind === "multi") {
        const { data: inv } = await (supabase.from("invoices") as any)
          .select("*").eq("id", id).maybeSingle();
        setPrinting({
          invoice: inv,
          items: buildItems(),
          customerName,
          payments: multiPayments,
        });
      } else {
        clearCart();
      }
    } catch {
      // toast already shown by hook
    }
  };

  useEffect(() => {
    if (!printing) return;
    const raf = requestAnimationFrame(() => {
      setTimeout(() => window.print(), 100);
    });
    const onAfter = () => {
      setPrinting(null);
      clearCart();
    };
    window.addEventListener("afterprint", onAfter);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("afterprint", onAfter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  useCashierHotkeys({
    onCash: () => submit("cash"),
    onCard: () => submit("card"),
    onCredit: () => submit("credit"),
    onCancel: () => clearCart(),
    onDraft: () => submit("draft"),
    onMultiPay: () => setMultiPayOpen(true),
    onSuspend: () => submit("suspend"),
    onQuotation: () => submit("quotation"),
    onQuickItems: () => openQuickItems(),
    onDiscount: () => { if (!can("cashier", "invoice_discount")) { toast.error("غير مصرّح بالخصم على الفاتورة"); return; } setEditKind("discount"); setEditValue(String(discount)); },
    onTax: () => { setEditKind("tax"); setEditValue(String(tax)); },
    onFocusSearch: () => searchRef.current?.focus(),
    onFocusLastQty: () => {
      if (lastAddedKey && qtyRefs.current[lastAddedKey]) {
        qtyRefs.current[lastAddedKey]!.focus();
        qtyRefs.current[lastAddedKey]!.select();
      }
    },
  });

  const openQuickItems = () => {
    setProductsPanelOpen(true);
    setSearch("*");
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const openEdit = (kind: "discount" | "tax" | "shipping") => {
    setEditKind(kind);
    setEditValue(String(kind === "discount" ? discount : kind === "tax" ? tax : shipping));
  };
  const applyEdit = () => {
    const v = Number(editValue) || 0;
    if (editKind === "discount") setDiscount(v);
    if (editKind === "tax") setTax(v);
    if (editKind === "shipping") setShipping(v);
    setEditKind(null);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };

  const openSuspended = async () => {
    const { data } = await (supabase.from("invoices") as any)
      .select("*")
      .eq("type", "draft")
      .ilike("notes", "%[SUSPENDED]%")
      .order("created_at", { ascending: false })
      .limit(50);
    setSuspendedList(data ?? []);
    setSuspendedOpen(true);
  };

  const resumeSuspended = async (inv: any) => {
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", inv.id);
    const newCart: CartItem[] = (items ?? []).map((it: any, idx: number) => {
      const p = products.find((x) => x.id === it.product_id) || { id: it.product_id, name: it.description };
      const qty = Number(it.quantity) || 1;
      const original = Number(it.unit_price) || 0;
      const lineDiscount = Number(it.discount_amount) || 0;
      const perUnitDiscount = qty > 0 ? lineDiscount / qty : 0;
      const finalPrice = Number(it.sold_price_at_time ?? (original - perUnitDiscount));
      return {
        key: `${it.product_id || "x"}-${idx}`,
        product: p,
        description: it.description,
        unitName: it.unit_name || "",
        unitLevel: "main" as UnitLevel,
        originalPrice: original,
        discountAmount: perUnitDiscount,
        unitPrice: finalPrice,
        quantity: qty,
        discountValue: perUnitDiscount,
        discountType: "fixed",
        promoId: it.promotional_discount_id ?? null,
      };
    });
    setCart(newCart);
    setDiscount(Number(inv.discount || 0));
    setTax(Number(inv.tax || 0));
    setShipping(Number(inv.shipping_cost || 0));
    setCustomerId(inv.customer_id || "cash");
    await supabase.from("invoices").delete().eq("id", inv.id);
    setSuspendedOpen(false);
    toast.success(t("sales.cashier.toast.resumed"));
  };

  const onSessionClosed = () => {
    setCloseSessionOpen(false);
    navigate({ to: "/sales/cashier-session" });
  };

  const editTitle =
    editKind === "discount" ? t("sales.cashier.edit_discount")
    : editKind === "tax" ? t("sales.cashier.edit_tax")
    : t("sales.cashier.edit_shipping");

  return (
    <div dir={dir} style={{ background: "#f5f6f8", height: "100%", color: "#1f2937", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: POS_FONT, fontWeight: 700 }}>
      {/* Responsive styles injection */}
      <style>{`
        @media (max-width: 767px) {
          .cashier-toolbar {
            gap: 0 !important;
            padding: 4px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            flex-wrap: nowrap !important;
            -webkit-overflow-scrolling: touch;
          }
          .cashier-toolbar button { margin: 2px !important; padding: 5px 8px !important; font-size: 11px !important; white-space: nowrap !important; }
          .cashier-mobile-tabs { display: flex !important; }
          .cashier-main-pane { flex-direction: column !important; padding: 4px !important; gap: 4px !important; }
          .cashier-products-panel { width: 100% !important; flex-shrink: 1 !important; }
          .cashier-cart-header { grid-template-columns: 1fr !important; gap: 8px !important; }
          .cashier-cart-header > div:last-child { grid-column: auto !important; }
          .cashier-cart-table table { min-width: 550px !important; }
          .cashier-actions { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 5px !important; padding: 5px !important; }
          .cashier-hint-text { display: none !important; }
          .cashier-mobile-hidden-cart { display: none !important; }
          .cashier-mobile-hidden-products { display: none !important; }
        }
        @media (max-width: 480px) {
          .cashier-actions { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          .cashier-actions button { font-size: 12px !important; min-height: 44px !important; }
        }
        @media (min-width: 768px) {
          .cashier-mobile-tabs { display: none !important; }
        }
      `}</style>
      {/* Toolbar (stacked below navbar) */}
      <div className="no-print cashier-toolbar" style={{
        background: "#ffffff",
        borderBottom: "1px solid #e3e5ea",
        display: "flex", padding: 10, alignItems: "center", flexWrap: "wrap",
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        fontFamily: POS_FONT,
      }}>
        <ToolbarBtn icon={<Receipt size={14} />} label={t("sales.cashier.add_expense")} bg="#fde2e2" fg="#c43a4d" onClick={() => setExpenseOpen(true)} />
        <ToolbarBtn icon={<Search size={14} />} label={t("sales.cashier.search_items")} bg="#ece5f9" fg="#7b5cd6" onClick={() => searchRef.current?.focus()} />
        <ToolbarBtn icon={<Star size={14} />} label={lang === "ar" ? "الأصناف السريعة" : "Quick Items"} bg="#fdf1c8" fg="#b7791f" onClick={openQuickItems} />
        <ToolbarBtn icon={<PauseCircle size={14} />} label={t("sales.cashier.suspended")} bg="#e2eefc" fg="#3b82f6" onClick={openSuspended} />
        <ToolbarBtn icon={<History size={14} />} label={t("sales.cashier.recent")} bg="#eceef2" fg="#5a6577" onClick={() => setRecentOpen(true)} />
        <ToolbarBtn icon={<ArrowDownCircle size={14} />} label={t("sales.cashier.pay_in")} bg="#d8ece6" fg="#2b9d7b" onClick={() => setPayInOpen(true)} />
        <ToolbarBtn icon={<ArrowUpCircle size={14} />} label={t("sales.cashier.pay_out")} bg="#fde6d2" fg="#d97a2b" onClick={() => setPayOutOpen(true)} />
        <ToolbarBtn icon={<Undo2 size={14} />} label={t("sales.cashier.returns")} bg="#e3e7d8" fg="#7a8c4a" onClick={() => setReturnLookupOpen(true)} />
        <ToolbarBtn icon={<Undo2 size={14} />} label={lang === "ar" ? "مرتجع حر" : "Standalone return"} bg="#fef3c7" fg="#b45309" onClick={() => navigate({ to: "/returns/standalone", search: { sessionId } })} />
        <ToolbarBtn icon={<CalcIcon size={14} />} label={t("sales.cashier.calculator")} bg="#fdf1c8" fg="#c79b1f" onClick={() => setCalcOpen(true)} />
        <ToolbarBtn
          icon={productsPanelOpen ? <ListIcon size={14} /> : <ImageIcon size={14} />}
          label={productsPanelOpen ? t("sales.cashier.hide_products") : t("sales.cashier.show_products")}
          bg="#d9ecf2" fg="#3b8aa3"
          onClick={() => setProductsPanelOpen((v) => !v)}
        />
        <ToolbarBtn icon={<Maximize2 size={14} />} label={t("sales.cashier.fullscreen")} bg="#dfe3ea" fg="#3a4658" onClick={toggleFullscreen} />
        {(isAdmin || canSpecial("pos", "session_details")) && (
          <ToolbarBtn icon={<Info size={14} />} label={t("sales.cashier.session_details")} bg="#f5d8e0" fg="#c84c75" onClick={() => setSessionDetailsOpen(true)} />
        )}
        {(isAdmin || canSpecial("pos", "end_session")) && (
          <ToolbarBtn icon={<LogOut size={14} />} label={t("sales.cashier.end_session")} bg="#f7c8c8" fg="#c43232" onClick={() => setCloseSessionOpen(true)} />
        )}
      </div>




      {/* Mobile tab switcher — only visible on small screens */}
      <div className="cashier-mobile-tabs no-print" style={{ display: "none", background: "#fff", borderBottom: "2px solid #e3e5ea", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setMobilePanel("cart")}
          style={{
            flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 800, fontFamily: POS_FONT,
            background: mobilePanel === "cart" ? "#1a2a4a" : "#f5f6f8",
            color: mobilePanel === "cart" ? "#fff" : "#6b7280",
            border: "none", cursor: "pointer",
            borderBottom: mobilePanel === "cart" ? "3px solid #5bb98a" : "3px solid transparent",
          }}
        >
          🛒 سلة المشتريات {cart.length > 0 && `(${cart.length})`}
        </button>
        <button
          type="button"
          onClick={() => { setMobilePanel("products"); setProductsPanelOpen(true); }}
          style={{
            flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 800, fontFamily: POS_FONT,
            background: mobilePanel === "products" ? "#1a2a4a" : "#f5f6f8",
            color: mobilePanel === "products" ? "#fff" : "#6b7280",
            border: "none", cursor: "pointer",
            borderBottom: mobilePanel === "products" ? "3px solid #5bb98a" : "3px solid transparent",
          }}
        >
          📦 الأصناف
        </button>
      </div>

      {/* Main pane — bill on one side, optional products grid on the other */}
      <div className="no-print cashier-main-pane" style={{ display: "flex", flexDirection: "row", gap: 8, padding: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>


        {/* Cart panel */}
        <div
          className={mobilePanel === "products" ? "cashier-mobile-hidden-cart" : ""}
          style={{ ...win7Panel, padding: 12, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden", flex: 1, fontFamily: POS_FONT }}
        >
          {/* Header row: customer | search | price-group */}
          <div className="cashier-cart-header" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                <option value="cash">{t("sales.cashier.cash_customer")}</option>
                {customers.map((c: any) => (
                  <option key={c.id} value={c.id}>{`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.business_name}</option>
                ))}
              </select>
              {customerId !== "cash" && (() => {
                const cust = (customers as any[]).find((c) => c.id === customerId);
                if (!cust) return null;
                const info = computeContactDue(cust, customerBalances?.get(customerId));
                if (Math.abs(info.gross) < 0.01) return null;
                return (
                  <div style={{
                    fontSize: 11, marginTop: 4, padding: "4px 8px", borderRadius: 6,
                    background: info.gross > 0 ? "#fde2e2" : info.gross < 0 ? "#d1fae5" : "#f3f4f6",
                    color: info.gross > 0 ? "#991b1b" : info.gross < 0 ? "#065f46" : "#475569",
                    fontWeight: 700, display: "inline-block",
                  }}>
                    الرصيد المستحق: {formatBalance(info.gross)}
                  </div>
                );
              })()}
            </div>

            {/* Search with live dropdown */}
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", insetInlineStart: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActiveIndex(0); }}
                onKeyDown={handleSearchKey}
                placeholder={t("sales.cashier.search_placeholder")}
                style={{ ...inputStyle, width: "100%", paddingInlineStart: 30 }}
              />
              {search.trim() && filteredProducts.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", insetInlineStart: 0,
                  background: "#fff", border: "1px solid #d6d9de", borderTop: "none",
                  maxHeight: 280, overflowY: "auto", zIndex: 20,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                  borderRadius: "0 0 6px 6px",
                  minWidth: "100%",
                  width: "max-content",
                  maxWidth: "calc(100vw - 32px)",
                }}>
                  {filteredProducts.slice(0, 50).map((p, idx) => {
                    const out = Number(p.stock || 0) <= 0;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={out}
                        ref={(el) => { dropdownItemRefs.current[idx] = el; }}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          if (out) return;
                          addProduct(p);
                          setSearch("");
                          requestAnimationFrame(() => searchRef.current?.focus());
                        }}
                        style={{
                          display: "flex", width: "100%", textAlign: dir === "rtl" ? "right" : "left",
                          alignItems: "center", padding: "8px 12px",
                          background: out ? "#f9fafb" : isActive ? "#2563eb" : "#fff", border: "none",
                          borderInlineStart: isActive ? "3px solid #1d4ed8" : "3px solid transparent",
                          borderBottom: "1px solid #f3f4f6", cursor: out ? "not-allowed" : "pointer",
                          fontSize: 13, color: out ? "#9ca3af" : isActive ? "#ffffff" : "#1f2937", fontFamily: POS_FONT, fontWeight: 700,
                        }}
                      >
                        <span style={{ flex: 1, fontWeight: 700, marginInlineEnd: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                        {p.sku && <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", marginInlineEnd: 8 }}>{p.sku}</span>}
                        <span style={{ fontSize: 12, color: "#1a2a4a", fontWeight: 800, marginInlineEnd: 8 }}>{Number(p.price).toFixed(2)}</span>
                        <span style={{ fontSize: 11, color: out ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                          {out ? t("sales.cashier.out_of_stock") : formatBaseQuantity(Number(p.stock || 0), p)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <select value={priceGroupId} onChange={(e) => setPriceGroupId(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
              <option value="default">{t("sales.cashier.default_price")}</option>
              {priceGroups.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>




          {/* Cart table */}
          <div className="cashier-cart-table" style={{ flex: 1, minHeight: 120, overflowY: "auto", overflowX: "auto", border: "1px solid #e3e5ea", borderRadius: 8, background: "#fff" }}>
            <table style={{ width: "100%", minWidth: 550, borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed", fontFamily: POS_FONT }}>

              <colgroup>
                <col style={{ width: "36%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e3e5ea" }}>

                <tr>
                  <th style={th}>{t("sales.cashier.col.item")}</th>
                  <th style={th}>{t("sales.cashier.col.unit")}</th>
                  <th style={th}>{t("sales.cashier.col.price")}</th>
                  <th style={th}>{t("sales.cashier.col.qty")}</th>
                  <th style={th}>{t("sales.cashier.col.total")}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setSelectedRowKey(row.key)}
                    style={{
                      borderTop: "1px solid #e5e7eb",
                      background: selectedRowKey === row.key ? "#dbeafe" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ ...td, textAlign: dir === "rtl" ? "right" : "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-start" }}>
                        <button
                          onClick={() => setItemEditFor(row.key)}
                          title={t("sales.cashier.item.unit_price")}
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: "#2563eb", display: "inline-flex", flexShrink: 0 }}
                        >
                          <Info size={14} />
                        </button>
                        <span title={row.description} style={{ textAlign: dir === "rtl" ? "right" : "left", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description}</span>
                        <span title="المتاح" style={{ fontSize: 10, color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>
                          ({formatBaseQuantity(stockLimitFor(row.product, row.expiryDate), row.product)})
                        </span>
                      </div>
                      {row.expiryDate && (
                        <div style={{ display: "inline-block", marginTop: 2, fontSize: 10, padding: "1px 4px", background: "#fef3c7", color: "#92400e", borderRadius: 2, border: "1px solid #fcd34d" }}>
                          Exp: {String(row.expiryDate).slice(0, 7)}
                        </div>
                      )}
                      {row.discountAmount > 0 && (
                        <div style={{ marginTop: 2, fontSize: 10, color: "#b91c1c" }}>
                          {t("sales.cashier.discount")}: {(row.discountAmount * row.quantity).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <select
                        ref={(el) => { unitRefs.current[row.key] = el; }}
                        value={row.unitLevel}
                        onChange={(e) => updateUnit(row.key, e.target.value as UnitLevel)}
                        onKeyDown={(e) => {
                          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                          e.preventDefault();
                          const opts = unitOptions(row.product);
                          const idx = opts.findIndex((o) => o.level === row.unitLevel);
                          if (idx < 0) return;
                          const delta = e.key === "ArrowRight" ? 1 : -1;
                          const next = Math.min(opts.length - 1, Math.max(0, idx + delta));
                          if (next !== idx) updateUnit(row.key, opts[next].level);
                        }}
                        style={{ ...inputStyle, width: "100%", padding: "2px 4px", fontSize: 11 }}
                      >
                        {unitOptions(row.product).map((o) => (
                          <option key={o.level} value={o.level}>{o.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <div
                        title="السعر الحالي للبيع"
                        style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 0, minWidth: 70 }}
                      >
                        <span style={{ fontWeight: 700, color: "#1f2937", fontSize: 12 }}>{Number(row.originalPrice).toFixed(2)}</span>
                        {Number(row.product?.previous_price || 0) > 0 && Number(row.product.previous_price) !== Number(row.originalPrice) && (
                          <span title="السعر السابق قبل آخر شحنة" style={{ fontSize: 9, color: "#9ca3af", textDecoration: "line-through" }}>
                            {Number(row.product.previous_price).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "center" }}>
                        <button onClick={() => updateQty(row.key, row.quantity - 1)} style={qtyBtnStyle}><Minus size={12} /></button>
                        <input
                          ref={(el) => { qtyRefs.current[row.key] = el; }}
                          type="number"
                          value={row.quantity}
                          onChange={(e) => updateQty(row.key, Number(e.target.value) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === "Tab" && !e.shiftKey) {
                              e.preventDefault();
                              unitRefs.current[row.key]?.focus();
                            }
                          }}
                          style={{ ...inputStyle, width: 44, minWidth: 36, textAlign: "center", padding: "2px 4px", fontSize: 11 }}
                        />
                        <button onClick={() => updateQty(row.key, row.quantity + 1)} style={qtyBtnStyle}><Plus size={12} /></button>
                      </div>
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{(row.unitPrice * row.quantity).toFixed(2)}</td>
                    <td style={td}>
                      <button onClick={() => removeRow(row.key)} style={{ ...qtyBtnStyle, background: "#fee2e2", color: "#b91c1c" }}>
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>{t("sales.cashier.cart_empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals — single compact row: qty + more on one side, grand total on the other */}
          <div style={{ marginTop: 8, flexShrink: 0, fontFamily: POS_FONT, fontWeight: 700 }}>
            <div style={{
              display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                background: "#fff", border: "1px solid #e3e5ea", borderRadius: 8, padding: "6px 12px", fontSize: 13,
              }}>
                <Row label={t("sales.cashier.total_qty")} value={totalQty.toFixed(2)} />
                {showExtraTotals && (
                  <>
                    <Row label={t("sales.cashier.discount")} value={discount.toFixed(2)} onClick={can("cashier", "invoice_discount") ? () => openEdit("discount") : undefined} />
                    <Row label={t("sales.cashier.shipping")} value={shipping.toFixed(2)} onClick={() => openEdit("shipping")} />
                    <Row label={t("sales.cashier.tax")} value={tax.toFixed(2)} onClick={() => openEdit("tax")} />
                  </>
                )}
                {!showExtraTotals && discount > 0 && (
                  <Row label={t("sales.cashier.discount")} value={discount.toFixed(2)} onClick={can("cashier", "invoice_discount") ? () => openEdit("discount") : undefined} />
                )}
                {!showExtraTotals && shipping > 0 && (
                  <Row label={t("sales.cashier.shipping")} value={shipping.toFixed(2)} onClick={() => openEdit("shipping")} />
                )}
                {!showExtraTotals && tax > 0 && (
                  <Row label={t("sales.cashier.tax")} value={tax.toFixed(2)} onClick={() => openEdit("tax")} />
                )}
                <button
                  type="button"
                  onClick={() => setShowExtraTotals((v) => !v)}
                  style={{ background: "transparent", border: "1px dashed #cbd5e1", color: "#475569", fontSize: 11, padding: "3px 12px", borderRadius: 4, cursor: "pointer", fontFamily: POS_FONT }}
                >
                  {showExtraTotals ? "أقل" : "المزيد"}
                </button>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
                flex: 1, minWidth: 160,
                padding: "8px 16px",
                background: "#1a2a4a",
                color: "#fff",
                borderRadius: 8,
                fontSize: "clamp(13px, 3.5vw, 22px)",
                fontWeight: 800,
                fontFamily: POS_FONT,
              }}>
                <span>{t("sales.cashier.grand")}</span>
                <span>{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {productsPanelOpen && (() => {
          const quickMode = search.trim() === "*";
          const panelProducts = quickMode || search.trim() ? filteredProducts : products;
          return (
          <div
            className={`cashier-products-panel${mobilePanel === "cart" ? " cashier-mobile-hidden-products" : ""}`}
            style={{ ...win7Panel, padding: 10, width: quickMode ? 300 : 340, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden", fontFamily: POS_FONT }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#1f2937", fontFamily: POS_FONT, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{quickMode ? (lang === "ar" ? "الأصناف السريعة" : "Quick Items") : t("sales.cashier.products_count")} ({panelProducts.length})</span>
              {quickMode && (
                <button type="button" onClick={() => setSearch("")} style={{ background: "transparent", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>
                  {lang === "ar" ? "عرض الكل" : "All"}
                </button>
              )}
            </div>
            {quickMode ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 4 }}>
                {panelProducts.length === 0 && (
                  <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: 16 }}>
                    {lang === "ar" ? "لا توجد أصناف سريعة. أضفها من صفحة الأصناف." : "No quick items yet."}
                  </div>
                )}
                {panelProducts.map((p: any) => {
                  const out = Number(p.stock || 0) <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => { if (!out) addProduct(p); }}
                      title={p.name}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "8px 10px", background: out ? "#f3f4f6" : "#fff",
                        border: "1px solid #e3e5ea", borderRadius: 8,
                        cursor: out ? "not-allowed" : "pointer", textAlign: dir === "rtl" ? "right" : "left",
                        opacity: out ? 0.6 : 1, fontFamily: POS_FONT, fontWeight: 700,
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <span style={{ color: out ? "#dc2626" : "#16a34a", fontSize: 11, fontWeight: 700 }}>
                        {out ? t("sales.cashier.out_of_stock") : formatBaseQuantity(Number(p.stock || 0), p)}
                      </span>
                      <span style={{ color: "#1a2a4a", fontWeight: 800, fontSize: 13 }}>{Number(p.price).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: "auto", overflowX: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, alignContent: "start" }}>
              {panelProducts.map((p: any) => {
                const out = Number(p.stock || 0) <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => { if (!out) addProduct(p); }}
                    title={p.name}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "stretch",
                      padding: 8, background: out ? "#f3f4f6" : "#fff",
                      border: "1px solid #e3e5ea", borderRadius: 8,
                      cursor: out ? "not-allowed" : "pointer", textAlign: dir === "rtl" ? "right" : "left",
                      opacity: out ? 0.6 : 1,
                      fontFamily: POS_FONT,
                      fontWeight: 700,
                    }}
                  >
                    <div style={{ width: "100%", height: 100, flexShrink: 0, background: "#f8fafc", border: "1px solid #eef0f3", borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : (
                        <ImageIcon size={32} color="#94a3b8" />
                      )}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: "#1f2937",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden", lineHeight: 1.3, minHeight: "calc(1.3em * 2)",
                      marginBottom: 4,
                    }}>{p.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                      <span style={{ color: out ? "#dc2626" : "#16a34a", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginInlineEnd: 4 }}>
                        {out ? t("sales.cashier.out_of_stock") : formatBaseQuantity(Number(p.stock || 0), p)}
                      </span>
                      <span style={{ color: "#1a2a4a", fontWeight: 800, flexShrink: 0 }}>{Number(p.price).toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </div>
          );
        })()}
      </div>

      {/* Action buttons — sticky bottom bar, always visible without scroll */}
      <div className="no-print cashier-actions" style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
        gap: 10,
        background: "#ffffff",
        padding: 8,
        flexShrink: 0,
        borderTop: "1px solid #e3e5ea",
        fontFamily: POS_FONT,
      }}>
        <ActionBtn color="#e85d6e" label={t("sales.cashier.btn.cancel")} hint="Ctrl+Esc" onClick={clearCart} />
        <ActionBtn color="#5bb98a" label={t("sales.cashier.btn.cash")} hint="Ctrl+S / Ctrl+N" onClick={() => submit("cash")} />
        <ActionBtn color="#2d3748" label={t("sales.cashier.btn.multi")} hint="Ctrl+M" onClick={() => setMultiPayOpen(true)} />
        <ActionBtn color="#7a8390" label={t("sales.cashier.btn.card")} hint="Ctrl+B" onClick={() => submit("card")} />
        <ActionBtn color="#9b7fc7" label={t("sales.cashier.btn.credit")} hint="Ctrl+A" onClick={() => submit("credit")} disabled={!can("cashier", "sell_on_credit")} deniedTitle="لا تملك صلاحية البيع الآجل" />
        <ActionBtn color="#e89b8c" label={t("sales.cashier.btn.suspend")} hint="Ctrl+T" onClick={() => submit("suspend")} />
        <ActionBtn color="#e8c554" label={t("sales.cashier.btn.quotation")} hint="Ctrl+P" onClick={() => submit("quotation")} />
        <ActionBtn color="#5fa3b8" label={t("sales.cashier.btn.draft")} hint="Ctrl+D" onClick={() => submit("draft")} />
      </div>





      {/* Edit modal (discount/tax/shipping) */}
      {editKind && (
        <Modal title={editTitle} onClose={() => setEditKind(null)} dir={dir}>
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
            style={{ ...inputStyle, width: "100%", fontSize: 16 }}
            onKeyDown={(e) => e.key === "Enter" && applyEdit()}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setEditKind(null)} style={modalBtn}>{t("sales.cashier.cancel")}</button>
            <button onClick={applyEdit} style={{ ...modalBtn, background: "#16a34a", color: "#fff" }}>{t("sales.cashier.confirm")}</button>
          </div>
        </Modal>
      )}

      {/* Multi-pay modal */}
      {multiPayOpen && (
        <MultiPayModal
          grandTotal={grandTotal}
          onClose={() => setMultiPayOpen(false)}
          onConfirm={(payments) => {
            setMultiPayOpen(false);
            submit("multi", payments);
          }}
        />
      )}

      {/* Calculator */}
      {calcOpen && (
        <Modal title={t("sales.cashier.calculator")} onClose={() => setCalcOpen(false)} dir={dir} wide>
          <Calculator />
        </Modal>
      )}

      {/* Session details */}
      {sessionDetailsOpen && (
        <SessionDetailsModal sessionId={sessionId} onClose={() => setSessionDetailsOpen(false)} />
      )}

      {/* Add expense */}
      {expenseOpen && (
        <AddExpenseModal sessionId={sessionId} onClose={() => setExpenseOpen(false)} />
      )}

      {/* Recent transactions */}
      {recentOpen && (
        <RecentTransactionsModal sessionId={sessionId} onClose={() => setRecentOpen(false)} />
      )}

      {expiryFor && (
        <SelectExpiryDateModal
          product={expiryFor}
          onClose={() => setExpiryFor(null)}
          onSelect={(d) => { addProductWithExpiry(expiryFor, d); setExpiryFor(null); }}
        />
      )}
      {win7Error && (
        <div
          role="dialog"
          onClick={() => setWin7Error(null)}
          className="no-print"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70 }}
        >
          <div
            dir={dir}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fee2e2",
              border: "1px solid #9aa0a6",
              color: "#b91c1c",
              padding: 16,
              width: 380,
              maxWidth: "92vw",
              borderRadius: 2,
              fontFamily: POS_FONT,
              fontWeight: 700,
            }}
          >
            <div style={{ fontSize: 15, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #9aa0a6" }}>تنبيه</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{win7Error}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                onClick={() => setWin7Error(null)}
                style={{ background: "#b91c1c", color: "#fff", border: "1px solid #9aa0a6", padding: "6px 18px", fontWeight: 700, cursor: "pointer", borderRadius: 2 }}
              >موافق</button>
            </div>
          </div>
        </div>
      )}

      <ReturnLookupModal
        open={returnLookupOpen}
        onOpenChange={setReturnLookupOpen}
        onFound={(inv) => setReturnFormFor(inv)}
      />
      {returnFormFor?.id && (
        <ReturnFormModal
          open={!!returnFormFor}
          onOpenChange={(v) => !v && setReturnFormFor(null)}
          original={returnFormFor}
          sessionId={sessionId}
        />
      )}

      <ContactPaymentModal open={payInOpen} direction="in" sessionId={sessionId} onClose={() => setPayInOpen(false)} />
      <ContactPaymentModal open={payOutOpen} direction="out" sessionId={sessionId} onClose={() => setPayOutOpen(false)} />

      {/* Close session */}
      {closeSessionOpen && sessionInfo && (
        <CloseSessionModal
          sessionId={sessionId}
          openingCash={sessionInfo.openingCash}
          openedAt={sessionInfo.openedAt}
          onClose={() => setCloseSessionOpen(false)}
          onClosed={onSessionClosed}
        />
      )}

      {/* Suspended list */}
      {suspendedOpen && (
        <Modal title={t("sales.cashier.suspended_title")} onClose={() => setSuspendedOpen(false)} wide dir={dir}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead style={{ background: "#d4d4d4" }}>
              <tr>
                <th style={th}>{t("sales.session.invoices_count").replace(":", "")}</th>
                <th style={th}>{t("sales.session.open_at")}</th>
                <th style={th}>{t("sales.cashier.grand")}</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {suspendedList.map((inv: any) => (
                <tr key={inv.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={td}>{inv.invoice_number}</td>
                  <td style={td}>{inv.issue_date}</td>
                  <td style={td}>{Number(inv.total).toFixed(2)}</td>
                  <td style={td}>
                    <button onClick={() => resumeSuspended(inv)} style={{ ...modalBtn, background: "#16a34a", color: "#fff" }}>{t("sales.cashier.resume")}</button>
                  </td>
                </tr>
              ))}
              {suspendedList.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: "center" }}>{t("sales.cashier.no_suspended")}</td></tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}

      {/* Item edit modal */}
      {itemEditFor && (() => {
        const row = cart.find((x) => x.key === itemEditFor);
        if (!row) return null;
        const sku = row.product?.sku || "";
        const title = `${row.product?.name || row.description}${sku ? ` - ${sku}` : ""}`;
        return (
          <Modal title={title} onClose={() => setItemEditFor(null)} dir={dir} wide>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>{t("sales.cashier.item.unit_price")}</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={row.originalPrice}
                  readOnly
                  disabled
                  style={{
                    ...inputStyle,
                    width: "100%",
                    fontSize: 14,
                    background: "#f3f4f6",
                    color: "#6b7280",
                    cursor: "not-allowed",
                  }}
                />
              </div>
              {can("cashier", "edit_item_discount") && (
                <>
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>{t("sales.cashier.item.discount_type")}</label>
                    <select
                      value={row.discountType}
                      onChange={(e) => updateDiscount(row.key, row.discountValue, e.target.value as "fixed" | "percent")}
                      style={{ ...inputStyle, width: "100%", fontSize: 14 }}
                    >
                      <option value="fixed">{t("sales.cashier.item.fixed")}</option>
                      <option value="percent">{t("sales.cashier.item.percent")}</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>{t("sales.cashier.item.discount_amount")}</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.discountValue}
                      onChange={(e) => updateDiscount(row.key, Number(e.target.value) || 0)}
                      style={{ ...inputStyle, width: "100%", fontSize: 14 }}
                    />
                  </div>
                </>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>{t("sales.cashier.item.description")}</label>
                <textarea
                  value={row.description}
                  onChange={(e) => updateDescription(row.key, e.target.value)}
                  placeholder={t("sales.cashier.item.description_placeholder")}
                  rows={4}
                  style={{ ...inputStyle, width: "100%", fontSize: 13, resize: "vertical" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 14 }}>
              <button
                onClick={() => setItemEditFor(null)}
                style={{ padding: "8px 18px", background: "#111", color: "#fff", border: "1px solid #000", cursor: "pointer", fontSize: 13, borderRadius: 2 }}
              >
                {t("sales.cashier.item.close")}
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* Print area */}
      {printing && (
        <ReceiptPrintable
          invoice={printing.invoice}
          items={printing.items}
          customerName={printing.customerName}
          payments={printing.payments}
        />
      )}
    </div>
  );
}

// ─── small bits ───
const th: React.CSSProperties = { padding: "10px 6px", textAlign: "center", fontWeight: 800, fontSize: 13, borderBottom: "1px solid #e3e5ea", color: "#6b7280", fontFamily: POS_FONT };
const td: React.CSSProperties = { padding: "8px 4px", textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: POS_FONT, color: "#1f2937" };
const qtyBtnStyle: React.CSSProperties = { background: "#e5e7eb", border: "1px solid #9aa0a6", padding: 2, cursor: "pointer", display: "inline-flex", alignItems: "center", borderRadius: 2 };
const modalBtn: React.CSSProperties = { padding: "6px 14px", border: "1px solid #9aa0a6", background: "#e5e7eb", cursor: "pointer", fontSize: 13, borderRadius: 2 };

function ToolbarBtn({ icon, label, onClick, bg, fg }: { icon: React.ReactNode; label: string; onClick: () => void; bg: string; fg: string }) {
  return (
    <button
      onClick={onClick}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(0.96)"; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "6px 12px",
        background: bg,
        color: fg,
        border: `1.5px solid ${fg}`,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 18,
        fontFamily: POS_FONT,
        margin: 3,
        whiteSpace: "nowrap",
        transition: "filter 0.15s",
      }}
    >
      <span style={{ display: "inline-flex", marginInlineEnd: 6 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}


function categoryColor(id: string | null | undefined): string {
  if (!id) return "#64748b";
  const palette = ["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#9333ea", "#0d9488", "#b45309", "#475569"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function CategoryChip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  const c = color || "#64748b";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        background: active ? c : c + "22",
        color: active ? "#fff" : "#1a1a1a",
        border: `1px solid ${active ? c : c + "66"}`,
        cursor: "pointer",
        fontSize: 12,
        borderRadius: 2,
        fontWeight: active ? 700 : 500,
        borderInlineStart: `3px solid ${c}`,
      }}
    >{children}</button>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "2px 4px",
        cursor: onClick ? "pointer" : "default",
        color: "#374151",
        fontFamily: POS_FONT,
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}:</span>
      <span style={{ color: onClick ? "#2563eb" : "#1f2937" }}>{value}</span>
    </div>
  );
}

function ActionBtn({ color, label, hint, onClick, disabled, deniedTitle }: { color: string; label: string; hint?: string; onClick: () => void; disabled?: boolean; deniedTitle?: string }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? deniedTitle : undefined}
      aria-disabled={disabled}
      onMouseOver={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(0.93)"; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = "none"; }}
      style={{
        background: color, color: "#fff",
        border: "none",
        padding: "5px 8px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        borderRadius: 16,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 44,
        fontFamily: POS_FONT,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "filter 0.15s",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
      {hint && <span className="cashier-hint-text" style={{ fontSize: 9, opacity: 0.85, fontWeight: 700 }}>{hint}</span>}
    </button>
  );
}


function Modal({ title, children, onClose, wide, dir }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; dir: "rtl" | "ltr" }) {
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div
        dir={dir}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#e9e9e9", border: "1px solid #9aa0a6",
          padding: 14,
          width: wide ? "min(600px, calc(100vw - 24px))" : "min(360px, calc(100vw - 24px))",
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 2,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #9aa0a6" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer" }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Calculator() {
  const [display, setDisplay] = useState("0");
  const [justCalc, setJustCalc] = useState(false);
  const isOp = (c: string) => c === "+" || c === "-" || c === "×" || c === "÷";
  const press = (k: string) => {
    if (k === "C") { setJustCalc(false); return setDisplay("0"); }
    if (k === "⌫") { setJustCalc(false); return setDisplay((d) => (d.length <= 1 ? "0" : d.slice(0, -1))); }
    if (k === "=") {
      setDisplay((d) => {
        if (d === "Error") return "0";
        const last = d.slice(-1);
        const expr = isOp(last) ? d.slice(0, -1) : d;
        if (!expr) return "0";
        try {
          // eslint-disable-next-line no-new-func
          const res = Function(`"use strict"; return (${expr.replace(/×/g, "*").replace(/÷/g, "/")})`)();
          if (typeof res !== "number" || !isFinite(res)) return "Error";
          return String(Math.round(res * 1e10) / 1e10);
        } catch { return "Error"; }
      });
      setJustCalc(true);
      return;
    }
    const isDigit = /^[0-9.]$/.test(k);
    if (justCalc) {
      setJustCalc(false);
      if (isDigit) return setDisplay(k);
      // operator after result → continue from result
      return setDisplay((d) => (d === "Error" ? "0" + k : d + k));
    }
    setDisplay((d) => {
      if (d === "Error") return isDigit ? k : "0" + k;
      if (d === "0" && isDigit && k !== ".") return k;
      // prevent two operators in a row → replace last op
      if (isOp(k) && isOp(d.slice(-1))) return d.slice(0, -1) + k;
      return d + k;
    });
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); (e as any).stopImmediatePropagation?.(); };
      if (/^[0-9.]$/.test(k)) { stop(); press(k); }
      else if (k === "+" || k === "-") { stop(); press(k); }
      else if (k === "*") { stop(); press("×"); }
      else if (k === "/") { stop(); press("÷"); }
      else if (k === "Enter" || k === "=") { stop(); press("="); }
      else if (k === "Backspace") { stop(); press("⌫"); }
      else if (k === "Escape" || k.toLowerCase() === "c") { stop(); press("C"); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCalc]);
  const keys: { k: string; v?: "op" | "eq" | "clr" }[] = [
    { k: "C", v: "clr" }, { k: "⌫", v: "op" }, { k: "÷", v: "op" }, { k: "×", v: "op" },
    { k: "7" }, { k: "8" }, { k: "9" }, { k: "-", v: "op" },
    { k: "4" }, { k: "5" }, { k: "6" }, { k: "+", v: "op" },
    { k: "1" }, { k: "2" }, { k: "3" }, { k: "=", v: "eq" },
    { k: "0" }, { k: "." },
  ];
  const btnStyle = (v?: string): React.CSSProperties => ({
    padding: "18px 0",
    fontSize: 30,
    fontWeight: 700,
    cursor: "pointer",
    borderRadius: 4,
    border: "1px solid #6b7280",
    background:
      v === "eq" ? "linear-gradient(180deg,#34d399,#059669)" :
      v === "clr" ? "linear-gradient(180deg,#f87171,#b91c1c)" :
      v === "op" ? "linear-gradient(180deg,#dbeafe,#93c5fd)" :
      "linear-gradient(180deg,#ffffff,#d1d5db)",
    color: v === "eq" || v === "clr" ? "#fff" : "#1f2937",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.2)",
    gridColumn: v === "eq" ? "span 1" : undefined,
  });
  return (
    <div style={{ background: "linear-gradient(180deg,#e5e7eb,#cbd5e1)", padding: 10, borderRadius: 6, border: "1px solid #9aa0a6" }}>
      <div style={{
        background: "linear-gradient(180deg,#064e3b,#022c22)",
        color: "#86efac",
        fontFamily: "'Consolas','Courier New',monospace",
        fontSize: 56,
        fontWeight: 700,
        padding: "14px 16px",
        textAlign: "right" as const,
        borderRadius: 4,
        marginBottom: 8,
        border: "2px inset #6b7280",
        minHeight: 60,
        overflow: "hidden" as const,
        textOverflow: "ellipsis",
        textShadow: "0 0 6px rgba(134,239,172,.6)",
      }}>{display}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
        {keys.map((it) => (
          <button key={it.k} type="button" onClick={() => press(it.k)} style={btnStyle(it.v)}>{it.k}</button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#4b5563", marginTop: 8, textAlign: "center" }}>
        ⌨️ يدعم الكيبورد: 0-9 + - * / Enter Backspace Esc
      </div>
    </div>
  );
}

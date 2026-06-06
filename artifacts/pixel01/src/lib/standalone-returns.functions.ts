import { supabase } from "@/integrations/supabase/client";

export const createStandaloneReturn = async ({ data }: {
  data: {
    return_type: "sales" | "purchase";
    warehouse_id?: string | null;
    treasury_id: string;
    reason?: string | null;
    items: Array<{
      product_id?: string | null;
      new_product_name?: string | null;
      quantity: number;
      base_quantity?: number;
      unit_price: number;
      expiry_date?: string | null;
    }>;
    contact_id?: string | null;
    contact_type?: "customer" | "supplier" | null;
    payment_method?: "cash" | "account";
    session_id?: string | null;
  }
}) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const { data: result, error } = await (supabase as any).rpc("process_standalone_return", {
    _return_type: data.return_type,
    _warehouse_id: data.warehouse_id ?? null,
    _treasury_id: data.treasury_id,
    _reason: data.reason ?? null,
    _items: data.items,
  });
  if (error) {
    const raw = error.message || "";
    const msg = raw.toUpperCase();
    if (msg.includes("TREASURY_REQUIRED")) throw new Error("اختر الخزينة");
    if (msg.includes("TREASURY_NOT_FOUND")) throw new Error("الخزينة غير موجودة");
    if (msg.includes("ITEMS_REQUIRED")) throw new Error("أضف صنف واحد على الأقل");
    if (msg.includes("NO_VALID_ITEMS")) throw new Error("الكميات غير صالحة");
    if (msg.includes("PRODUCT_OR_NAME_REQUIRED")) throw new Error("اختر منتج أو اكتب اسم جديد");
    if (msg.includes("PRODUCT_NOT_FOUND")) throw new Error("المنتج غير موجود");
    if (msg.includes("INSUFFICIENT_STOCK")) {
      const m = raw.match(/INSUFFICIENT_STOCK:\s*([^\n]+)/i);
      const name = m?.[1]?.trim();
      throw new Error(name ? `الرصيد غير كافٍ للصنف: ${name}` : "الرصيد غير كافٍ");
    }
    throw new Error(error.message || "فشل تسجيل المرتجع");
  }

  const ret = result as {
    id: string;
    reference_no: string;
    treasury_transaction_id: string;
    total_amount: number;
  };

  if (data.session_id) {
    if (ret.id) {
      await (supabase as any).from("standalone_returns").update({ session_id: data.session_id }).eq("id", ret.id);
    }
    if (ret.treasury_transaction_id) {
      await (supabase as any).from("treasury_transactions").update({ session_id: data.session_id }).eq("id", ret.treasury_transaction_id);
    }
  }

  if (data.contact_id && data.contact_type && data.payment_method === "account") {
    const direction = data.return_type === "sales" ? "in" : "out";

    let treasuryAccountId: string | null = null;
    const { data: tr } = await (supabase as any)
      .from("treasuries")
      .select("account_id")
      .eq("id", data.treasury_id)
      .maybeSingle();
    treasuryAccountId = (tr?.account_id as string | null) ?? null;

    const { error: cpErr } = await (supabase as any).from("contact_payments").insert({
      owner_id: userId,
      contact_id: data.contact_id,
      contact_type: data.contact_type,
      direction,
      amount: ret.total_amount,
      allocated_amount: 0,
      payment_method: "account",
      treasury_account_id: treasuryAccountId,
      ref_no: ret.reference_no,
      notes: `مرتجع ${data.return_type === "sales" ? "مبيعات" : "مشتريات"} حر — على حساب`,
      payment_date: new Date().toISOString().slice(0, 10),
      session_id: data.session_id || null,
    });
    if (cpErr) {
      console.error("contact_payment insert failed:", cpErr);
      throw new Error("تم تسجيل المرتجع لكن لم يتم تحديث رصيد الطرف: " + cpErr.message);
    }
  }

  return ret;
};

/**
 * Translate Postgres / Supabase error codes to user-facing Arabic messages.
 * Returns a clean Error to be thrown or surfaced via toast.
 */
export function friendlyDbError(e: any, fallback = "حدث خطأ غير متوقع"): Error {
  const code = e?.code || e?.cause?.code;
  const msg: string = e?.message || "";
  if (/has_returns/i.test(msg)) {
    return new Error("لا يمكن تعديل المستند بعد تسجيل مرتجع. احذف المرتجع أولاً.");
  }
  if (/multiple_payments/i.test(msg)) {
    return new Error("هذا المستند عليه أكثر من دفعة. عَكِس الدفعات الإضافية أولاً.");
  }
  if (/insufficient_stock/i.test(msg)) {
    return new Error("المخزون لا يكفي للكميات الجديدة.");
  }
  if (/insufficient_privilege|not_found/i.test(msg)) {
    return new Error("ليس لديك صلاحية لتعديل هذا المستند");
  }
  if (code === "23505" || /duplicate key/i.test(msg)) {
    return new Error("هذا الرقم مستخدم بالفعل، حاول مرة أخرى");
  }
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new Error("ليس لديك صلاحية لإجراء هذه العملية");
  }
  if (/invalid input syntax for type date/i.test(msg)) {
    return new Error("تاريخ غير صالح — تأكد من إدخال تاريخ الصلاحية بصيغة صحيحة");
  }
  if (/null value in column "product_id"/i.test(msg)) {
    return new Error("لا يمكن تحديث المخزون لصنف جديد بدون اختياره من قائمة الأصناف");
  }
  return new Error(msg || fallback);
}

/**
 * Guard for owner_id readiness. Throws an Arabic error if ownerId hasn't
 * resolved yet — never silently falls back to user.id (which breaks RLS
 * and sequence numbering for employees).
 */
export function requireOwnerId(ownerId: string | undefined): string {
  if (!ownerId) {
    throw new Error("جارٍ تحميل بيانات الحساب، حاول مرة أخرى");
  }
  return ownerId;
}

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useUpdateContact, type ContactType } from "@/hooks/use-contacts";
import { useCustomerGroups } from "@/hooks/use-customer-groups";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";

const contactSchema = z.object({
  type: z.enum(["customer", "supplier", "both"]),
  first_name: z.string().trim().min(1, "first_name").max(100),
  last_name: z.string().trim().max(100).optional().or(z.literal("")),
  business_name: z.string().trim().max(150).optional().nullable(),
  mobile: z.string().trim().min(5, "mobile").max(30).regex(/^[+\d\s\-()]+$/, "mobile"),
  email: z.string().trim().email("email").max(255).optional().or(z.literal("")),
  opening_balance: z.number().min(-1_000_000_000).max(1_000_000_000),
  credit_limit: z.number().min(0).max(1_000_000_000),
});

const BLUE = "#3b82f6";
const DARK = "#111827";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  borderRadius: 6,
  height: 38,
  padding: "0 10px",
  width: "100%",
  fontSize: 13,
  outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#374151", marginBottom: 4, display: "block" };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: any;
};

export function EditContactDialog({ open, onOpenChange, contact }: Props) {
  const { t, dir } = useI18n();
  const update = useUpdateContact();
  const { data: groups = [] } = useCustomerGroups();

  const [type, setType] = useState<ContactType>("customer");
  const [businessType, setBusinessType] = useState<"person" | "business">("person");
  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [groupId, setGroupId] = useState("");
  const [moreOpen, setMoreOpen] = useState(true);

  const [taxNumber, setTaxNumber] = useState("");
  const [opening, setOpening] = useState("");
  const [payTermNum, setPayTermNum] = useState("");
  const [payTermUnit, setPayTermUnit] = useState("days");
  const [assignedTo, setAssignedTo] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [phone, setPhone] = useState("");
  const [altMobile, setAltMobile] = useState("");
  const [prefix, setPrefix] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [dob, setDob] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [shipping, setShipping] = useState("");

  useEffect(() => {
    if (open && contact) {
      setType((contact.type as ContactType) ?? "customer");
      setBusinessType(contact.business_type ?? "person");
      setBusinessName(contact.business_name ?? "");
      setFirstName(contact.first_name ?? "");
      setLastName(contact.last_name ?? "");
      setMobile(contact.mobile ?? "");
      setEmail(contact.email ?? "");
      setGroupId(contact.customer_group_id ?? "");
      setTaxNumber(contact.tax_number ?? "");
      setOpening(contact.opening_balance != null ? String(contact.opening_balance) : "");
      const pt = (contact.pay_term ?? "").split(" ");
      setPayTermNum(pt[0] ?? "");
      setPayTermUnit(pt[1] ?? "days");
      setAssignedTo(contact.assigned_to ?? "");
      setCreditLimit(contact.credit_limit != null ? String(contact.credit_limit) : "");
      setPhone(contact.phone ?? "");
      setAltMobile(contact.alt_mobile ?? "");
      setPrefix(contact.prefix ?? "");
      setMiddleName(contact.middle_name ?? "");
      setDob(contact.dob ?? "");
      setAddr1(contact.address_line_1 ?? contact.address ?? "");
      setAddr2(contact.address_line_2 ?? "");
      setCity(contact.city ?? "");
      setState(contact.state ?? "");
      setZip(contact.zip_code ?? "");
      setShipping(contact.shipping_address ?? "");
    }
  }, [open, contact]);

  const isCustomerLike = type === "customer" || type === "both";
  const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
    { value: "customer", label: t("users.type.customer") },
    { value: "supplier", label: t("users.type.supplier") },
    { value: "both", label: t("users.type.both") },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse({
      type, first_name: firstName, last_name: lastName,
      business_name: businessType === "business" ? businessName : null,
      mobile, email,
      opening_balance: opening ? Number(opening) : 0,
      credit_limit: creditLimit ? Number(creditLimit) : 0,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "خطأ في البيانات");
      return;
    }
    await update.mutateAsync({
      id: contact.id,
      values: {
        type, business_type: businessType,
        business_name: businessType === "business" ? businessName.trim() || null : null,
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        mobile: mobile.trim(),
        email: email.trim() || null,
        customer_group_id: isCustomerLike && groupId ? groupId : null,
        tax_number: taxNumber.trim() || null,
        opening_balance: opening ? Number(opening) : 0,
        pay_term: payTermNum ? `${payTermNum} ${payTermUnit}` : null,
        assigned_to: assignedTo.trim() || null,
        credit_limit: creditLimit ? Number(creditLimit) : 0,
        phone: phone.trim() || null,
        alt_mobile: altMobile.trim() || null,
        prefix: businessType === "person" ? prefix.trim() || null : null,
        middle_name: businessType === "person" ? middleName.trim() || null : null,
        dob: businessType === "person" && dob ? dob : null,
        address: addr1.trim() || null,
        address_line_1: addr1.trim() || null,
        address_line_2: addr2.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip_code: zip.trim() || null,
        shipping_address: shipping.trim() || null,
      },
    });
    onOpenChange(false);
  };

  const sectionBtn: React.CSSProperties = {
    backgroundColor: BLUE, color: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 13,
    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-3xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#ffffff" }}>
        <DialogHeader>
          <DialogTitle className="text-start" style={{ color: DARK }}>تعديل</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 form-strong">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label style={labelStyle}>{t("users.contact.type")}<span style={{ color: RED }}>*</span></label>
              <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value as ContactType)}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-1 text-sm" style={{ color: "#374151" }}>
                <input type="radio" name="bt-edit" checked={businessType === "person"} onChange={() => setBusinessType("person")} /> {t("users.contact.person")}
              </label>
              <label className="flex items-center gap-1 text-sm" style={{ color: "#374151" }}>
                <input type="radio" name="bt-edit" checked={businessType === "business"} onChange={() => setBusinessType("business")} /> {t("users.contact.business")}
              </label>
            </div>
            {isCustomerLike && (
              <div>
                <label style={labelStyle}>{t("users.contact.group")}</label>
                <select style={inputStyle} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">{t("users.contact.group_other")}</option>
                  {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {businessType === "business" && (
            <div>
              <label style={labelStyle}>{t("users.contact.business_name")}</label>
              <input style={inputStyle} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>{t("users.contact.first_name")}<span style={{ color: RED }}>*</span></label>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.contact.last_name")}</label>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.contact.mobile")}<span style={{ color: RED }}>*</span></label>
              <input style={inputStyle} value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.contact.email")}</label>
              <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <button type="button" onClick={() => setMoreOpen((s) => !s)} style={sectionBtn}>
            <span>{t("users.contact.more")}</span>
            {moreOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {moreOpen && (
            <div className="space-y-3 p-3" style={{ border: "1px solid #e5e7eb", borderRadius: 6 }}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label style={labelStyle}>{t("users.contact.tax_number")}</label><input style={inputStyle} value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.opening")}</label><input type="number" style={inputStyle} value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
                <div>
                  <label style={labelStyle}>{t("users.contact.pay_term")}</label>
                  <div className="flex gap-1">
                    <input type="number" style={{ ...inputStyle, flex: 1 }} value={payTermNum} onChange={(e) => setPayTermNum(e.target.value)} />
                    <select style={{ ...inputStyle, width: 100 }} value={payTermUnit} onChange={(e) => setPayTermUnit(e.target.value)}>
                      <option value="days">{t("users.contact.days")}</option>
                      <option value="months">{t("users.contact.months")}</option>
                    </select>
                  </div>
                </div>
                <div><label style={labelStyle}>{t("users.contact.assigned_to")}</label><input style={inputStyle} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.credit_limit")}</label><input type="number" style={inputStyle} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.phone")}</label><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.alt_mobile")}</label><input style={inputStyle} value={altMobile} onChange={(e) => setAltMobile(e.target.value)} /></div>
                {businessType === "person" && (
                  <>
                    <div><label style={labelStyle}>{t("users.contact.prefix")}</label><input style={inputStyle} value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
                    <div><label style={labelStyle}>{t("users.contact.middle_name")}</label><input style={inputStyle} value={middleName} onChange={(e) => setMiddleName(e.target.value)} /></div>
                    <div><label style={labelStyle}>{t("users.contact.dob")}</label><DateInput value={dob} onChange={setDob} style={inputStyle} /></div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={labelStyle}>{t("users.contact.addr1")}</label><input style={inputStyle} value={addr1} onChange={(e) => setAddr1(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.addr2")}</label><input style={inputStyle} value={addr2} onChange={(e) => setAddr2(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label style={labelStyle}>{t("users.contact.city")}</label><input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.state")}</label><input style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} /></div>
                <div><label style={labelStyle}>{t("users.contact.zip")}</label><input style={inputStyle} value={zip} onChange={(e) => setZip(e.target.value)} /></div>
              </div>
              <div>
                <label style={labelStyle}>{t("users.contact.shipping")}</label>
                <input style={inputStyle} value={shipping} onChange={(e) => setShipping(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <button type="submit" disabled={update.isPending} className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>
              تحديث
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: DARK }}>
              {t("users.actions.close")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

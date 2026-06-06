import Barcode from "react-barcode";

export type LabelDesignProduct = {
  id: string;
  name?: string | null;
  name_en?: string | null;
  price?: number | null;
  sku?: string | null;
};

/**
 * Pixel-perfect 50x25mm thermal label (Code 128 via react-barcode).
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │ Store name              Barcode no. │
 *   │     ║║║║║║║║║║║║║║║║║║║║║║║║        │
 *   │ Product description       EXP date  │
 *   │ SKU                       LE Price  │
 *   └─────────────────────────────────────┘
 */
export function LabelDesign({
  product,
  expiry,
  storeName,
}: {
  product: LabelDesignProduct;
  expiry?: string | null;
  storeName?: string;
}) {
  const expiryText = expiry && expiry.trim() ? expiry : "—";
  const code = String(product.sku || product.id || "").trim() || "0000000000";
  const price = Number(product.price ?? 0);

  return (
    <div
      className="print-label"
      style={{
        width: "50mm",
        height: "25mm",
        boxSizing: "border-box",
        padding: "1mm 1.5mm",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "Cairo, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "stretch",
        overflow: "hidden",
        lineHeight: 1.05,
      }}
    >
      {/* Top row: store name (right) + barcode digits (left) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "6.5pt",
          fontWeight: 600,
          gap: "2mm",
        }}
      >
        <span
          dir="ltr"
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {code}
        </span>
        <span
          dir="rtl"
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "60%",
            textAlign: "right",
          }}
        >
          {storeName || ""}
        </span>
      </div>

      {/* Middle: barcode */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          direction: "ltr",
          flex: "0 0 auto",
        }}
      >
        <Barcode
          value={code}
          format="CODE128"
          width={1.4}
          height={28}
          fontSize={7}
          margin={0}
          displayValue={false}
          background="#ffffff"
          lineColor="#000000"
        />
      </div>

      {/* Row: description (right) + expiry (left) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "6.5pt",
          fontWeight: 600,
          gap: "2mm",
        }}
      >
        <span dir="ltr" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {expiryText}
        </span>
        <span
          dir="rtl"
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "65%",
            textAlign: "right",
          }}
        >
          {product.name || "—"}
        </span>
      </div>

      {/* Bottom row: english/sku (right) + price (left, bold) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "2mm",
        }}
      >
        <span
          dir="ltr"
          style={{
            fontSize: "9pt",
            fontWeight: 800,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          LE {price.toFixed(2)}
        </span>
        <span
          dir="ltr"
          style={{
            fontSize: "5.5pt",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "55%",
            color: "#444",
          }}
        >
          {product.name_en || product.sku || ""}
        </span>
      </div>
    </div>
  );
}

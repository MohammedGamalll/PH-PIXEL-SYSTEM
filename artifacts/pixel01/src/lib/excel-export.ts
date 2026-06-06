import * as XLSX from "xlsx";

export function exportToExcel(filename: string, sheets: { name: string; rows: any[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows ?? []);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function exportSingleSheet(filename: string, rows: any[], sheetName = "Sheet1") {
  exportToExcel(filename, [{ name: sheetName, rows }]);
}

// Products export schema matching import-products columns
export function exportProductsLikeImport(products: any[]) {
  const rows = products.map((p) => ({
    name: p.name,
    sku: p.sku ?? "",
    barcode: p.barcode ?? "",
    category: p.category_name ?? "",
    brand: p.brand_name ?? "",
    unit: p.unit ?? "",
    cost: p.cost ?? 0,
    price: p.price ?? 0,
    stock: p.stock ?? 0,
    low_stock_threshold: p.low_stock_threshold ?? 0,
    has_expiry: p.has_expiry ? "yes" : "no",
    is_active: p.is_active ? "yes" : "no",
  }));
  exportSingleSheet(`products-${new Date().toISOString().slice(0, 10)}.xlsx`, rows, "Products");
}

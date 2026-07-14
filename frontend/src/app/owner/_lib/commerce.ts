export type OwnerProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  sale_price_vnd: number;
  stock_quantity: number;
  is_active: boolean;
};

export type OwnerInvoiceItem = {
  id: string;
  item_type: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price_vnd: number;
  line_total_vnd: number;
};

export type OwnerInvoice = {
  id: string;
  invoice_code: string;
  customer_full_name?: string | null;
  customer_email?: string | null;
  status: string;
  payment_method: string;
  subtotal_vnd: number;
  discount_vnd: number;
  total_vnd: number;
  issued_at: string;
  paid_at?: string | null;
  source: string;
  items: OwnerInvoiceItem[];
};

export type OwnerCommerceDaily = {
  date: string;
  total_revenue_vnd: number;
  court_revenue_vnd: number;
  water_revenue_vnd: number;
  shuttlecock_revenue_vnd: number;
};

export type OwnerCommerceDashboard = {
  total_revenue_vnd: number;
  court_revenue_vnd: number;
  water_revenue_vnd: number;
  shuttlecock_revenue_vnd: number;
  paid_invoice_count: number;
  pending_invoice_count: number;
  daily: OwnerCommerceDaily[];
  recent_invoices: OwnerInvoice[];
};

export function productCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    water: "Nước uống",
    shuttlecock: "Cầu lông",
  };
  return labels[category] ?? category;
}

export function invoiceStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    paid: "Đã thanh toán",
    pending: "Chờ thanh toán",
    draft: "Chờ thanh toán",
    cancelled: "Đã hủy",
    void: "Đã hủy",
    refunded: "Đã hoàn tiền",
  };
  return labels[status] ?? status;
}

export function invoicePaymentLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Tiền mặt",
    bank_transfer: "Chuyển khoản",
  };
  return labels[method] ?? method;
}

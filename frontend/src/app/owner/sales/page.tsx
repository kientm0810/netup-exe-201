"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  PageHero,
  StatCard,
  inputClassName,
} from "@/components/ui";
import { apiFetch } from "@/lib/http";
import { errorMessage, formatFullDateTime, formatVnd } from "@/lib/format";

import {
  invoicePaymentLabel,
  invoiceStatusLabel,
  productCategoryLabel,
  type OwnerInvoice,
  type OwnerProduct,
} from "../_lib/commerce";

type PaymentMethod = "cash" | "bank_transfer";

function invoiceTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "pending" || status === "draft") return "warning";
  if (status === "cancelled" || status === "void" || status === "refunded") return "danger";
  return "neutral";
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    owner_pos: "Bán tại quầy",
    owner: "Bán tại quầy",
    booking: "Đặt sân",
  };
  return labels[source] ?? source;
}

function invoiceItemTypeLabel(itemType: string): string {
  const labels: Record<string, string> = {
    court_rental: "Thuê sân",
    water: "Nước uống",
    shuttlecock: "Cầu lông",
  };
  return labels[itemType] ?? itemType;
}

export default function OwnerSalesPage() {
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [invoices, setInvoices] = useState<OwnerInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<OwnerInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"product" | "invoice" | "restock" | "" | string>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("water");
  const [unit, setUnit] = useState("chai");
  const [salePrice, setSalePrice] = useState("10000");
  const [initialStock, setInitialStock] = useState("0");
  const [restockQuantities, setRestockQuantities] = useState<Record<string, string>>({});

  const [customerEmail, setCustomerEmail] = useState("");
  const [rentalAmount, setRentalAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});

  const activeProducts = useMemo(() => products.filter((product) => product.is_active), [products]);
  const lowStockCount = useMemo(
    () => activeProducts.filter((product) => Number(product.stock_quantity) <= 10).length,
    [activeProducts],
  );
  const inventoryValue = useMemo(
    () =>
      activeProducts.reduce(
        (total, product) => total + Number(product.stock_quantity) * Number(product.sale_price_vnd),
        0,
      ),
    [activeProducts],
  );
  const invoicePreview = useMemo(() => {
    const productTotal = activeProducts.reduce(
      (total, product) =>
        total + (Number(itemQuantities[product.id]) || 0) * Number(product.sale_price_vnd),
      0,
    );
    return {
      productTotal,
      total: productTotal + (Number(rentalAmount) || 0),
    };
  }, [activeProducts, itemQuantities, rentalAmount]);

  async function loadSales() {
    setError("");
    try {
      const [nextProducts, nextInvoices] = await Promise.all([
        apiFetch<OwnerProduct[]>("/api/v1/owner/products", { credentials: "include" }),
        apiFetch<OwnerInvoice[]>("/api/v1/owner/invoices", { credentials: "include" }),
      ]);
      setProducts(nextProducts);
      setInvoices(nextInvoices);
    } catch (caught) {
      setError(errorMessage(caught, "Không tải được dữ liệu bán hàng"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSales();
  }, []);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting("product");
    try {
      await apiFetch<OwnerProduct>("/api/v1/owner/products", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          sku: sku.trim(),
          name: productName.trim(),
          category,
          unit: unit.trim(),
          sale_price_vnd: Number(salePrice),
          stock_quantity: Number(initialStock),
        }),
      });
      setSku("");
      setProductName("");
      setInitialStock("0");
      setMessage("Đã thêm sản phẩm vào danh mục bán tại quầy.");
      await loadSales();
    } catch (caught) {
      setError(errorMessage(caught, "Không tạo được sản phẩm"));
    } finally {
      setSubmitting("");
    }
  }

  async function restock(product: OwnerProduct) {
    const quantity = Number(restockQuantities[product.id]);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Số lượng nhập kho phải là số nguyên lớn hơn 0.");
      return;
    }
    setError("");
    setMessage("");
    setSubmitting(`restock-${product.id}`);
    try {
      await apiFetch<OwnerProduct>(`/api/v1/owner/products/${product.id}/restock`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ quantity }),
      });
      setRestockQuantities((current) => ({ ...current, [product.id]: "" }));
      setMessage(`Đã nhập thêm ${quantity} ${product.unit} ${product.name}.`);
      await loadSales();
    } catch (caught) {
      setError(errorMessage(caught, "Không nhập thêm được tồn kho"));
    } finally {
      setSubmitting("");
    }
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = activeProducts
      .map((product) => ({ product_id: product.id, quantity: Number(itemQuantities[product.id]) || 0 }))
      .filter((item) => item.quantity > 0);
    if ((Number(rentalAmount) || 0) <= 0 && items.length === 0) {
      setError("Hóa đơn cần có tiền thuê sân hoặc ít nhất một sản phẩm.");
      return;
    }
    if (items.some((item) => !Number.isInteger(item.quantity))) {
      setError("Số lượng sản phẩm phải là số nguyên.");
      return;
    }

    setError("");
    setMessage("");
    setSubmitting("invoice");
    try {
      const created = await apiFetch<OwnerInvoice>("/api/v1/owner/invoices", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          ...(customerEmail.trim() ? { customer_email: customerEmail.trim() } : {}),
          rental_amount_vnd: Number(rentalAmount) || 0,
          payment_method: paymentMethod,
          ...(invoiceNote.trim() ? { note: invoiceNote.trim() } : {}),
          items,
        }),
      });
      setCustomerEmail("");
      setRentalAmount("0");
      setInvoiceNote("");
      setItemQuantities({});
      setSelectedInvoice(created);
      setMessage(`Đã lập hóa đơn ${created.invoice_code}.`);
      await loadSales();
    } catch (caught) {
      setError(errorMessage(caught, "Không lập được hóa đơn"));
    } finally {
      setSubmitting("");
    }
  }

  async function viewInvoice(invoiceId: string) {
    setError("");
    setSubmitting(`detail-${invoiceId}`);
    try {
      const detail = await apiFetch<OwnerInvoice>(`/api/v1/owner/invoices/${invoiceId}`, {
        credentials: "include",
      });
      setSelectedInvoice(detail);
      window.setTimeout(() => {
        document.getElementById("invoice-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (caught) {
      setError(errorMessage(caught, "Không tải được chi tiết hóa đơn"));
    } finally {
      setSubmitting("");
    }
  }

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Quầy bán hàng"
        title="Bán nước, cầu và lập hóa đơn ngay tại sân."
        description="Quản lý danh mục, tồn kho và gộp tiền thuê sân với sản phẩm vào một hóa đơn rõ ràng cho khách."
        actions={
          <Button type="button" variant="outline" onClick={() => void loadSales()} disabled={loading}>
            Làm mới dữ liệu
          </Button>
        }
        aside={
          <div className="flex min-h-[190px] flex-col justify-between rounded-lg bg-gradient-to-br from-red-950 via-red-800 to-amber-600 p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-100">NetUp POS</p>
            <div>
              <p className="text-3xl font-semibold">{formatVnd(invoicePreview.total)}</p>
              <p className="mt-1 text-sm text-red-100">Giá trị hóa đơn đang lập</p>
            </div>
          </div>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sản phẩm đang bán" value={activeProducts.length} helper={`${products.length} sản phẩm trong danh mục`} />
        <StatCard label="Sắp hết hàng" value={lowStockCount} helper="Tồn kho từ 10 đơn vị trở xuống" tone={lowStockCount ? "warning" : "success"} />
        <StatCard label="Giá trị tồn kho" value={formatVnd(inventoryValue)} helper="Theo giá bán hiện tại" tone="accent" />
        <StatCard label="Số hóa đơn" value={invoices.length} helper="Hóa đơn gần đây" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">Danh mục</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">Thêm sản phẩm bán tại quầy</h2>
            <p className="mt-1 text-sm text-slate-600">Tạo mã hàng riêng để theo dõi nước uống và cầu lông.</p>
          </div>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={createProduct}>
            <Field label="Mã sản phẩm (SKU)">
              <input
                className={inputClassName}
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="VD: NUOC-01"
                required
              />
            </Field>
            <Field label="Tên sản phẩm">
              <input
                className={inputClassName}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="Nước suối 500ml"
                required
              />
            </Field>
            <Field label="Nhóm sản phẩm">
              <select
                className={inputClassName}
                value={category}
                onChange={(event) => {
                  const next = event.target.value;
                  setCategory(next);
                  setUnit(next === "water" ? "chai" : "quả");
                }}
              >
                <option value="water">Nước uống</option>
                <option value="shuttlecock">Cầu lông</option>
              </select>
            </Field>
            <Field label="Đơn vị tính">
              <input className={inputClassName} value={unit} onChange={(event) => setUnit(event.target.value)} required />
            </Field>
            <Field label="Giá bán (VNĐ)">
              <input
                className={inputClassName}
                type="number"
                min="0"
                step="1000"
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
                required
              />
            </Field>
            <Field label="Tồn kho ban đầu">
              <input
                className={inputClassName}
                type="number"
                min="0"
                step="1"
                value={initialStock}
                onChange={(event) => setInitialStock(event.target.value)}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Button disabled={submitting === "product"}>
                {submitting === "product" ? "Đang thêm..." : "Thêm sản phẩm"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">Kho tại quầy</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">Tồn kho sản phẩm</h2>
          </div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Đang tải tồn kho...</p> : null}
          {!loading && products.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Chưa có sản phẩm. Hãy tạo sản phẩm đầu tiên ở biểu mẫu bên cạnh.
            </div>
          ) : null}
          <div className="max-h-[470px] space-y-3 overflow-y-auto pr-1">
            {products.map((product) => (
              <article key={product.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">{product.name}</h3>
                      <Badge tone={product.is_active ? "success" : "neutral"}>
                        {product.is_active ? "Đang bán" : "Tạm ngưng"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {product.sku} · {productCategoryLabel(product.category)} · {formatVnd(product.sale_price_vnd)}/{product.unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-semibold ${Number(product.stock_quantity) <= 10 ? "text-amber-700" : "text-slate-950"}`}>
                      {product.stock_quantity}
                    </p>
                    <p className="text-xs text-slate-500">{product.unit} còn lại</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label={`Số lượng nhập thêm cho ${product.name}`}
                    className={`${inputClassName} max-w-36`}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Nhập thêm"
                    value={restockQuantities[product.id] ?? ""}
                    onChange={(event) =>
                      setRestockQuantities((current) => ({ ...current, [product.id]: event.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void restock(product)}
                    disabled={submitting === `restock-${product.id}`}
                  >
                    {submitting === `restock-${product.id}` ? "Đang nhập..." : "Nhập kho"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">Hóa đơn mới</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">Tính tiền thuê sân và hàng tại quầy</h2>
            <p className="mt-1 text-sm text-slate-600">Nhập email để hóa đơn đồng thời xuất hiện trong lịch sử của người chơi.</p>
          </div>

          <form className="space-y-5" onSubmit={createInvoice}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email khách hàng" helper="Có thể bỏ trống với khách vãng lai.">
                <input
                  className={inputClassName}
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="player@fpt.edu.vn"
                />
              </Field>
              <Field label="Tiền thuê sân (VNĐ)">
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="1000"
                  value={rentalAmount}
                  onChange={(event) => setRentalAmount(event.target.value)}
                />
              </Field>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Sản phẩm bán kèm</p>
              {activeProducts.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-500">Chưa có sản phẩm đang bán.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeProducts.map((product) => (
                    <label key={product.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{product.name}</span>
                        <span className="block text-xs text-slate-500">
                          {formatVnd(product.sale_price_vnd)}/{product.unit} · còn {product.stock_quantity}
                        </span>
                      </span>
                      <input
                        aria-label={`Số lượng ${product.name}`}
                        className={`${inputClassName} w-20 shrink-0 text-center`}
                        type="number"
                        min="0"
                        max={Math.max(0, Number(product.stock_quantity))}
                        step="1"
                        value={itemQuantities[product.id] ?? "0"}
                        onChange={(event) =>
                          setItemQuantities((current) => ({ ...current, [product.id]: event.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phương thức thanh toán">
                <select
                  className={inputClassName}
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                >
                  <option value="cash">Tiền mặt</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                </select>
              </Field>
              <Field label="Ghi chú">
                <input
                  className={inputClassName}
                  value={invoiceNote}
                  onChange={(event) => setInvoiceNote(event.target.value)}
                  placeholder="Khung giờ, số sân..."
                />
              </Field>
            </div>

            <div className="rounded-lg bg-slate-950 p-4 text-white">
              <div className="flex justify-between gap-4 text-sm text-slate-300">
                <span>Thuê sân</span>
                <span>{formatVnd(Number(rentalAmount) || 0)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4 text-sm text-slate-300">
                <span>Nước và cầu</span>
                <span>{formatVnd(invoicePreview.productTotal)}</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-700 pt-3">
                <span className="font-semibold">Khách thanh toán</span>
                <span className="text-2xl font-semibold">{formatVnd(invoicePreview.total)}</span>
              </div>
            </div>
            <Button disabled={submitting === "invoice"}>
              {submitting === "invoice" ? "Đang lập hóa đơn..." : "Lập hóa đơn"}
            </Button>
          </form>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">Lịch sử</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">Hóa đơn gần đây</h2>
          </div>
          {!loading && invoices.length === 0 ? (
            <EmptyState
              className="border-0 bg-slate-50 shadow-none"
              title="Chưa có hóa đơn"
              description="Hóa đơn đầu tiên sẽ xuất hiện tại đây sau khi bạn tính tiền cho khách."
            />
          ) : null}
          <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{invoice.invoice_code}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatFullDateTime(invoice.issued_at)}</p>
                  </div>
                  <Badge tone={invoiceTone(invoice.status)}>{invoiceStatusLabel(invoice.status)}</Badge>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0 text-sm text-slate-600">
                    <p className="truncate">{invoice.customer_full_name || invoice.customer_email || "Khách vãng lai"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {invoicePaymentLabel(invoice.payment_method)} · {sourceLabel(invoice.source)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-red-800">{formatVnd(invoice.total_vnd)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => void viewInvoice(invoice.id)}
                  disabled={submitting === `detail-${invoice.id}`}
                >
                  {submitting === `detail-${invoice.id}` ? "Đang tải..." : "Xem chi tiết"}
                </Button>
              </article>
            ))}
          </div>
        </Card>
      </section>

      {selectedInvoice ? (
        <div id="invoice-detail" className="scroll-mt-6">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">Chi tiết hóa đơn</p>
                <h2 className="mt-2 font-heading text-2xl font-semibold text-ink">{selectedInvoice.invoice_code}</h2>
                <p className="mt-1 text-sm text-slate-500">{formatFullDateTime(selectedInvoice.issued_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={invoiceTone(selectedInvoice.status)}>{invoiceStatusLabel(selectedInvoice.status)}</Badge>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedInvoice(null)}>
                  Đóng
                </Button>
              </div>
            </div>

            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-500">Khách hàng</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {selectedInvoice.customer_full_name || selectedInvoice.customer_email || "Khách vãng lai"}
                </p>
                {selectedInvoice.customer_full_name && selectedInvoice.customer_email ? (
                  <p className="mt-1 text-slate-500">{selectedInvoice.customer_email}</p>
                ) : null}
              </div>
              <div>
                <p className="text-slate-500">Thanh toán</p>
                <p className="mt-1 font-semibold text-slate-900">{invoicePaymentLabel(selectedInvoice.payment_method)}</p>
              </div>
              <div>
                <p className="text-slate-500">Nguồn hóa đơn</p>
                <p className="mt-1 font-semibold text-slate-900">{sourceLabel(selectedInvoice.source)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nội dung</th>
                    <th className="px-4 py-3 text-right">Số lượng</th>
                    <th className="px-4 py-3 text-right">Đơn giá</th>
                    <th className="px-4 py-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(selectedInvoice.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{invoiceItemTypeLabel(item.item_type)}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatVnd(item.unit_price_vnd)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatVnd(item.line_total_vnd)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right font-semibold text-slate-600">Tạm tính</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatVnd(selectedInvoice.subtotal_vnd)}</td>
                  </tr>
                  {Number(selectedInvoice.discount_vnd) > 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-slate-600">Giảm giá</td>
                      <td className="px-4 py-2 text-right text-emerald-700">-{formatVnd(selectedInvoice.discount_vnd)}</td>
                    </tr>
                  ) : null}
                  <tr className="text-base">
                    <td colSpan={3} className="px-4 py-3 text-right font-semibold text-slate-900">Tổng cộng</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-800">{formatVnd(selectedInvoice.total_vnd)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

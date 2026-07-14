"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge, Button, Card, EmptyState, Notice, PageHero, StatCard } from "@/components/ui";
import { errorMessage, formatFullDateTime, formatVnd } from "@/lib/format";
import { apiFetch } from "@/lib/http";

type BillItem = {
  id: string;
  item_type: "court_rental" | "water" | "shuttlecock";
  description: string;
  unit: string;
  quantity: number;
  unit_price_vnd: number;
  line_total_vnd: number;
};

type Bill = {
  id: string;
  invoice_code: string;
  owner_name: string;
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
  note?: string | null;
  items: BillItem[];
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    paid: "Đã thanh toán",
    pending: "Chờ thanh toán",
    cancelled: "Đã hủy",
    refunded: "Đã hoàn tiền",
  };
  return labels[status] ?? status;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "Tiền mặt",
    bank_transfer: "Chuyển khoản",
    vnpay: "VNPay",
  };
  return labels[method] ?? method;
}

function itemTypeLabel(type: string) {
  const labels: Record<string, string> = {
    court_rental: "Thuê sân",
    court: "Thuê sân",
    shuttlecock: "Cầu lông",
    shuttle: "Cầu lông",
    drink: "Nước uống",
    water: "Nước uống",
    beverage: "Nước uống",
  };
  return labels[type] ?? "Dịch vụ";
}

function itemTone(type: string): "accent" | "info" | "warning" | "neutral" {
  if (["court_rental", "court"].includes(type)) return "accent";
  if (["drink", "water", "beverage"].includes(type)) return "info";
  if (["shuttlecock", "shuttle"].includes(type)) return "warning";
  return "neutral";
}

export default function PlayerBillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const detailRequestRef = useRef(0);

  async function loadBillDetail(billId: string) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedBillId(billId);
    setSelectedBill(null);
    setDetailError("");
    setIsDetailLoading(true);

    try {
      const detail = await apiFetch<Bill>(`/api/v1/bills/${billId}`, {
        credentials: "include",
      });
      if (requestId === detailRequestRef.current) setSelectedBill(detail);
    } catch (caught) {
      if (requestId === detailRequestRef.current) {
        setDetailError(errorMessage(caught, "Không tải được chi tiết hóa đơn"));
      }
    } finally {
      if (requestId === detailRequestRef.current) setIsDetailLoading(false);
    }
  }

  async function loadBills() {
    setIsLoading(true);
    setError("");
    setDetailError("");

    try {
      const items = await apiFetch<Bill[]>("/api/v1/bills", {
        credentials: "include",
      });
      setBills(items);

      if (items.length) {
        await loadBillDetail(items[0].id);
      } else {
        setSelectedBillId(null);
        setSelectedBill(null);
      }
    } catch (caught) {
      setBills([]);
      setSelectedBillId(null);
      setSelectedBill(null);
      setError(errorMessage(caught, "Không tải được hóa đơn của bạn"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadBills();
  }, []);

  const paidBills = useMemo(() => bills.filter((bill) => bill.status === "paid"), [bills]);
  const totalPaid = useMemo(
    () => paidBills.reduce((total, bill) => total + bill.total_vnd, 0),
    [paidBills],
  );
  const totalItems = useMemo(
    () => bills.reduce((total, bill) => total + (bill.items?.length ?? 0), 0),
    [bills],
  );

  return (
    <div className="space-y-6 pb-20">
      <PageHero
        eyebrow="Tài khoản của tôi"
        title="Hóa đơn và lịch sử chi tiêu"
        description="Xem lại từng lần thuê sân, mua cầu và nước tại CLB Badminton FPT. Chọn một hóa đơn để kiểm tra đầy đủ các hạng mục."
        aside={
          <div className="rounded-2xl border border-red-100 bg-red-50/70 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">Tổng đã thanh toán</p>
            <p className="mt-2 font-heading text-3xl font-black text-red-900">{formatVnd(totalPaid)}</p>
            <p className="mt-2 text-sm leading-6 text-red-800/75">Tính trên {paidBills.length} hóa đơn đã hoàn tất.</p>
          </div>
        }
      />

      {error ? (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadBills()}>
              Thử lại
            </Button>
          </div>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tổng hóa đơn" value={bills.length} helper="Các hóa đơn gắn với tài khoản" />
        <StatCard label="Đã thanh toán" value={paidBills.length} helper={formatVnd(totalPaid)} tone="success" />
        <StatCard label="Hạng mục đã mua" value={totalItems} helper="Thuê sân, cầu và nước" tone="accent" />
      </div>

      {isLoading ? (
        <Card className="py-16 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-red-800" />
          <p className="mt-4 text-sm font-semibold text-slate-500">Đang tải lịch sử hóa đơn...</p>
        </Card>
      ) : !error && bills.length === 0 ? (
        <EmptyState
          title="Bạn chưa có hóa đơn nào"
          description="Khi một hóa đơn thuê sân, mua cầu hoặc nước được gắn với tài khoản, hóa đơn sẽ xuất hiện tại đây."
        />
      ) : bills.length ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.4fr)]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-heading text-lg font-bold text-slate-900">Danh sách hóa đơn</h2>
              <p className="mt-1 text-xs text-slate-500">Mới nhất hiển thị trước</p>
            </div>
            <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
              {bills.map((bill) => {
                const active = selectedBillId === bill.id;
                return (
                  <button
                    key={bill.id}
                    type="button"
                    onClick={() => void loadBillDetail(bill.id)}
                    className={`w-full px-5 py-4 text-left transition ${
                      active ? "bg-red-50/80 shadow-[inset_3px_0_0_#991b1b]" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{bill.invoice_code}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatFullDateTime(bill.issued_at)}</p>
                      </div>
                      <Badge tone={statusTone(bill.status)} className="shrink-0 px-2 py-0.5 text-[10px]">
                        {statusLabel(bill.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <span className="text-xs text-slate-500">{bill.items?.length ?? 0} hạng mục</span>
                      <span className="font-heading text-base font-black text-red-800">{formatVnd(bill.total_vnd)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="min-h-[420px] p-0 lg:sticky lg:top-24">
            {isDetailLoading ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-red-800" />
                <p className="mt-4 text-sm font-semibold text-slate-500">Đang tải chi tiết hóa đơn...</p>
              </div>
            ) : detailError ? (
              <div className="p-5">
                <Notice tone="danger">
                  <div className="space-y-3">
                    <p>{detailError}</p>
                    {selectedBillId ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadBillDetail(selectedBillId)}>
                        Tải lại chi tiết
                      </Button>
                    ) : null}
                  </div>
                </Notice>
              </div>
            ) : selectedBill ? (
              <BillDetail bill={selectedBill} />
            ) : (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-slate-500">
                Chọn một hóa đơn để xem chi tiết.
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function BillDetail({ bill }: { bill: Bill }) {
  return (
    <article>
      <header className="border-b border-slate-200 bg-linear-to-br from-slate-950 to-slate-800 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-300">{bill.owner_name}</p>
            <h2 className="mt-2 font-heading text-2xl font-black">{bill.invoice_code}</h2>
            <p className="mt-1 text-sm text-slate-300">Phát hành {formatFullDateTime(bill.issued_at)}</p>
          </div>
          <Badge tone={statusTone(bill.status)}>{statusLabel(bill.status)}</Badge>
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-7">
        <dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Khách hàng</dt>
            <dd className="mt-1 font-bold text-slate-900">{bill.customer_full_name || "Tài khoản NetUp"}</dd>
            {bill.customer_email ? <dd className="mt-0.5 break-all text-xs text-slate-500">{bill.customer_email}</dd> : null}
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thanh toán</dt>
            <dd className="mt-1 font-bold text-slate-900">{paymentMethodLabel(bill.payment_method)}</dd>
            <dd className="mt-0.5 text-xs text-slate-500">
              {bill.paid_at ? `Đã trả ${formatFullDateTime(bill.paid_at)}` : "Chưa ghi nhận thời gian thanh toán"}
            </dd>
          </div>
        </dl>

        {bill.note ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <span className="font-bold">Ghi chú: </span>
            {bill.note}
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-heading text-lg font-bold text-slate-900">Chi tiết dịch vụ</h3>
            <span className="text-xs font-semibold text-slate-500">{bill.items.length} hạng mục</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="hidden grid-cols-[minmax(0,1fr)_70px_120px_130px] gap-3 bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Dịch vụ</span>
              <span className="text-right">SL</span>
              <span className="text-right">Đơn giá</span>
              <span className="text-right">Thành tiền</span>
            </div>
            <div className="divide-y divide-slate-100">
              {bill.items.map((item) => (
                <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_70px_120px_130px] sm:items-center">
                  <div className="min-w-0">
                    <Badge tone={itemTone(item.item_type)} className="mb-2 px-2 py-0.5 text-[10px]">
                      {itemTypeLabel(item.item_type)}
                    </Badge>
                    <p className="text-sm font-bold text-slate-900">{item.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Đơn vị: {item.unit}</p>
                  </div>
                  <div className="flex justify-between text-sm sm:block sm:text-right">
                    <span className="text-slate-500 sm:hidden">Số lượng</span>
                    <span className="font-semibold text-slate-800">{item.quantity}</span>
                  </div>
                  <div className="flex justify-between text-sm sm:block sm:text-right">
                    <span className="text-slate-500 sm:hidden">Đơn giá</span>
                    <span className="text-slate-700">{formatVnd(item.unit_price_vnd)}</span>
                  </div>
                  <div className="flex justify-between text-sm sm:block sm:text-right">
                    <span className="font-semibold text-slate-500 sm:hidden">Thành tiền</span>
                    <span className="font-black text-slate-900">{formatVnd(item.line_total_vnd)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <dl className="ml-auto max-w-sm space-y-2 text-sm">
          <div className="flex items-center justify-between gap-6 text-slate-600">
            <dt>Tạm tính</dt>
            <dd>{formatVnd(bill.subtotal_vnd)}</dd>
          </div>
          <div className="flex items-center justify-between gap-6 text-slate-600">
            <dt>Giảm giá</dt>
            <dd>{bill.discount_vnd ? `- ${formatVnd(bill.discount_vnd)}` : formatVnd(0)}</dd>
          </div>
          <div className="flex items-end justify-between gap-6 border-t border-slate-200 pt-3">
            <dt className="font-bold text-slate-900">Tổng cộng</dt>
            <dd className="font-heading text-2xl font-black text-red-800">{formatVnd(bill.total_vnd)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

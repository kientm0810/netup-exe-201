"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

import { Badge, Button, ButtonLink, Card, EmptyState, Field, Notice, PageHero } from "@/components/ui";
import { apiFetch } from "@/lib/http";
import {
  bookingModeLabel,
  bookingStatusLabel,
  courtImageForSport,
  errorMessage,
  formatTimeRange,
  formatVnd,
  paymentMethodLabel,
  postTypeLabel,
  sportLabel,
} from "@/lib/format";

type BookingMode = "solo" | "full_court";
type PaymentMethod = "vnpay" | "cash";
type PaymentMethodKey = "atm" | "visa" | "momo" | "zalopay" | "applepay" | "googlepay" | "cash";

type SessionDetail = {
  id: string;
  title: string;
  post_type: string;
  status: string;
  starts_at: string;
  duration_minutes: number;
  open_slots: number;
  max_slots: number;
  slot_price_vnd: number;
  full_court_price_vnd: number;
  allows_solo_join: boolean;
  court_name: string;
  sub_court_name: string;
  sport: string;
  complex_name: string;
  district: string;
  address?: string;
  amenities?: string[];
  rating?: string;
  distance?: string;
};

type BookingResult = {
  id: string;
  booking_code: string;
  status: string;
  total_price_vnd: number;
  deposit_required_vnd: number;
  remaining_due_vnd: number;
  payment_method: string;
  session_id: string;
};

type DepositIntent = {
  booking_id: string;
  booking_code: string;
  payment_transaction_id: string;
  external_ref: string;
  amount_vnd: number;
  status: string;
  expires_at: string | null;
  payment_url: string;
};

function BookingCreateContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId") ?? "";
  const sessionIdsParam = searchParams.get("sessionIds") ?? "";
  const modeParam = searchParams.get("mode");
  
  // URL Params for payment result
  const statusParam = searchParams.get("status");
  const bookingIdParam = searchParams.get("bookingId");

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Đang tải thông tin thanh toán...");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [mode, setMode] = useState<BookingMode>(modeParam === "full_court" ? "full_court" : "solo");
  const [seatsBooked, setSeatsBooked] = useState("1");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodKey>("atm"); // default to ATM (vnpay) which is active

  // Success states
  const [successBooking, setSuccessBooking] = useState<any | null>(null);
  const [successSession, setSuccessSession] = useState<SessionDetail | null>(null);
  const [loadingSuccess, setLoadingSuccess] = useState(false);

  // Load details if payment is successful
  useEffect(() => {
    if (statusParam === "success" && bookingIdParam) {
      void loadSuccessDetails(bookingIdParam);
    }
  }, [statusParam, bookingIdParam]);

  async function loadSuccessDetails(id: string) {
    setLoadingSuccess(true);
    setError("");
    try {
      const bookingData = await apiFetch<any>(`/api/v1/player/bookings/${id}`, {
        credentials: "include",
      });
      setSuccessBooking(bookingData);

      if (bookingData.session_id) {
        const sessionData = await apiFetch<SessionDetail>(`/api/v1/player/sessions/${bookingData.session_id}`, {
          credentials: "include",
        });
        setSuccessSession(sessionData);
      }
    } catch (caught) {
      setError(errorMessage(caught, "Không tải được thông tin hóa đơn thanh toán"));
    } finally {
      setLoadingSuccess(false);
    }
  }

  async function loadSession() {
    const idsToFetch = sessionIdsParam ? sessionIdsParam.split(",") : (sessionId ? [sessionId] : []);
    
    if (idsToFetch.length === 0 || !idsToFetch[0]) {
      setSession(null);
      setMessage("Hãy chọn một khung giờ từ trang đặt sân trước.");
      return;
    }

    setError("");
    try {
      if (idsToFetch.length === 1) {
        const detail = await apiFetch<SessionDetail>(`/api/v1/player/sessions/${idsToFetch[0]}`, {
          credentials: "include",
        });
        setSession(detail);
        if (!detail.allows_solo_join || modeParam === "full_court") {
          setMode("full_court");
        }
      } else {
        let combined: SessionDetail | null = null;
        for (const id of idsToFetch) {
          const detail = await apiFetch<SessionDetail>(`/api/v1/player/sessions/${id}`, {
            credentials: "include",
          });
          if (!combined) {
            combined = detail;
          } else {
            combined.duration_minutes += detail.duration_minutes;
            combined.slot_price_vnd += detail.slot_price_vnd;
            combined.full_court_price_vnd += detail.full_court_price_vnd;
          }
        }
        setSession(combined);
        setMode("full_court"); // Multiple slots must be full court for now
      }
      setMessage("Vui lòng chọn phương thức thanh toán để xác nhận giữ chỗ.");
    } catch (caught) {
      setSession(null);
      setError(errorMessage(caught, "Không tải được chi tiết phiên sân"));
      setMessage("Không thể mở form thanh toán.");
    }
  }

  useEffect(() => {
    if (!statusParam) {
      void loadSession();
    }
  }, [sessionId, sessionIdsParam, statusParam]);

  const estimate = useMemo(() => {
    if (!session) return null;
    const seats = mode === "full_court" ? session.max_slots : Math.max(1, Math.min(2, Number(seatsBooked || "1")));
    const base = mode === "full_court" ? session.full_court_price_vnd : session.slot_price_vnd * seats;
    
    // Online checkout receives the VNPay promotion; cash is paid in full at the venue.
    const discount = selectedMethod === "cash" ? 0 : Math.round(base * 0.05);
    const total = base - discount;
    
    return { seats, base, discount, total };
  }, [mode, seatsBooked, selectedMethod, session]);

  // Combined function: Create booking -> get deposit intent -> redirect to VNPay
  async function handlePaymentSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !estimate) return;
    setIsSubmitting(true);
    setError("");

    try {
      // 1. Create booking payload
      const payload: Record<string, unknown> = {
        mode,
        payment_method: selectedMethod === "cash" ? "cash" : "vnpay",
      };
      const ids = sessionIdsParam ? sessionIdsParam.split(",") : (sessionId ? [sessionId] : []);
      if (ids.length > 1) {
        payload.session_ids = ids;
      } else {
        payload.session_id = ids[0];
      }
      
      if (mode === "solo") {
        payload.seats_booked = estimate.seats;
      }

      const createdBooking = await apiFetch<BookingResult>("/api/v1/player/bookings", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (selectedMethod === "cash") {
        await loadSuccessDetails(createdBooking.id);
        setIsSubmitting(false);
        return;
      }

      // 2. Request VNPay payment URL for deposit
      const intent = await apiFetch<DepositIntent>(`/api/v1/player/bookings/${createdBooking.id}/deposit-payment`, {
        method: "POST",
        credentials: "include",
      });

      // 3. Redirect user to VNPay Sandbox Gateway
      if (intent.payment_url) {
        window.location.href = intent.payment_url;
      } else {
        throw new Error("Không thể khởi tạo link thanh toán từ cổng VNPay.");
      }
    } catch (caught) {
      setError(errorMessage(caught, "Không thể hoàn tất thanh toán cọc"));
      setIsSubmitting(false);
    }
  }

  const sessionStartTime = useMemo(() => {
    if (!session?.starts_at) return "";
    const dateObj = new Date(session.starts_at);
    if (Number.isNaN(dateObj.getTime())) return "";
    return dateObj.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  }, [session]);

  const sessionTimeRange = useMemo(() => {
    if (!session) return "";
    const start = new Date(session.starts_at);
    if (Number.isNaN(start.getTime())) return "";
    const end = new Date(start.getTime() + session.duration_minutes * 60_000);
    const format = (value: Date) => value.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return `${format(start)} - ${format(end)}`;
  }, [session]);

  // Render Loading Success State
  if (statusParam === "success" && loadingSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-[#b00c14] animate-spin" />
        <p className="text-sm text-slate-500 font-bold animate-pulse">Đang tải kết quả thanh toán...</p>
      </div>
    );
  }

  // Render Payment Failed State
  if (statusParam === "failed") {
    return (
      <div className="max-w-md mx-auto my-12 text-center space-y-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
        <div className="h-16 w-16 mx-auto rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-black text-slate-900">Thanh toán thất bại</h1>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">
            Giao dịch thanh toán cọc qua VNPay không thành công hoặc đã bị huỷ bỏ. Vui lòng thử lại.
          </p>
        </div>
        {error && <Notice tone="danger" className="rounded-2xl">{error}</Notice>}
        <div className="flex flex-col gap-2.5 pt-2">
          {bookingIdParam && (
            <button
              onClick={async () => {
                setError("");
                setIsSubmitting(true);
                try {
                  const intent = await apiFetch<DepositIntent>(`/api/v1/player/bookings/${bookingIdParam}/deposit-payment`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (intent.payment_url) {
                    window.location.href = intent.payment_url;
                  }
                } catch (caught) {
                  setError(errorMessage(caught, "Không tạo được link thanh toán mới"));
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={isSubmitting}
              className="w-full flex h-11 items-center justify-center rounded-2xl bg-[#b00c14] hover:bg-[#900a10] text-sm font-bold text-white transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Đang xử lý..." : "Thanh toán lại booking này"}
            </button>
          )}
          <ButtonLink href="/player/discovery/?mode=booking" variant="outline" className="w-full justify-center">
            Quay lại tìm sân khác
          </ButtonLink>
        </div>
      </div>
    );
  }

  // Render Payment Success State (Success Page)
  if (successBooking) {
    const sBooking = successBooking;
    const sSession = successSession;

    const bookingStartTime = sBooking.session_starts_at
      ? new Date(sBooking.session_starts_at).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
      : "";

    const bookingTimeRange = sBooking.session_starts_at
      ? (() => {
          const start = new Date(sBooking.session_starts_at);
          const duration = sSession ? sSession.duration_minutes : 120;
          const end = new Date(start.getTime() + duration * 60_000);
          const format = (v: Date) => v.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
          return `${format(start)} - ${format(end)}`;
        })()
      : "";

    const paymentTimeFormatted = sBooking.updated_at
      ? (() => {
          const dateObj = new Date(sBooking.updated_at);
          const time = dateObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
          const date = dateObj.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
          return `${time} - ${date}`;
        })()
      : "";

    // Math calculation matching the checkout logic
    const basePrice = sBooking.base_price_vnd + sBooking.platform_fee_vnd + sBooking.floor_fee_vnd;
    const isCashBooking = sBooking.payment_method === "cash";
    const discountPrice = isCashBooking ? 0 : Math.round(basePrice * 0.05);

    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.1fr] xl:grid-cols-[1.15fr_1.15fr] items-start">
        {/* COLUMN LEFT: SUCCESS CONFIRMATION & QUICK CARD */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-8 flex flex-col items-center text-center space-y-5">
            <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h1 className="font-heading text-3xl font-black text-slate-900 tracking-tight">
                {isCashBooking ? "Đặt sân thành công!" : <>Thanh toán <span className="text-emerald-600">thành công!</span></>}
              </h1>
              <p className="text-sm text-slate-500 font-semibold leading-relaxed">
                {isCashBooking ? "Vui lòng thanh toán khi check-in tại sân." : <>Bạn đã tham gia trận đấu thành công. <br />Hẹn gặp bạn trên sân!</>}
              </p>
            </div>

            {/* Quick Session Card */}
            <div className="w-full text-left bg-slate-50 border border-slate-150 rounded-2xl p-4.5 space-y-3.5 mt-2">
              <div className="flex gap-4">
                <div className="relative h-18 w-24 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  <img
                    src={courtImageForSport(sBooking.sport || "Pickleball")}
                    alt={sBooking.court_name || "Sân chơi"}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[8px] font-bold backdrop-blur-xs">
                    {sBooking.court_name || "Sân 1"}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-heading font-extrabold text-slate-900 text-sm truncate">{sBooking.complex_name}</h3>
                  <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    📍 {sBooking.district || "Hà Nội"}
                  </p>
                  <div className="flex gap-1.5 pt-1">
                    <span className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-700 font-bold rounded text-[8px]">{sportLabel(sBooking.sport)}</span>
                    <span className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-700 font-bold rounded text-[8px]">Có chỗ gửi xe</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200/60 pt-3 flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-semibold">Thời gian:</span>
                  <span>{bookingTimeRange}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-normal self-center">{bookingStartTime}</div>
              </div>
            </div>

            {/* Notification Notice */}
            <div className="bg-emerald-50 text-emerald-800 p-4.5 rounded-2xl border border-emerald-100 text-xs font-semibold leading-relaxed flex gap-2.5 w-full text-left">
              <span className="text-base">🔔</span>
              <p>Chúng tôi sẽ thông báo khi đủ người hoặc có cập nhật về trận đấu. Vui lòng có mặt trước giờ thi đấu 15 phút.</p>
            </div>

            <ButtonLink href="/player/discovery/?mode=booking" className="w-full justify-center h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 text-sm font-bold text-white transition">
              🏠 Về trang chủ
            </ButtonLink>
          </div>
        </div>

        {/* COLUMN RIGHT: BILL DETAILS */}
        <div className="space-y-4">
          <h2 className="font-heading text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            Chi tiết thanh toán
          </h2>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 space-y-6">
            
            {/* Header Transaction Status */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px]">✓</span>
                {isCashBooking ? "Thanh toán tại sân" : "Thanh toán thành công"}
              </div>
              <span className="text-xs text-slate-450 font-bold">Mã đơn: #{sBooking.booking_code}</span>
            </div>

            {/* Game Info Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thông tin trận đấu</h3>
              
              <div className="flex gap-4">
                <div className="relative h-20 w-28 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                  <img
                    src={courtImageForSport(sBooking.sport || "Pickleball")}
                    alt={sBooking.court_name || "Sân chơi"}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-white text-[9px] font-bold backdrop-blur-xs">
                    {sBooking.court_name || "Sân 1"}
                  </div>
                </div>

                <div className="flex-1 space-y-1">
                  <h4 className="font-heading font-extrabold text-slate-900 text-sm">{sBooking.complex_name}</h4>
                  <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    📍 {sSession?.address || sBooking.district || "Hà Nội"}
                  </p>
                  
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[8px]">{sportLabel(sBooking.sport)}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[8px]">⚡ 2.1 km</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[8px]">🚘 Có chỗ gửi xe</span>
                  </div>

                  {sSession && (
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-[11px] font-extrabold text-slate-700">
                        {sSession.max_slots - sSession.open_slots} / {sSession.max_slots} người
                      </span>
                      {sSession.open_slots > 0 ? (
                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-[8px] font-bold text-[#b00c14] border border-red-100 uppercase animate-pulse">
                          Thiếu {sSession.open_slots} người
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[8px] font-bold text-emerald-600 border border-emerald-100 uppercase">
                          Đủ người
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Details */}
            <div className="border-t border-slate-100 pt-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chi tiết thanh toán</h3>

              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-semibold text-slate-500">
                  <span>Phí tham gia</span>
                  <span>{formatVnd(basePrice)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-emerald-600">
                  <span>{isCashBooking ? "Ưu đãi" : "Ưu đãi (VNPay -5%)"}</span>
                  <span>{isCashBooking ? formatVnd(0) : `-${formatVnd(discountPrice)}`}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-800">Tổng thanh toán</span>
                  <span className="text-base font-black text-slate-900">{formatVnd(sBooking.total_price_vnd)}</span>
                </div>
              </div>
            </div>

            {/* Paid Method Details */}
            <div className="border-t border-slate-100 pt-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phương thức thanh toán</h3>
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs text-sm">
                    {isCashBooking ? "💵" : <span className="text-[11px] font-black tracking-tight"><span className="text-[#ed1c24]">VN</span><span className="text-[#005baa]">PAY</span></span>}
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-slate-800">{isCashBooking ? "Tiền mặt tại sân" : "Thẻ ATM / Tài khoản ngân hàng"}</p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{isCashBooking ? "Thanh toán toàn bộ khi check-in tại sân" : "Thanh toán cọc qua cổng VNPay"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-extrabold text-emerald-600">{isCashBooking ? "Thanh toán tại sân" : `Đã cọc: ${formatVnd(sBooking.deposit_required_vnd)}`}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">Còn lại: {formatVnd(sBooking.remaining_due_vnd)} (tại sân)</p>
                </div>
              </div>
            </div>

            {/* Time of Payment */}
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 border-t border-slate-100 pt-5">
              <span className="text-slate-400 font-bold">Thời gian thanh toán</span>
              <span>{paymentTimeFormatted}</span>
            </div>

            {/* Security Notice */}
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-2xl p-3.5 text-[10px] font-bold flex gap-2 items-center justify-center">
              <span className="text-xs">✓</span> Thanh toán an toàn 100%. Thông tin được bảo mật tuyệt đối.
            </div>

            {/* Interactive PDF/Share Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => alert("Chức năng tải hóa đơn PDF đang được chuẩn bị.")}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-750 transition cursor-pointer"
              >
                📥 Tải hóa đơn
              </button>
              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard) {
                    void navigator.clipboard.writeText(window.location.href);
                    alert("Đã sao chép link hóa đơn thanh toán!");
                  }
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-750 transition cursor-pointer"
              >
                🔗 Chia sẻ
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Render standard checkout form (2 Columns: Method list & details list)
  if (!sessionId && !sessionIdsParam) {
    return (
      <EmptyState
        title="Chưa chọn khung giờ"
        description="Bạn cần vào trang đặt sân và chọn một khung giờ trước khi tạo booking."
        action={<ButtonLink href="/player/discovery/?mode=booking">Tìm sân ngay</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Title Section */}
      <div className="flex items-center gap-3">
        <Link 
          href="/player/discovery?mode=booking" 
          className="text-xs font-bold text-slate-500 hover:text-slate-900 transition flex items-center gap-1 cursor-pointer select-none"
        >
          ➔ Quay lại danh sách sân
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">
          Thanh toán <span className="text-[#b00c14]">tham gia trận đấu</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-3xl font-medium">
          Hoàn tất thanh toán để giữ chỗ và xác nhận tham gia trận đấu.
        </p>
      </div>

      {error && <Notice tone="danger" className="rounded-2xl">{error}</Notice>}

      {/* Main 2-Column Payment Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] items-start">
        
        {/* COLUMN 1: SELECT PAYMENT METHOD */}
        <div className="space-y-4">
          <h2 className="font-heading text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
            Chọn phương thức thanh toán
          </h2>

          <div className="grid gap-3">
            {[
              { 
                key: "momo", 
                title: "Ví điện tử MoMo", 
                isPromo: true, 
                promoText: "Ưu đãi", 
                discountText: "-5%",
                logo: (
                  <div className="h-8 w-8 rounded-lg bg-[#a50064] flex flex-col items-center justify-center text-white font-black text-[9px] leading-tight shrink-0 select-none">
                    <span>mo</span>
                    <span>mo</span>
                  </div>
                ),
                disabled: true
              },
              { 
                key: "zalopay", 
                title: "ZaloPay", 
                logo: (
                  <div className="h-8 w-8 rounded-lg bg-[#008fe5] flex flex-col items-center justify-center text-white font-bold text-[8px] leading-tight shrink-0 select-none">
                    <span className="font-extrabold text-[9px]">Zalo</span>
                    <span className="text-[7px]">Pay</span>
                  </div>
                ),
                disabled: true 
              },
              { 
                key: "atm", 
                title: "Thẻ ATM / Tài khoản ngân hàng", 
                sub: "Hỗ trợ napas 247 qua VNPay Sandbox",
                logo: (
                  <div className="h-8 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 select-none shadow-xs">
                    <span className="text-[11px] font-black tracking-tight">
                      <span className="text-[#ed1c24]">VN</span>
                      <span className="text-[#005baa]">PAY</span>
                    </span>
                  </div>
                ),
                disabled: false 
              },
              { 
                key: "visa", 
                title: "Thẻ quốc tế (Visa, MasterCard, JCB)", 
                sub: "Thanh toán qua cổng bảo mật VNPay",
                logo: (
                  <div className="h-8 w-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center gap-0.5 px-1 shrink-0 select-none">
                    <span className="text-blue-850 font-black italic text-[9px]">VISA</span>
                    <div className="flex -space-x-1 ml-0.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500 opacity-90" />
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-500 opacity-90" />
                    </div>
                  </div>
                ),
                disabled: false 
              },
              {
                key: "cash",
                title: "Tiền mặt tại sân",
                sub: "Không cần thanh toán online. Thanh toán toàn bộ khi check-in tại sân.",
                logo: (
                  <div className="flex h-8 w-12 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-sm shrink-0 select-none">
                    💵
                  </div>
                ),
                disabled: false,
              },
              { 
                key: "applepay", 
                title: "Apple Pay", 
                logo: (
                  <div className="h-8 w-12 rounded-lg bg-black flex items-center justify-center text-white text-[9px] font-bold shrink-0 select-none">
                     Pay
                  </div>
                ),
                disabled: true 
              },
              { 
                key: "googlepay", 
                title: "Google Pay", 
                logo: (
                  <div className="h-8 w-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center gap-0.5 shrink-0 select-none">
                    <span className="text-blue-500 font-bold">G</span>
                    <span className="text-slate-700 font-bold text-[9px]">Pay</span>
                  </div>
                ),
                disabled: true 
              }
            ].map(method => {
              const isSelected = selectedMethod === method.key;
              return (
                <button
                  key={method.key}
                  type="button"
                  disabled={method.disabled}
                  onClick={() => !method.disabled && setSelectedMethod(method.key as PaymentMethodKey)}
                  className={`w-full flex items-center gap-4 p-4.5 rounded-2xl border text-left transition select-none ${
                    method.disabled 
                      ? "bg-slate-50/70 border-slate-200/50 opacity-55 cursor-not-allowed" 
                      : isSelected 
                      ? "border-[#b00c14] bg-red-50/5/10 ring-1 ring-[#b00c14] cursor-pointer" 
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                  }`}
                >
                  {/* Radio Indicator */}
                  <div className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? "border-[#b00c14] bg-[#b00c14]" : "border-slate-300"
                  }`}>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>

                  {/* Logo */}
                  {method.logo}

                  {/* Text details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-slate-800 truncate">{method.title}</p>
                      {method.isPromo && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[8px] font-bold text-emerald-600 border border-emerald-100 uppercase">
                          {method.promoText}
                        </span>
                      )}
                      {method.discountText && (
                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-[8px] font-bold text-[#b00c14] border border-red-100 uppercase">
                          {method.discountText}
                        </span>
                      )}
                      {method.disabled && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-bold text-slate-400 border border-slate-200 uppercase">
                          Đang phát triển
                        </span>
                      )}
                    </div>
                    {method.sub && <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{method.sub}</p>}
                  </div>
                </button>
              );
            })}
          </div>
          
          <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 pt-2">
            🛡 Thông tin thanh toán của bạn được bảo mật tuyệt đối.
          </p>
        </div>

        {/* COLUMN 2: BOOKING SUMMARY & PRICING */}
        <div className="space-y-4">
          <h2 className="font-heading text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
            Thông tin trận đấu
          </h2>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-5 space-y-5">
            
            {/* Session Card */}
            {session ? (
              <div className="space-y-4">
                <div className="relative h-28 rounded-2xl overflow-hidden bg-slate-100">
                  <img
                    src={courtImageForSport(session.sport)}
                    alt={session.court_name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold backdrop-blur-xs">
                    {session.court_name}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-heading font-extrabold text-slate-900 text-sm">{session.complex_name}</h3>
                  <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5">
                    📍 {session.district}, Hà Nội
                  </p>
                  <div className="flex gap-2 pt-1">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[9px]">{sportLabel(session.sport)}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[9px]">Có chỗ gửi xe</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2 text-xs font-semibold text-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-450 font-medium">Thời gian:</span>
                    <span>{sessionTimeRange} <p className="text-[10px] text-slate-400 font-normal text-right mt-0.5">{sessionStartTime}</p></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-455 font-medium">Hình thức đặt:</span>
                    <span className="font-bold text-red-700">{bookingModeLabel(mode)}</span>
                  </div>
                  {mode === "solo" && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-455 font-medium">Số lượng slot:</span>
                      <div className="flex items-center gap-2">
                        <select
                          className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold bg-white cursor-pointer focus:outline-none"
                          value={seatsBooked}
                          onChange={(e) => setSeatsBooked(e.target.value)}
                        >
                          <option value="1">1 slot</option>
                          <option value="2">2 slots</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-8 animate-pulse">Đang tải thông tin trận đấu...</p>
            )}

            {/* Pricing details */}
            {estimate && (
              <div className="border-t border-slate-100 pt-4.5 space-y-2.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span className="text-slate-450">Tạm tính</span>
                  <span>{formatVnd(estimate.base)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-emerald-600">
                  <span className="text-slate-455 font-bold">{selectedMethod === "cash" ? "Ưu đãi" : "Ưu đãi (VNPay -5%)"}</span>
                  <span>-{formatVnd(estimate.discount)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-800">Tổng thanh toán</span>
                  <span className="text-xl font-black text-[#b00c14]">{formatVnd(estimate.total)}</span>
                </div>
              </div>
            )}

            {/* Submit button */}
            <div className="space-y-3 pt-2">
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-3 text-[10px] font-bold flex gap-2 items-center justify-center">
                <span className="text-xs">✓</span> Thanh toán an toàn 100%
              </div>

              <button
                type="button"
                onClick={handlePaymentSubmit}
                disabled={!session || isSubmitting}
                className="w-full flex h-11 items-center justify-center rounded-2xl bg-[#b00c14] hover:bg-[#900a10] text-sm font-bold text-white transition cursor-pointer shadow-md disabled:opacity-50 select-none"
              >
                {isSubmitting ? "Đang xử lý..." : `Thanh toán ${estimate ? formatVnd(estimate.total) : ""}`}
              </button>

              <p className="text-center text-[10px] text-slate-455 font-medium leading-relaxed">
                Bằng việc thanh toán, bạn đã đồng ý với <br />
                <a href="#" className="underline font-bold text-slate-600 hover:text-slate-900 transition">Điều khoản sử dụng</a> của NetUp.
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

export default function PlayerBookingCreatePage() {
  return (
    <Suspense fallback={<EmptyState title="Đang mở booking" description="NetUp đang chuẩn bị form đặt sân." />}>
      <BookingCreateContent />
    </Suspense>
  );
}

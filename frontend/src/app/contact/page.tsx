"use client";

import React, { useState } from "react";
import { API_BASE_URL, apiFetch } from "@/lib/http";
import { errorMessage } from "@/lib/format";

const fanpageUrl = process.env.NEXT_PUBLIC_NETUP_FACEBOOK_URL ?? "https://www.facebook.com/netup68";

function loginUrl() {
  return `${API_BASE_URL}/api/v1/auth/google/start`;
}

// Static marketing content.
const testimonials = [
  {
    quote: "Từ khi hợp tác với NetUP, lượng khách đặt sân tăng hơn 40%. Hệ thống quản lý lịch rất tiện lợi và chuyên nghiệp.",
    author: "Anh Hoàng Nam",
    role: "Chủ sân 268 Sports Complex",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&fit=crop&q=80",
    rating: 5.0
  },
  {
    quote: "Giao diện thân thiện, người chơi đặt sân nhanh chóng và chúng tôi không lo bị trùng lịch nhờ hệ thống đồng bộ thời gian thực.",
    author: "Chị Minh Thư",
    role: "Quản lý cụm sân Badminton Hòa Lạc",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&fit=crop&q=80",
    rating: 5.0
  },
  {
    quote: "NetUP giúp tối ưu hóa công suất sân trống vào giờ thấp điểm cực kỳ hiệu quả thông qua các gợi ý và chiến dịch kết nối người chơi.",
    author: "Anh Tiến Dũng",
    role: "Chủ đầu tư sân Pickleball X-Park",
    avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&fit=crop&q=80",
    rating: 5.0
  }
];

const faqs = [
  {
    question: "NetUP hỗ trợ chủ sân như thế nào?",
    answer: "NetUP cung cấp hệ thống quản lý lịch đặt sân thời gian thực, tích hợp cổng thanh toán cọc tự động, công cụ thống kê doanh thu chi tiết và giúp tiếp cận trực tiếp hàng ngàn người chơi thể thao trong khu vực xung quanh cụm sân.",
    colorClass: "bg-purple-50 text-purple-600 border-purple-100",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    )
  },
  {
    question: "Chi phí hợp tác với NetUP là bao nhiêu?",
    answer: "Chúng tôi áp dụng mô hình hợp tác linh hoạt và cực kỳ tối ưu cho chủ sân. Phí đăng ký khởi tạo hoàn toàn miễn phí, NetUP chỉ thu một tỷ lệ phần trăm nhỏ hoa hồng dựa trên các giao dịch đặt sân thành công được mang về từ hệ thống.",
    colorClass: "bg-emerald-50 text-emerald-600 border-emerald-100",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  },
  {
    question: "Thời gian triển khai hệ thống mất bao lâu?",
    answer: "Quá trình thiết lập, chuẩn hóa thông tin cụm sân và tích hợp lên ứng dụng NetUP diễn ra vô cùng nhanh chóng. Đội ngũ kỹ thuật hỗ trợ tận nơi và có thể hoàn thành việc bàn giao, hướng dẫn sử dụng trong vòng 24 đến 48 giờ làm việc.",
    colorClass: "bg-rose-50 text-rose-600 border-rose-100",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    )
  }
];

export default function ContactPage() {
  // Form state
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    partnerType: "",
    courtName: "",
    courtAddress: "",
    content: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [successPartnerType, setSuccessPartnerType] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Testimonial state
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSubmitSuccess(false);

    // Validation
    if (!formData.fullName.trim()) return setErrorMsg("Vui lòng nhập họ và tên.");
    if (!formData.phone.trim()) return setErrorMsg("Vui lòng nhập số điện thoại.");
    if (!formData.email.trim()) return setErrorMsg("Vui lòng nhập địa chỉ email.");
    if (!formData.partnerType) return setErrorMsg("Vui lòng chọn loại hình hợp tác.");
    if (!formData.courtName.trim()) return setErrorMsg("Vui lòng nhập tên sân hoặc tên doanh nghiệp.");
    if (!formData.courtAddress.trim()) return setErrorMsg("Vui lòng nhập địa chỉ sân.");

    setIsSubmitting(true);
    try {
      if (formData.partnerType === "owner") {
        await apiFetch("/api/v1/owner/requests", {
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            business_name: formData.courtName,
            contact_phone: formData.phone,
            facility_overview: [
              `Người liên hệ: ${formData.fullName}`,
              `Email: ${formData.email}`,
              `Địa chỉ sân: ${formData.courtAddress}`,
              formData.content ? `Ghi chú: ${formData.content}` : "",
            ].filter(Boolean).join("\n"),
          }),
        });
      } else {
        await apiFetch("/api/v1/public/contact-leads", {
          method: "POST",
          body: JSON.stringify({
            fullName: formData.fullName,
            phone: formData.phone,
            email: formData.email,
            partnerType: formData.partnerType,
            organizationName: formData.courtName,
            address: formData.courtAddress,
            message: formData.content || null,
            source: "contact_page",
          }),
        });
      }
      setIsSubmitting(false);
      setSuccessPartnerType(formData.partnerType);
      setSubmitSuccess(true);
      setFormData({
        fullName: "",
        phone: "",
        email: "",
        partnerType: "",
        courtName: "",
        courtAddress: "",
        content: ""
      });
    } catch (caught) {
      setIsSubmitting(false);
      const message = errorMessage(caught, "Không gửi được yêu cầu hợp tác.");
      setErrorMsg(
        message === "Thiếu token người dùng" || message === "user_unauthorized"
          ? "Vui lòng đăng nhập trước khi gửi yêu cầu trở thành chủ sân."
          : message,
      );
    }
  };

  const handleNextTestimonial = () => {
    setTestimonialIdx(prev => (prev + 1) % testimonials.length);
  };

  const handlePrevTestimonial = () => {
    setTestimonialIdx(prev => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const toggleFaq = (idx: number) => {
    setOpenFaqIdx(prev => (prev === idx ? null : idx));
  };

  return (
    <main className="fade-up mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8 space-y-8">
      
      {/* SECTION 1: HERO BANNER */}
      <section className="relative rounded-3xl overflow-hidden border border-slate-200/60 p-6 md:p-8 lg:p-10 flex flex-col justify-between min-h-[380px] pb-8 bg-slate-50 shadow-3xs">
        
        {/* Background Image & Left gradient overlay for readability */}
        <div className="absolute inset-0 z-0">
          <img
            src="/courts/backgroundchusan.jpg"
            alt="NetUP Background"
            className="w-full h-full object-cover"
          />
          {/* Lớp phủ thông minh: Trắng mờ trên mobile, gradient mượt mà trên màn hình lớn */}
          <div className="absolute inset-0 bg-white/90 lg:bg-transparent lg:bg-gradient-to-r lg:from-white lg:via-white/80 lg:to-transparent z-10" />
        </div>

        {/* Top Content: Intro & Right Stats */}
        <div className="relative z-20 flex flex-col lg:flex-row items-start justify-between gap-8 w-full">
          
          {/* Left Column: Intro text (Chữ màu tối nổi bật trên nền gradient sáng) */}
          <div className="space-y-4 max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#b00c14]">
              Liên hệ với chúng tôi
            </p>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-[40px] leading-tight">
              Hợp tác cùng NetUP, <br className="hidden sm:inline" />
              <span className="text-[#b00c14]">phát triển cộng đồng thể thao</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-lg font-semibold">
              NetUP luôn sẵn sàng đồng hành cùng các chủ sân, đối tác và nhà đầu tư để mang đến trải nghiệm tiện lợi và chuyên nghiệp nhất cho người chơi.
            </p>
          </div>

          {/* Right Column: Floating Stats and badge */}
          <div className="relative w-full lg:w-[400px] h-[200px] flex items-center justify-center lg:justify-end shrink-0 z-20">
            {/* Floating stat card: Tăng trưởng đặt sân */}
            <div className="absolute -top-4 right-0 bg-white/95 backdrop-blur-xs rounded-2xl border border-slate-150/60 p-3.5 shadow-md flex flex-col gap-1 w-[150px] sm:w-[170px] select-none pointer-events-none">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tăng trưởng đặt sân</p>
              <p className="text-lg sm:text-xl font-heading font-black text-emerald-600 flex items-center gap-1">
                +32%
              </p>
              <p className="text-[9px] text-slate-400 font-semibold">so với tháng trước</p>
              
              <div className="mt-2.5 flex items-end gap-1.5 h-10">
                <div className="w-2 rounded-t bg-red-650/30 h-[30%]" />
                <div className="w-2 rounded-t bg-red-650/40 h-[45%]" />
                <div className="w-2 rounded-t bg-red-650/50 h-[35%]" />
                <div className="w-2 rounded-t bg-red-650/70 h-[60%]" />
                <div className="w-2 rounded-t bg-red-650/80 h-[75%]" />
                <div className="w-2 rounded-t bg-[#b00c14] h-[95%]" />
              </div>
              <div className="mt-1 flex justify-between text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                <span>T1</span>
                <span>T2</span>
                <span>T3</span>
                <span>T4</span>
                <span>T5</span>
                <span>T6</span>
              </div>
            </div>

            {/* Red building badge overlay */}
            <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 lg:left-auto lg:right-[190px] flex h-14 w-14 items-center justify-center rounded-2xl bg-[#b00c14] text-white shadow-md border border-white/10">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <line x1="9" y1="22" x2="9" y2="16" />
                <path d="M9 16h6v6" />
                <path d="M8 6h2v2H8V6zM8 11h2v2H8v-2zM14 6h2v2h-2V6zM14 11h2v2h-2v-2z" />
              </svg>
            </div>
          </div>

        </div>

        {/* Bottom Content: 3 Features list laid out horizontally, wrapped in light glassmorphism cards */}
        <div className="relative z-20 w-full pt-4 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Feature 1 */}
          <div className="flex items-center gap-3 bg-white/85 backdrop-blur-xs border border-white/50 p-3 rounded-2xl shadow-3xs hover:shadow-xs transition duration-200">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-[#b00c14] shadow-2xs">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Tăng lượng đặt sân</h3>
              <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 font-medium leading-relaxed">
                Tiếp cận hàng ngàn người chơi mỗi ngày.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-center gap-3 bg-white/85 backdrop-blur-xs border border-white/50 p-3 rounded-2xl shadow-3xs hover:shadow-xs transition duration-200">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-[#b00c14] shadow-2xs">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Quản lý dễ dàng</h3>
              <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 font-medium leading-relaxed">
                Hệ thống quản lý lịch sân thông minh trực quan.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-center gap-3 bg-white/85 backdrop-blur-xs border border-white/50 p-3 rounded-2xl shadow-3xs hover:shadow-xs transition duration-200">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-[#b00c14] shadow-2xs">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Doanh thu tối ưu</h3>
              <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 font-medium leading-relaxed">
                Tối ưu công suất các khung giờ trống hiệu quả.
              </p>
            </div>
          </div>

        </div>

      </section>

      {/* SECTION 2: FORM & CONTACT INFO */}
      <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
        
        {/* Contact Info Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-3xs space-y-6 flex flex-col justify-between">
          <div>
            <h2 className="font-heading text-base sm:text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              Thông tin liên hệ
            </h2>
            
            <div className="mt-6 space-y-5">
              
              {/* Hotline */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#b00c14] border border-red-100">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hotline</p>
                  <p className="font-heading font-extrabold text-slate-900 text-sm mt-0.5">0968 123 456</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">(8:00 - 22:00 hàng ngày)</p>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#b00c14] border border-red-100">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</p>
                  <p className="font-heading font-extrabold text-slate-900 text-sm mt-0.5">partner@netup.vn</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">(Phản hồi trong 24h)</p>
                </div>
              </div>

              {/* Địa chỉ */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#b00c14] border border-red-100">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Địa chỉ</p>
                  <p className="font-heading font-extrabold text-slate-900 text-sm mt-0.5 leading-snug">
                    Khu CNC Hòa Lạc, Thạch Thất, Hà Nội, Việt Nam
                  </p>
                </div>
              </div>

              {/* Website */}
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#b00c14] border border-red-100">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Website</p>
                  <a
                    href="https://www.netup.vn"
                    target="_blank"
                    rel="noreferrer"
                    className="font-heading font-extrabold text-red-800 hover:text-red-950 transition text-sm mt-0.5 block"
                  >
                    www.netup.vn
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* Social Links / Fanpage */}
          <div className="pt-6 border-t border-slate-100">
            <a
              href={fanpageUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold text-xs py-3 rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Mở Fanpage NetUP
            </a>
          </div>

        </div>

        {/* Partnership Form Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-3xs">
          <h2 className="font-heading text-lg font-bold text-slate-900">
            Gửi yêu cầu hợp tác
          </h2>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Điền thông tin của bạn, chúng tôi sẽ liên hệ lại trong thời gian sớm nhất.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            
            {/* Validation errors */}
            {errorMsg && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-800 font-bold">
                ⚠️ {errorMsg}
                {formData.partnerType === "owner" && errorMsg.includes("đăng nhập") ? (
                  <a href={loginUrl()} className="ml-2 underline">
                    Đăng nhập Google
                  </a>
                ) : null}
              </div>
            )}

            {/* Success alert */}
            {submitSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-xs text-emerald-800 font-bold flex flex-col gap-1">
                <p className="text-sm">🎉 Gửi yêu cầu thành công!</p>
                <p className="font-medium text-slate-500 mt-1">
                  {successPartnerType === "owner"
                    ? "NetUP đã nhận yêu cầu owner và sẽ chờ admin duyệt."
                    : "NetUP đã nhận được thông tin hợp tác của bạn. Chúng tôi sẽ chủ động liên hệ hỗ trợ trong thời gian sớm nhất."}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              
              {/* Họ tên */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Họ và tên <span className="text-[#b00c14] font-black">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  placeholder="Nhập họ và tên"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#b00c14] focus:outline-none transition"
                />
              </div>

              {/* SĐT */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Số điện thoại <span className="text-[#b00c14] font-black">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="Nhập số điện thoại"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#b00c14] focus:outline-none transition"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Email <span className="text-[#b00c14] font-black">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder="Nhập email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#b00c14] focus:outline-none transition"
                />
              </div>

              {/* Loại hình hợp tác */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Loại hình hợp tác <span className="text-[#b00c14] font-black">*</span>
                </label>
                <select
                  name="partnerType"
                  value={formData.partnerType}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 focus:border-[#b00c14] focus:outline-none transition cursor-pointer"
                >
                  <option value="">Chọn loại hình</option>
                  <option value="owner">Chủ cụm sân (Đăng ký mở bán sân)</option>
                  <option value="sponsor">Nhà tài trợ giải đấu</option>
                  <option value="brand">Đối tác quảng cáo/thương hiệu</option>
                  <option value="investor">Nhà đầu tư phát triển</option>
                </select>
              </div>

              {/* Tên sân / Doanh nghiệp */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Tên sân / Doanh nghiệp <span className="text-[#b00c14] font-black">*</span>
                </label>
                <input
                  type="text"
                  name="courtName"
                  placeholder="Nhập tên sân hoặc doanh nghiệp"
                  value={formData.courtName}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#b00c14] focus:outline-none transition"
                />
              </div>

              {/* Địa chỉ sân */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Địa chỉ sân <span className="text-[#b00c14] font-black">*</span>
                </label>
                <input
                  type="text"
                  name="courtAddress"
                  placeholder="Nhập địa chỉ sân"
                  value={formData.courtAddress}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#b00c14] focus:outline-none transition"
                />
              </div>

              {/* Nội dung */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-650 uppercase tracking-wider block">
                  Nội dung
                </label>
                <textarea
                  name="content"
                  placeholder="Chia sẻ thêm về nhu cầu hợp tác của bạn..."
                  value={formData.content}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-[#b00c14] focus:outline-none transition resize-none h-24"
                />
              </div>

            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#b00c14] hover:bg-red-950 text-white font-bold text-xs py-3 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Đang gửi yêu cầu...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Gửi yêu cầu
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

      </section>

      {/* SECTION 3: TESTIMONIALS & FAQ IN ONE CONTAINER */}
      <section className="rounded-3xl border border-[#b00c14]/15 bg-gradient-to-br from-red-50/60 via-white to-slate-50/80 p-6 shadow-3xs">
        <div className="grid gap-8 lg:grid-cols-2">
          
          {/* Left Column: Testimonials */}
          <div className="flex flex-col justify-between min-h-[340px] gap-4">
            <div>
              <h2 className="font-heading text-base sm:text-lg font-bold text-slate-900">
                Chủ sân nói gì về NetUP?
              </h2>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                Lắng nghe chia sẻ từ các đối tác đã đồng hành cùng chúng tôi.
              </p>
            </div>

            {/* White inner card for testimonial content */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-3xs flex flex-col gap-4 relative">
              {/* Quote block */}
              <div className="relative flex items-start gap-2">
                <span className="text-[#b00c14] font-serif text-3xl font-extrabold leading-none -mt-1 select-none pointer-events-none">
                  “
                </span>
                <p className="text-xs sm:text-sm text-slate-700 font-bold italic leading-relaxed min-h-[50px]">
                  {testimonials[testimonialIdx].quote}
                </p>
              </div>

              {/* Author info & Rating */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                
                {/* Author details */}
                <div className="flex items-center gap-3">
                  <img
                    src={testimonials[testimonialIdx].avatar}
                    alt={testimonials[testimonialIdx].author}
                    className="h-10 w-10 rounded-full object-cover border border-slate-100 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{testimonials[testimonialIdx].author}</p>
                    <p className="text-[10px] sm:text-xs text-slate-450 font-semibold mt-0.5 truncate">{testimonials[testimonialIdx].role}</p>
                  </div>
                </div>

                {/* Stars rating */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold text-slate-750">{testimonials[testimonialIdx].rating.toFixed(1)}</span>
                  <div className="flex text-amber-400 text-xs">
                    {"★★★★★".split("").map((star, i) => (
                      <span key={i}>{star}</span>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Slider Controls at the bottom, centered */}
            <div className="flex items-center justify-center gap-3 mt-1">
              <button
                onClick={handlePrevTestimonial}
                aria-label="Đánh giá trước"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition shadow-3xs cursor-pointer"
              >
                ‹
              </button>
              
              {/* Bullet Indicators */}
              <div className="flex gap-1.5 items-center">
                {testimonials.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-200 ${testimonialIdx === idx ? "bg-[#b00c14] w-3" : "bg-slate-200 w-1.5"}`}
                  />
                ))}
              </div>

              <button
                onClick={handleNextTestimonial}
                aria-label="Đánh giá tiếp theo"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition shadow-3xs cursor-pointer"
              >
                ›
              </button>
            </div>
          </div>

          {/* Right Column: FAQ Accordions */}
          <div className="flex flex-col justify-between min-h-[340px] gap-4">
            <div>
              <h2 className="font-heading text-base sm:text-lg font-bold text-slate-900">
                Câu hỏi thường gặp
              </h2>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                Giải đáp nhanh các thắc mắc phổ biến về hợp tác và tích hợp hệ thống.
              </p>
            </div>

            {/* Accordions List */}
            <div className="space-y-3">
              {faqs.map((faq, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div
                    key={idx}
                    className="border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-3xs transition"
                  >
                    
                    {/* Header */}
                    <button
                      onClick={() => toggleFaq(idx)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/40 text-left hover:bg-slate-50/80 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg border shadow-3xs ${faq.colorClass}`}>
                          {faq.icon}
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-slate-800">{faq.question}</span>
                      </div>
                      
                      {/* Chevron Arrow */}
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4.5 w-4.5 text-slate-450 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {/* Answer */}
                    {isOpen && (
                      <div className="px-4 py-3.5 text-xs text-slate-500 font-semibold border-t border-slate-150 bg-white leading-relaxed">
                        {faq.answer}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>

            {/* More details button */}
            <div className="pt-2 flex justify-center">
              <button className="rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 px-4 py-2 text-xs font-bold text-[#b00c14] transition cursor-pointer">
                Xem thêm câu hỏi
              </button>
            </div>
          </div>

        </div>
      </section>

    </main>
  );
}

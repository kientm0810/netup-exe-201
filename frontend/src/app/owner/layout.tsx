import { RoleNav } from "@/components/layout";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="fade-up mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Chủ sân</p>
      <RoleNav
        links={[
          { href: "/owner/dashboard", label: "Tổng quan" },
          { href: "/owner/courts", label: "Quản lý sân" },
          { href: "/owner/schedule", label: "Quản lý lịch" },
          { href: "/owner/check-in", label: "Check-in" },
          { href: "/owner/sales", label: "Bán hàng & hóa đơn" },
        ]}
      />
      {children}
    </section>
  );
}

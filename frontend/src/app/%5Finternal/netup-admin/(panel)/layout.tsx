"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RoleNav } from "@/components/layout";

import { adminFetch } from "../_lib/auth";

type AdminProfile = {
  username: string;
  is_super_admin: boolean;
};

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const profile = await adminFetch<AdminProfile>("/api/v1/admin/auth/me");
        setAdmin(profile);
      } catch {
        router.push("/_internal/netup-admin/login/");
      } finally {
        setIsChecking(false);
      }
    }

    checkAuth();
  }, [router]);

  if (isChecking) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Đang xác minh phiên quản trị...</p>
      </section>
    );
  }

  return (
    <section className="fade-up mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Quản trị viên: {admin?.username ?? "admin"}
      </p>
      <RoleNav
        links={[
          { href: "/_internal/netup-admin/dashboard", label: "Dashboard" },
          { href: "/_internal/netup-admin/config", label: "Cấu hình" },
          { href: "/_internal/netup-admin/tournaments", label: "Giải đấu" },
          { href: "/_internal/netup-admin/owner-requests", label: "Duyệt owner" },
          { href: "/_internal/netup-admin/owners", label: "Tài khoản chủ sân" },
        ]}
      />
      {children}
    </section>
  );
}

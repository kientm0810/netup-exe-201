"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, Card, Field, Notice, inputClassName } from "@/components/ui";
import { API_BASE_URL, apiFetch } from "@/lib/http";

const DEMO_OWNER = {
  username: "clb.badminton.fpt",
  password: "NetUp@FPT2026",
};

type UserProfile = {
  roles: string[];
};

function googleLoginUrl() {
  return `${API_BASE_URL}/api/v1/auth/google/start`;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h5.9c-.3 1.4-1 2.5-2.1 3.2v2.7h3.4c2-1.8 3.4-4.5 3.4-8z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.4-2.7c-1 .6-2.2 1-3.8 1-2.9 0-5.3-1.9-6.2-4.5H2.3v2.8C4.1 20.5 7.8 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.8 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.5.4-2.1V7.1H2.3C1.5 8.6 1.1 10.2 1.1 12s.4 3.4 1.2 4.9l3.5-2.8z"
      />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.8 1 4.1 3.5 2.3 7.1l3.5 2.8C6.7 7.3 9.1 5.4 12 5.4z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await apiFetch("/api/v1/auth/local/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const profile = await apiFetch<UserProfile>("/api/v1/auth/me", {
        credentials: "include",
      });
      router.replace(profile.roles.includes("owner") ? "/owner/dashboard/" : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Đăng nhập không thành công");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[calc(100vh-120px)] w-full max-w-6xl items-center px-4 py-8 sm:px-6">
      <section className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_420px]">
        <div
          className="min-h-[320px] bg-cover bg-center p-6 text-white lg:min-h-[560px] lg:p-8"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(127,29,29,0.76), rgba(15,23,42,0.38)), url('/courts/badminton1.jpg')",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-100">NetUp</p>
          <h1 className="mt-4 max-w-xl font-heading text-4xl font-semibold leading-tight">
            Đăng nhập để đặt sân và tham gia các hoạt động trên NetUp.
          </h1>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <form onSubmit={submitLogin} className="space-y-4 rounded-lg border border-slate-200 p-5">
            <div>
              <h2 className="font-heading text-xl font-semibold text-ink">Đăng nhập</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Dành cho người chơi và tài khoản chủ sân.
              </p>
            </div>

            <Field label="Tên đăng nhập">
              <input
                className={inputClassName}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </Field>

            <Field label="Mật khẩu">
              <input
                className={inputClassName}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <Button className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>

            <p className="text-center text-xs text-slate-500">
              Bạn là quản trị viên?{" "}
              <Link href="/_internal/netup-admin/login/" className="font-semibold text-red-800 hover:underline">
                Đăng nhập trang admin
              </Link>
            </p>
          </form>

          <Card className="space-y-3 border-amber-200 bg-amber-50/70">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Tài khoản xem thử</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">CLB Badminton FPT</p>
            </div>
            <dl className="grid gap-1 rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Tên đăng nhập</dt>
                <dd className="font-mono font-semibold text-slate-800">{DEMO_OWNER.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Mật khẩu</dt>
                <dd className="font-mono font-semibold text-slate-800">{DEMO_OWNER.password}</dd>
              </div>
            </dl>
            <Button
              type="button"
              variant="outline"
              className="w-full border-amber-300 bg-white"
              onClick={() => {
                setUsername(DEMO_OWNER.username);
                setPassword(DEMO_OWNER.password);
                setError("");
              }}
            >
              Điền nhanh tài khoản CLB
            </Button>
          </Card>

          <Card className="space-y-3 border-slate-200">
            <p className="text-center text-sm font-medium text-slate-600">
              Bạn muốn đăng nhập bằng Google?
            </p>
            <a
              href={googleLoginUrl()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              <GoogleMark />
              Google
            </a>
          </Card>
        </div>
      </section>
    </main>
  );
}

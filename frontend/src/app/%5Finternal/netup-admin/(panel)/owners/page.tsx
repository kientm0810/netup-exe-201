"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, ButtonLink, Card, Field, Notice, PageHero, StatCard, inputClassName } from "@/components/ui";
import { formatFullDateTime } from "@/lib/format";

import { adminFetch } from "../../_lib/auth";

type OwnerAccount = {
  id: string;
  email: string;
  full_name: string;
  username: string;
  business_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

type OwnerForm = {
  full_name: string;
  email: string;
  username: string;
  password: string;
  phone: string;
  business_name: string;
  district: string;
  address: string;
};

const emptyForm: OwnerForm = {
  full_name: "",
  email: "",
  username: "",
  password: "",
  phone: "",
  business_name: "",
  district: "",
  address: "",
};

export default function AdminOwnersPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<OwnerAccount[]>([]);
  const [form, setForm] = useState<OwnerForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Đang tải danh sách tài khoản chủ sân...");

  function handleUnauthorized(messageText: string) {
    if (messageText !== "admin_unauthorized") return false;
    router.push("/_internal/netup-admin/login/");
    return true;
  }

  async function loadOwners() {
    setIsLoading(true);
    setError("");
    try {
      const payload = await adminFetch<OwnerAccount[]>("/api/v1/admin/owners");
      setOwners(payload);
      setMessage(
        payload.length > 0
          ? `Đang quản lý ${payload.length} tài khoản chủ sân.`
          : "Chưa có tài khoản chủ sân nào.",
      );
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tải được tài khoản chủ sân";
      if (handleUnauthorized(nextError)) return;
      setError(nextError);
      setOwners([]);
      setMessage("Không thể tải danh sách tài khoản chủ sân.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOwners();
  }, []);

  function updateField(field: keyof OwnerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const created = await adminFetch<OwnerAccount>("/api/v1/admin/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setOwners((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setForm(emptyForm);
      setMessage(`Đã tạo tài khoản chủ sân cho ${created.business_name}.`);
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tạo được tài khoản chủ sân";
      if (handleUnauthorized(nextError)) return;
      setError(nextError);
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeOwners = useMemo(() => owners.filter((owner) => owner.is_active).length, [owners]);

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Tài khoản chủ sân"
        title="Tạo và quản lý tài khoản vận hành cơ sở."
        description={message}
        actions={
          <>
            <ButtonLink href="/_internal/netup-admin/dashboard" variant="outline">
              Dashboard
            </ButtonLink>
            <ButtonLink href="/_internal/netup-admin/owner-requests" variant="outline">
              Hồ sơ chờ duyệt
            </ButtonLink>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tổng chủ sân" value={owners.length} helper="Tài khoản đã cấp" tone="accent" />
        <StatCard label="Đang hoạt động" value={activeOwners} helper="Có thể đăng nhập" tone="success" />
        <StatCard label="Đang khóa" value={owners.length - activeOwners} helper="Không thể đăng nhập" />
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[420px_1fr]">
        <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">Tạo mới</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">Thông tin chủ sân</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Tài khoản được cấp trực tiếp quyền owner và có thể đăng nhập ngay sau khi tạo.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Tên cơ sở / câu lạc bộ">
              <input
                className={inputClassName}
                value={form.business_name}
                onChange={(event) => updateField("business_name", event.target.value)}
                placeholder="CLB Badminton FPT"
                required
              />
            </Field>
            <Field label="Họ tên người đại diện">
              <input
                className={inputClassName}
                value={form.full_name}
                onChange={(event) => updateField("full_name", event.target.value)}
                autoComplete="name"
                required
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClassName}
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                autoComplete="email"
                placeholder="badminton@fpt.edu.vn"
                required
              />
            </Field>
            <Field label="Số điện thoại">
              <input
                className={inputClassName}
                type="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                autoComplete="tel"
                required
              />
            </Field>
            <Field label="Tên đăng nhập">
              <input
                className={inputClassName}
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
                autoComplete="username"
                minLength={3}
                required
              />
            </Field>
            <Field label="Mật khẩu" helper="Tối thiểu 8 ký tự; nên kết hợp chữ hoa, chữ thường và số.">
              <input
                className={inputClassName}
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Quận / huyện">
              <input
                className={inputClassName}
                value={form.district}
                onChange={(event) => updateField("district", event.target.value)}
                autoComplete="address-level2"
                required
              />
            </Field>
            <Field label="Địa chỉ chi tiết">
              <textarea
                className={`${inputClassName} min-h-24`}
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                autoComplete="street-address"
                required
              />
            </Field>
          </div>

          <Button className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản chủ sân"}
          </Button>
        </form>

        <Card className="space-y-4 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-semibold text-ink">Danh sách chủ sân</h2>
              <p className="mt-1 text-sm text-slate-600">Thông tin đăng nhập và cơ sở đang được quản lý.</p>
            </div>
            <Badge tone="info">{isLoading ? "Đang tải..." : `${owners.length} tài khoản`}</Badge>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Chủ sân</th>
                  <th className="px-4 py-3">Đăng nhập</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {owners.map((owner) => (
                  <tr key={owner.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">{owner.business_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{owner.full_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{owner.phone ?? "Chưa có SĐT"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p className="font-medium">{owner.username}</p>
                      <p className="mt-1 whitespace-nowrap text-xs text-slate-500">{owner.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={owner.is_active ? "success" : "danger"}>
                        {owner.is_active ? "Hoạt động" : "Đã khóa"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatFullDateTime(owner.created_at)}
                    </td>
                  </tr>
                ))}
                {!isLoading && owners.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                      Chưa có tài khoản chủ sân.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

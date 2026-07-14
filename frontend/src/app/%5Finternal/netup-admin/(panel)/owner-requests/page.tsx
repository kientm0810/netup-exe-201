"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, ButtonLink, Card, Field, Notice, PageHero, StatCard, inputClassName } from "@/components/ui";
import { formatFullDateTime, requestStatusLabel } from "@/lib/format";

import { adminFetch, adminLogout } from "../../_lib/auth";

type OwnerRequest = {
  id: string;
  user_id: string;
  business_name: string;
  contact_phone: string | null;
  facility_overview: string | null;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  user_email: string | null;
  user_full_name: string | null;
};

type OwnerQuota = {
  owner_user_id: string;
  owner_full_name: string | null;
  owner_email: string | null;
  rental_post_limit: number;
  slot_post_limit: number;
  rental_posts_used: number;
  slot_posts_used: number;
  rental_posts_remaining: number;
  slot_posts_remaining: number;
};

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

export default function AdminOwnerRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<OwnerRequest[]>([]);
  const [quotas, setQuotas] = useState<OwnerQuota[]>([]);
  const [message, setMessage] = useState("Đang tải hồ sơ chủ sân...");
  const [error, setError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingQuotaId, setSavingQuotaId] = useState<string | null>(null);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, { rental: string; slot: string }>>({});

  async function loadRequests() {
    setError("");
    try {
      const [payload, nextQuotas] = await Promise.all([
        adminFetch<OwnerRequest[]>("/api/v1/admin/owner-requests"),
        adminFetch<OwnerQuota[]>("/api/v1/admin/owner-post-quotas"),
      ]);
      setRequests(payload);
      setQuotas(nextQuotas);
      setQuotaDrafts(
        Object.fromEntries(
          nextQuotas.map((item) => [
            item.owner_user_id,
            {
              rental: String(item.rental_post_limit),
              slot: String(item.slot_post_limit),
            },
          ]),
        ),
      );
      setMessage(payload.length ? `Có ${payload.length} hồ sơ trong hệ thống.` : "Chưa có hồ sơ chủ sân.");
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tải được hồ sơ owner";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
      setRequests([]);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, []);

  async function review(requestId: string, action: "approve" | "reject") {
    setIsSubmitting(true);
    setError("");
    try {
      await adminFetch(`/api/v1/admin/owner-requests/${requestId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_note: reviewNote || null }),
      });
      setReviewNote("");
      await loadRequests();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không cập nhật được hồ sơ owner";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveQuota(ownerUserId: string) {
    const draft = quotaDrafts[ownerUserId];
    if (!draft) return;
    setSavingQuotaId(ownerUserId);
    setError("");
    try {
      const updated = await adminFetch<OwnerQuota>(`/api/v1/admin/owner-post-quotas/${ownerUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rental_post_limit: Number(draft.rental),
          slot_post_limit: Number(draft.slot),
        }),
      });
      setQuotas((current) => current.map((item) => (item.owner_user_id === updated.owner_user_id ? updated : item)));
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không cập nhật được quota owner";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
    } finally {
      setSavingQuotaId(null);
    }
  }

  async function logout() {
    await adminLogout();
    router.push("/_internal/netup-admin/login/");
  }

  const stats = useMemo(
    () => ({
      pending: requests.filter((item) => item.status === "pending").length,
      approved: requests.filter((item) => item.status === "approved").length,
      rejected: requests.filter((item) => item.status === "rejected").length,
    }),
    [requests],
  );

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Duyệt chủ sân"
        title="Kiểm tra hồ sơ và cấp quyền owner."
        description={message}
        actions={
          <>
            <ButtonLink href="/_internal/netup-admin/dashboard" variant="outline">
              Dashboard
            </ButtonLink>
            <ButtonLink href="/_internal/netup-admin/config" variant="outline">
              Cấu hình
            </ButtonLink>
            <Button variant="outline" onClick={logout}>
              Đăng xuất
            </Button>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng hồ sơ" value={requests.length} helper="Tất cả trạng thái" />
        <StatCard label="Chờ duyệt" value={stats.pending} helper="Cần xử lý" tone="warning" />
        <StatCard label="Đã duyệt" value={stats.approved} helper="Đã cấp quyền owner" tone="success" />
        <StatCard label="Từ chối" value={stats.rejected} helper="Không đủ điều kiện" />
      </section>

      <Card className="space-y-4">
        <Field label="Ghi chú áp dụng cho thao tác duyệt tiếp theo">
          <textarea
            className={`${inputClassName} min-h-24`}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Ví dụ: Đã xác minh thông tin cơ sở và số điện thoại"
          />
        </Field>

        <div className="grid gap-4">
          {requests.length === 0 ? (
            <p className="text-sm text-slate-600">Chưa có hồ sơ chủ sân.</p>
          ) : (
            requests.map((request) => (
              <article key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(request.status)}>{requestStatusLabel(request.status)}</Badge>
                      <Badge>{formatFullDateTime(request.submitted_at)}</Badge>
                    </div>
                    <h2 className="mt-3 font-heading text-xl font-semibold text-ink">
                      {request.business_name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      {request.user_full_name ?? "Người dùng"} · {request.user_email ?? "chưa có email"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Điện thoại: {request.contact_phone ?? "chưa có"}
                    </p>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                      {request.facility_overview ?? "Chưa có mô tả cơ sở"}
                    </p>
                    {request.review_note ? (
                      <Notice tone="warning" className="mt-3">
                        Ghi chú trước đó: {request.review_note}
                      </Notice>
                    ) : null}
                  </div>
                  {request.status === "pending" ? (
                    <div className="flex shrink-0 gap-2">
                      <Button disabled={isSubmitting} onClick={() => void review(request.id, "approve")}>
                        Duyệt
                      </Button>
                      <Button variant="danger" disabled={isSubmitting} onClick={() => void review(request.id, "reject")}>
                        Từ chối
                      </Button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-ink">Quota bài đăng owner</h2>
            <p className="mt-1 text-sm text-slate-600">Mặc định mỗi owner có 10 bài thuê nguyên sân và 10 bài slot.</p>
          </div>
          <Badge>{quotas.length} owner</Badge>
        </div>

        {quotas.length === 0 ? (
          <p className="text-sm text-slate-600">Chưa có owner đã duyệt để cấu hình quota.</p>
        ) : (
          <div className="grid gap-4">
            {quotas.map((quota) => {
              const draft = quotaDrafts[quota.owner_user_id] ?? {
                rental: String(quota.rental_post_limit),
                slot: String(quota.slot_post_limit),
              };
              return (
                <article key={quota.owner_user_id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_160px_160px_auto] lg:items-end">
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-slate-950">
                        {quota.owner_full_name ?? "Owner"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{quota.owner_email ?? quota.owner_user_id}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        Đang dùng {quota.rental_posts_used}/{quota.rental_post_limit} bài bao sân · {quota.slot_posts_used}/{quota.slot_post_limit} bài slot
                      </p>
                    </div>
                    <Field label="Quota bao sân">
                      <input
                        className={inputClassName}
                        type="number"
                        min={0}
                        value={draft.rental}
                        onChange={(event) =>
                          setQuotaDrafts((current) => ({
                            ...current,
                            [quota.owner_user_id]: { ...draft, rental: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Quota slot">
                      <input
                        className={inputClassName}
                        type="number"
                        min={0}
                        value={draft.slot}
                        onChange={(event) =>
                          setQuotaDrafts((current) => ({
                            ...current,
                            [quota.owner_user_id]: { ...draft, slot: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Button disabled={savingQuotaId === quota.owner_user_id} onClick={() => void saveQuota(quota.owner_user_id)}>
                      {savingQuotaId === quota.owner_user_id ? "Đang lưu..." : "Lưu quota"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

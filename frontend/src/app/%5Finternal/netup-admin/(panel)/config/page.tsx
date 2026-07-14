"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, ButtonLink, Card, Field, Notice, PageHero, StatCard, inputClassName } from "@/components/ui";
import { formatFullDateTime, formatVnd } from "@/lib/format";

import { adminFetch, adminLogout } from "../../_lib/auth";

type AdminConfig = {
  platform_fee_rate: number;
  floor_fee_vnd: number;
  deposit_percent: number;
  matching_radius_km: number;
  no_show_strike_limit: number;
  auto_release_minutes: number;
  video_assessment_max_size_mb: number;
  video_assessment_max_duration_seconds: number;
  support_hotline_enabled: boolean;
  updated_at: string;
};

const toDisplayPercent = (rate: number) => Math.round(rate * 10000) / 100;

export default function AdminConfigPage() {
  const router = useRouter();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Đang tải cấu hình hệ thống...");
  const [isSaving, setIsSaving] = useState(false);

  const [platformFeePercent, setPlatformFeePercent] = useState("10");
  const [floorFeeVnd, setFloorFeeVnd] = useState("3000");
  const [depositPercent, setDepositPercent] = useState("30");
  const [matchingRadiusKm, setMatchingRadiusKm] = useState("5");
  const [noShowStrikeLimit, setNoShowStrikeLimit] = useState("3");
  const [autoReleaseMinutes, setAutoReleaseMinutes] = useState("15");
  const [videoAssessmentMaxSizeMb, setVideoAssessmentMaxSizeMb] = useState("5");
  const [videoAssessmentMaxDurationSeconds, setVideoAssessmentMaxDurationSeconds] = useState("60");
  const [supportHotlineEnabled, setSupportHotlineEnabled] = useState(true);
  const [changeReason, setChangeReason] = useState("");

  function syncForm(next: AdminConfig) {
    setPlatformFeePercent(String(toDisplayPercent(next.platform_fee_rate)));
    setFloorFeeVnd(String(next.floor_fee_vnd));
    setDepositPercent(String(next.deposit_percent));
    setMatchingRadiusKm(String(next.matching_radius_km));
    setNoShowStrikeLimit(String(next.no_show_strike_limit));
    setAutoReleaseMinutes(String(next.auto_release_minutes));
    setVideoAssessmentMaxSizeMb(String(next.video_assessment_max_size_mb));
    setVideoAssessmentMaxDurationSeconds(String(next.video_assessment_max_duration_seconds));
    setSupportHotlineEnabled(next.support_hotline_enabled);
  }

  async function loadConfig() {
    setError("");
    try {
      const payload = await adminFetch<AdminConfig>("/api/v1/admin/config");
      setConfig(payload);
      syncForm(payload);
      setMessage("Cấu hình hệ thống đã đồng bộ.");
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tải được cấu hình hệ thống";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
      setMessage("Không thể đọc cấu hình admin.");
      setConfig(null);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const payload = await adminFetch<AdminConfig>("/api/v1/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change_reason: changeReason,
          platform_fee_rate: Number(platformFeePercent) / 100,
          floor_fee_vnd: Number(floorFeeVnd),
          deposit_percent: Number(depositPercent),
          matching_radius_km: Number(matchingRadiusKm),
          no_show_strike_limit: Number(noShowStrikeLimit),
          auto_release_minutes: Number(autoReleaseMinutes),
          video_assessment_max_size_mb: Number(videoAssessmentMaxSizeMb),
          video_assessment_max_duration_seconds: Number(videoAssessmentMaxDurationSeconds),
          support_hotline_enabled: supportHotlineEnabled,
        }),
      });
      setConfig(payload);
      syncForm(payload);
      setChangeReason("");
      setMessage("Đã cập nhật cấu hình và ghi audit thành công.");
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không cập nhật được cấu hình";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
    } finally {
      setIsSaving(false);
    }
  }

  async function logout() {
    await adminLogout();
    router.push("/_internal/netup-admin/login/");
  }

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Cấu hình vận hành"
        title="Điều chỉnh phí, cọc và quy tắc matching."
        description={message}
        actions={
          <>
            <ButtonLink href="/_internal/netup-admin/dashboard" variant="outline">
              Dashboard
            </ButtonLink>
            <ButtonLink href="/_internal/netup-admin/tournaments" variant="outline">
              Giải đấu
            </ButtonLink>
            <ButtonLink href="/_internal/netup-admin/owner-requests" variant="outline">
              Duyệt owner
            </ButtonLink>
            <Button variant="outline" onClick={logout}>
              Đăng xuất
            </Button>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Platform fee" value={`${platformFeePercent}%`} helper="Tính trên booking mới" tone="accent" />
        <StatCard label="Phí sàn" value={formatVnd(Number(floorFeeVnd))} helper="Áp dụng cho booking solo" />
        <StatCard label="Tiền cọc" value={`${depositPercent}%`} helper="Bắt buộc thanh toán online" tone="warning" />
        <StatCard label="Matching radius" value={`${matchingRadiusKm} km`} helper="Bán kính gợi ý sân" />
        <StatCard label="Video AI" value={`${videoAssessmentMaxSizeMb} MB`} helper={`${videoAssessmentMaxDurationSeconds}s tối đa`} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-heading text-xl font-semibold text-ink">Thông số hệ thống</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Mỗi thay đổi cần có lý do để audit trail ghi lại rõ ràng.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform fee (%)">
              <input className={inputClassName} type="number" step="0.01" min={0} max={30} value={platformFeePercent} onChange={(event) => setPlatformFeePercent(event.target.value)} />
            </Field>
            <Field label="Floor fee (VND)">
              <input className={inputClassName} type="number" min={0} max={200000} value={floorFeeVnd} onChange={(event) => setFloorFeeVnd(event.target.value)} />
            </Field>
            <Field label="Deposit percent (%)">
              <input className={inputClassName} type="number" step="0.01" min={5} max={80} value={depositPercent} onChange={(event) => setDepositPercent(event.target.value)} />
            </Field>
            <Field label="Matching radius (km)">
              <input className={inputClassName} type="number" step="0.1" min={1} max={30} value={matchingRadiusKm} onChange={(event) => setMatchingRadiusKm(event.target.value)} />
            </Field>
            <Field label="No-show strike limit">
              <input className={inputClassName} type="number" min={1} max={10} value={noShowStrikeLimit} onChange={(event) => setNoShowStrikeLimit(event.target.value)} />
            </Field>
            <Field label="Auto release minutes">
              <input className={inputClassName} type="number" min={5} max={120} value={autoReleaseMinutes} onChange={(event) => setAutoReleaseMinutes(event.target.value)} />
            </Field>
            <Field label="Video assessment max size (MB)">
              <input className={inputClassName} type="number" min={1} max={100} value={videoAssessmentMaxSizeMb} onChange={(event) => setVideoAssessmentMaxSizeMb(event.target.value)} />
            </Field>
            <Field label="Video assessment max duration (seconds)">
              <input className={inputClassName} type="number" min={5} max={300} value={videoAssessmentMaxDurationSeconds} onChange={(event) => setVideoAssessmentMaxDurationSeconds(event.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={supportHotlineEnabled} onChange={(event) => setSupportHotlineEnabled(event.target.checked)} />
            Bật hotline hỗ trợ
          </label>

          <Field label="Lý do thay đổi">
            <textarea
              className={`${inputClassName} min-h-28`}
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              placeholder="Ví dụ: Điều chỉnh tỷ lệ cọc theo chính sách vận hành tuần này"
              required
            />
          </Field>

          <Button disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu cấu hình"}</Button>
        </form>

        <Card className="space-y-4">
          <h2 className="font-heading text-xl font-semibold text-ink">Trạng thái cấu hình</h2>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Cập nhật lần cuối:{" "}
              <span className="font-semibold text-slate-950">
                {config ? formatFullDateTime(config.updated_at) : "chưa có"}
              </span>
            </p>
            <p>Người chơi chọn tiền mặt vẫn phải thanh toán tiền cọc online trước khi check-in.</p>
            <p>Auto release giúp trả slot nếu booking không hoàn tất cọc đúng thời hạn.</p>
          </div>
          <Badge tone={supportHotlineEnabled ? "success" : "warning"}>
            Hotline {supportHotlineEnabled ? "đang bật" : "đang tắt"}
          </Badge>
        </Card>
      </section>
    </div>
  );
}

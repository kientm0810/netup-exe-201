"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { Badge, Button, ButtonLink, Card, Field, Notice, PageHero, StatCard, inputClassName } from "@/components/ui";
import { avatarInitials } from "@/lib/avatar";
import { formatFullDateTime, formatNumber, formatVnd } from "@/lib/format";

import { adminFetch, adminLogout } from "../../_lib/auth";

type AdminProfile = {
  username: string;
  is_super_admin: boolean;
};

type AdminDashboardMetrics = {
  analytics: {
    total_website_visits: number;
    new_users: number;
    registered_accounts: number;
    active_users: number;
    returning_users: number;
    seeded_visits: number;
    period_days: number;
    generated_at: string;
    daily: Array<{
      date: string;
      total_visits: number;
      new_users: number;
      registered_accounts: number;
      active_users: number;
      returning_users: number;
    }>;
  };
  bookings: {
    total: number;
    awaiting_deposit: number;
    checked_in: number;
    completed: number;
    last_7d: number;
  };
  payments: {
    total: number;
    paid: number;
    processing: number;
    paid_amount_vnd: number;
  };
  checkins: {
    total: number;
    last_7d: number;
  };
  owner_requests: {
    pending: number;
    approved: number;
    rejected: number;
  };
};

type AuditLog = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_full_name: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  is_active: boolean;
  roles: string[];
  visible_skill_tier: string;
  elo_value: number;
  created_at: string;
  updated_at: string;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [message, setMessage] = useState("Đang tải số liệu vận hành...");
  const [error, setError] = useState("");

  async function loadAuditLogs(nextEventType: string, nextEntityType: string) {
    const query = new URLSearchParams();
    query.set("limit", "40");
    if (nextEventType.trim()) query.set("event_type", nextEventType.trim());
    if (nextEntityType.trim()) query.set("entity_type", nextEntityType.trim());

    try {
      const logs = await adminFetch<AuditLog[]>(`/api/v1/admin/audit-logs?${query.toString()}`);
      setAuditLogs(logs);
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tải được audit logs";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
      setAuditLogs([]);
    }
  }

  async function loadUsers(search: string) {
    const query = new URLSearchParams();
    query.set("limit", "500");
    if (search.trim()) query.set("search", search.trim());

    try {
      const payload = await adminFetch<AdminUser[]>(`/api/v1/admin/users?${query.toString()}`);
      setUsers(payload);
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tải được danh sách user";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
      setUsers([]);
    }
  }

  async function bootstrap() {
    setError("");
    try {
      const [profile, dashboardMetrics] = await Promise.all([
        adminFetch<AdminProfile>("/api/v1/admin/auth/me"),
        adminFetch<AdminDashboardMetrics>("/api/v1/admin/dashboard/metrics"),
      ]);
      setAdmin(profile);
      setMetrics(dashboardMetrics);
      setMessage("Dashboard đã đồng bộ số liệu vận hành.");
      await Promise.all([
        loadAuditLogs(eventTypeFilter, entityTypeFilter),
        loadUsers(userSearch),
      ]);
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : "Không tải được dashboard";
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
      setMessage("Không thể tải dashboard admin.");
      setAdmin(null);
      setMetrics(null);
      setAuditLogs([]);
      setUsers([]);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function logout() {
    await adminLogout();
    router.push("/_internal/netup-admin/login/");
  }

  const analyticsChartData = useMemo(
    () =>
      (metrics?.analytics.daily ?? []).map((item) => ({
        label: new Date(`${item.date}T00:00:00`).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
        }),
        values: {
          total_visits: item.total_visits,
          new_users: item.new_users,
          registered_accounts: item.registered_accounts,
          active_users: item.active_users,
          returning_users: item.returning_users,
        },
      })),
    [metrics?.analytics.daily],
  );

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="NetUp quản trị"
        title="Theo dõi vận hành, thanh toán và thay đổi hệ thống."
        description={message}
        actions={
          <>
            <ButtonLink href="/_internal/netup-admin/config">Cấu hình</ButtonLink>
            <ButtonLink href="/_internal/netup-admin/tournaments" variant="outline">
              Giải đấu
            </ButtonLink>
            <ButtonLink href="/_internal/netup-admin/owner-requests" variant="outline">
              Duyệt owner
            </ButtonLink>
            <ButtonLink href="/_internal/netup-admin/owners" variant="outline">
              Tài khoản chủ sân
            </ButtonLink>
            <Button variant="outline" onClick={logout}>
              Đăng xuất
            </Button>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-800">
              Website analytics
            </p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">
              Sức khỏe tăng trưởng người dùng
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Visitor và phiên truy cập được ghi nhận thật; lịch sử ban đầu được khởi tạo tỷ lệ theo dữ liệu tài khoản.
            </p>
          </div>
          <Badge tone="info">
            Cập nhật {formatFullDateTime(metrics?.analytics.generated_at)}
          </Badge>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Tổng lượt truy cập website"
            value={formatNumber(metrics?.analytics.total_website_visits)}
            helper="Toàn thời gian"
            tone="accent"
          />
          <StatCard
            label="Số người dùng mới"
            value={formatNumber(metrics?.analytics.new_users)}
            helper={`${metrics?.analytics.period_days ?? 30} ngày gần nhất`}
            tone="success"
          />
          <StatCard
            label="Số tài khoản đăng ký"
            value={formatNumber(metrics?.analytics.registered_accounts)}
            helper="Tổng tài khoản trong hệ thống"
          />
          <StatCard
            label="Số người dùng hoạt động"
            value={formatNumber(metrics?.analytics.active_users)}
            helper={`${metrics?.analytics.period_days ?? 30} ngày gần nhất`}
            tone="warning"
          />
          <StatCard
            label="Số người dùng quay lại"
            value={formatNumber(metrics?.analytics.returning_users)}
            helper="Có từ 2 phiên truy cập"
          />
        </section>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-ink">
              Xu hướng {metrics?.analytics.daily.length ?? 0} ngày
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Quan sát nhịp tăng giảm traffic, mức độ hoạt động và khả năng giữ chân theo ngày.
            </p>
          </div>
          <Badge>{metrics?.analytics.daily.length ?? 0} ngày</Badge>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
            <div className="mb-5">
              <p className="font-semibold text-slate-950">Traffic và giữ chân</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Lượt truy cập so với người dùng hoạt động và quay lại.
              </p>
            </div>
            <MultiLineChart
              data={analyticsChartData}
              series={[
                { key: "total_visits", label: "Lượt truy cập", color: "#b91c1c" },
                { key: "active_users", label: "Đang hoạt động", color: "#d97706" },
                { key: "returning_users", label: "Quay lại", color: "#0284c7" },
              ]}
              valueFormatter={formatNumber}
              emptyMessage="Chưa có dữ liệu traffic theo ngày."
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
            <div className="mb-5">
              <p className="font-semibold text-slate-950">Tăng trưởng tài khoản</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Người dùng mới theo ngày và tổng tài khoản thực tế tại cuối ngày.
              </p>
            </div>
            <MultiLineChart
              data={analyticsChartData}
              series={[
                { key: "new_users", label: "Người dùng mới", color: "#059669" },
                { key: "registered_accounts", label: "Tổng tài khoản", color: "#7c3aed" },
              ]}
              valueFormatter={formatNumber}
              emptyMessage="Chưa có dữ liệu tăng trưởng tài khoản."
            />
          </div>
        </div>
      </Card>

      <div>
        <h2 className="font-heading text-xl font-semibold text-ink">Chỉ số vận hành</h2>
        <p className="mt-1 text-sm text-slate-600">Booking, thanh toán, check-in và owner.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Booking"
          value={formatNumber(metrics?.bookings.total)}
          helper={`${metrics?.bookings.last_7d ?? 0} trong 7 ngày`}
          tone="accent"
        />
        <StatCard
          label="Chờ đặt cọc"
          value={metrics?.bookings.awaiting_deposit ?? 0}
          helper={`${metrics?.bookings.checked_in ?? 0} đã check-in`}
          tone="warning"
        />
        <StatCard
          label="Thanh toán thành công"
          value={metrics?.payments.paid ?? 0}
          helper={formatVnd(metrics?.payments.paid_amount_vnd)}
          tone="success"
        />
        <StatCard
          label="Owner chờ duyệt"
          value={metrics?.owner_requests.pending ?? 0}
          helper={`${metrics?.owner_requests.approved ?? 0} đã duyệt`}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Phiên quản trị</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-ink">{admin?.username ?? "Admin"}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {admin?.is_super_admin ? "Quản trị viên cấp cao" : "Quản trị viên vận hành"}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-slate-700">
            <p>Check-in toàn hệ thống: {metrics?.checkins.total ?? 0}</p>
            <p>Check-in 7 ngày: {metrics?.checkins.last_7d ?? 0}</p>
            <p>Payment đang xử lý: {metrics?.payments.processing ?? 0}</p>
            <p>Booking hoàn tất: {metrics?.bookings.completed ?? 0}</p>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-semibold text-ink">Audit trail</h2>
              <p className="mt-1 text-sm text-slate-600">
                Theo dõi thay đổi cấu hình, duyệt owner và các thao tác nhạy cảm.
              </p>
            </div>
            <Badge tone="info">{auditLogs.length} bản ghi</Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <Field label="Loại sự kiện">
              <input
                className={inputClassName}
                value={eventTypeFilter}
                onChange={(event) => setEventTypeFilter(event.target.value)}
                placeholder="admin_config_updated"
              />
            </Field>
            <Field label="Loại dữ liệu">
              <input
                className={inputClassName}
                value={entityTypeFilter}
                onChange={(event) => setEntityTypeFilter(event.target.value)}
                placeholder="admin_config"
              />
            </Field>
            <div className="flex items-end">
              <Button onClick={() => void loadAuditLogs(eventTypeFilter, entityTypeFilter)}>Lọc</Button>
            </div>
          </div>

          <div className="grid gap-3">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-slate-600">Chưa có audit log theo điều kiện lọc.</p>
            ) : (
              auditLogs.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{item.event_type}</p>
                      <p className="mt-1 text-slate-600">
                        {item.entity_type} · {item.entity_id}
                      </p>
                    </div>
                    <Badge>{formatFullDateTime(item.created_at)}</Badge>
                  </div>
                  <p className="mt-2 text-slate-600">
                    Người thao tác: {item.actor_full_name || item.actor_email || item.actor_user_id || "system"}
                  </p>
                  <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                    {JSON.stringify(item.payload, null, 2)}
                  </pre>
                </article>
              ))
            )}
          </div>
        </Card>
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-ink">Danh sách người dùng</h2>
            <p className="mt-1 text-sm text-slate-600">
              Theo dõi user, thông tin liên hệ và role hiện tại.
            </p>
          </div>
          <Badge tone="info">{users.length} user</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Tìm user">
            <input
              className={inputClassName}
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Tên, email hoặc số điện thoại"
            />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void loadUsers(userSearch)}>Tìm</Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Liên hệ</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Skill</th>
                <th className="px-4 py-3">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.avatar_url ? (
                        <img
                          src={item.avatar_url}
                          alt={item.full_name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                          {avatarInitials(item.full_name)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-950">{item.full_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{item.phone ?? "chưa có SĐT"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[item.district, item.city].filter(Boolean).join(", ") || "chưa có địa chỉ"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {item.roles.length ? (
                        item.roles.map((role) => <Badge key={role}>{role}</Badge>)
                      ) : (
                        <Badge tone="warning">no-role</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{item.visible_skill_tier}</p>
                    <p className="mt-1 text-xs text-slate-500">Elo {item.elo_value}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatFullDateTime(item.created_at)}</td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    Chưa có user theo điều kiện lọc.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

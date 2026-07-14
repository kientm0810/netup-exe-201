"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card, Field, Notice, PageHero, StatCard, inputClassName } from "@/components/ui";
import { avatarInitials } from "@/lib/avatar";
import { errorMessage, formatFullDateTime, formatNumber, formatVnd } from "@/lib/format";

import { adminFetch } from "../../_lib/auth";

type Tournament = {
  id: string;
  title: string;
  sport: string;
  status: "upcoming" | "ongoing" | "completed";
  startDate: string;
  endDate: string;
  location: string;
  joinedTeams: number;
  maxTeams: number;
  prizeMoney: number;
  image: string;
  fee: number;
  level: "movement" | "semi_pro" | "pro";
  description: string;
  bankQrImageUrl: string | null;
  bankTransferCaption: string | null;
  bracket: unknown[];
};

type TournamentDraft = {
  title: string;
  sport: string;
  status: "upcoming" | "ongoing" | "completed";
  startDate: string;
  endDate: string;
  location: string;
  maxTeams: string;
  prizeMoney: string;
  fee: string;
  level: "movement" | "semi_pro" | "pro";
  image: string;
  description: string;
  bankQrImageUrl: string;
  bankTransferCaption: string;
  bracketJson: string;
};

type RegistrationStatus = "pending" | "registered" | "cancelled";

type AdminRegistration = {
  id: string;
  registrationCode: string;
  status: RegistrationStatus;
  teamName: string;
  player1: string;
  player2: string | null;
  createdAt: string;
  tournamentId: string;
  tournamentTitle: string;
  fee: number;
  contactPhone: string;
  contactEmail: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  profile: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    city: string | null;
    district: string | null;
    visible_skill_tier: string;
    elo_value: number;
    matches_played: number;
    wins: number;
    losses: number;
    draws: number;
  };
};

type QrImageUpload = {
  imageUrl: string;
  storageKey: string;
};

const statusOptions: Array<{ value: "" | RegistrationStatus; label: string }> = [
  { value: "", label: "Tất cả đơn" },
  { value: "pending", label: "Chờ thanh toán" },
  { value: "registered", label: "Đã duyệt" },
  { value: "cancelled", label: "Đã hủy" },
];

function registrationStatusLabel(status: RegistrationStatus) {
  if (status === "registered") return "Đã xác nhận";
  if (status === "cancelled") return "Đã hủy";
  return "Chờ thanh toán";
}

function statusTone(status: RegistrationStatus): "success" | "warning" | "danger" {
  if (status === "registered") return "success";
  if (status === "cancelled") return "danger";
  return "warning";
}

function skillLabel(value: string) {
  if (value === "Advanced") return "Nâng cao";
  if (value === "Intermediate") return "Trung bình";
  return "Người mới";
}

export default function AdminTournamentsPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [registrations, setRegistrations] = useState<AdminRegistration[]>([]);
  const [registrationStatus, setRegistrationStatus] = useState<"" | RegistrationStatus>("pending");
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [message, setMessage] = useState("Đang tải dữ liệu giải đấu...");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadingQrTarget, setUploadingQrTarget] = useState<"create" | "edit" | null>(null);
  const [savingTournamentId, setSavingTournamentId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TournamentDraft | null>(null);

  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("Cầu lông");
  const [startDate, setStartDate] = useState("25/06/2026");
  const [endDate, setEndDate] = useState("02/07/2026");
  const [location, setLocation] = useState("");
  const [maxTeams, setMaxTeams] = useState("16");
  const [prizeMoney, setPrizeMoney] = useState("10000000");
  const [fee, setFee] = useState("150000");
  const [level, setLevel] = useState<"movement" | "semi_pro" | "pro">("movement");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [bankQrImageUrl, setBankQrImageUrl] = useState("");
  const [bankTransferCaption, setBankTransferCaption] = useState(
    "Vui lòng chuyển khoản lệ phí đăng ký và ghi mã đơn {registrationCode} trong nội dung chuyển khoản.",
  );

  const pendingCount = useMemo(() => registrations.filter((item) => item.status === "pending").length, [registrations]);
  const approvedCount = useMemo(() => registrations.filter((item) => item.status === "registered").length, [registrations]);
  const activeTeams = useMemo(() => tournaments.reduce((total, item) => total + item.joinedTeams, 0), [tournaments]);

  async function loadData(nextStatus = registrationStatus, nextTournamentId = selectedTournamentId) {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextStatus) params.set("status", nextStatus);
      if (nextTournamentId) params.set("tournament_id", nextTournamentId);
      const [nextTournaments, nextRegistrations] = await Promise.all([
        adminFetch<Tournament[]>("/api/v1/admin/tournaments"),
        adminFetch<AdminRegistration[]>(`/api/v1/admin/tournaments/registrations${params.toString() ? `?${params.toString()}` : ""}`),
      ]);
      setTournaments(nextTournaments);
      setRegistrations(nextRegistrations);
      setMessage(`Đã tải ${nextRegistrations.length} đơn đăng ký giải đấu.`);
    } catch (caught) {
      const nextError = errorMessage(caught, "Không tải được dữ liệu giải đấu");
      if (nextError === "admin_unauthorized") {
        router.push("/_internal/netup-admin/login/");
        return;
      }
      setError(nextError);
      setMessage("Không thể tải dữ liệu giải đấu.");
      setTournaments([]);
      setRegistrations([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function uploadQrImage(file: File) {
    const formData = new FormData();
    formData.append("image", file);
    return adminFetch<QrImageUpload>("/api/v1/admin/tournaments/qr-images", {
      method: "POST",
      body: formData,
    });
  }

  async function uploadCreateQrImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingQrTarget("create");
    setError("");
    try {
      const uploaded = await uploadQrImage(file);
      setBankQrImageUrl(uploaded.imageUrl);
      setMessage("Đã upload ảnh QR ngân hàng cho giải đấu mới.");
    } catch (caught) {
      setError(errorMessage(caught, "Không upload được ảnh QR"));
    } finally {
      setUploadingQrTarget(null);
    }
  }

  async function uploadEditQrImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editDraft) return;

    setUploadingQrTarget("edit");
    setError("");
    try {
      const uploaded = await uploadQrImage(file);
      setEditDraft({ ...editDraft, bankQrImageUrl: uploaded.imageUrl });
      setMessage("Đã upload ảnh QR ngân hàng cho giải đấu đang sửa.");
    } catch (caught) {
      setError(errorMessage(caught, "Không upload được ảnh QR"));
    } finally {
      setUploadingQrTarget(null);
    }
  }

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsCreating(true);
    try {
      await adminFetch<Tournament>("/api/v1/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          sport,
          startDate,
          endDate,
          location,
          maxTeams: Number(maxTeams),
          prizeMoney: Number(prizeMoney),
          fee: Number(fee),
          level,
          image: image || null,
          description: description || null,
          bankQrImageUrl: bankQrImageUrl || null,
          bankTransferCaption: bankTransferCaption || null,
        }),
      });
      setTitle("");
      setLocation("");
      setDescription("");
      setImage("");
      setBankQrImageUrl("");
      setMessage("Đã tạo giải đấu mới.");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught, "Không tạo được giải đấu"));
    } finally {
      setIsCreating(false);
    }
  }

  function startEditTournament(item: Tournament) {
    setEditingTournamentId(item.id);
    setEditDraft({
      title: item.title,
      sport: item.sport,
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
      location: item.location,
      maxTeams: String(item.maxTeams),
      prizeMoney: String(item.prizeMoney),
      fee: String(item.fee),
      level: item.level,
      image: item.image,
      description: item.description,
      bankQrImageUrl: item.bankQrImageUrl ?? "",
      bankTransferCaption: item.bankTransferCaption ?? "",
      bracketJson: JSON.stringify(item.bracket ?? [], null, 2),
    });
  }

  async function updateTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTournamentId || !editDraft) return;
    setSavingTournamentId(editingTournamentId);
    setError("");
    try {
      let bracket: unknown[] = [];
      try {
        const parsed = JSON.parse(editDraft.bracketJson || "[]");
        bracket = Array.isArray(parsed) ? parsed : [];
      } catch {
        setError("Bracket JSON không hợp lệ.");
        return;
      }

      await adminFetch<Tournament>(`/api/v1/admin/tournaments/${editingTournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDraft.title,
          sport: editDraft.sport,
          status: editDraft.status,
          startDate: editDraft.startDate,
          endDate: editDraft.endDate,
          location: editDraft.location,
          maxTeams: Number(editDraft.maxTeams),
          prizeMoney: Number(editDraft.prizeMoney),
          fee: Number(editDraft.fee),
          level: editDraft.level,
          image: editDraft.image || null,
          description: editDraft.description || null,
          bankQrImageUrl: editDraft.bankQrImageUrl || null,
          bankTransferCaption: editDraft.bankTransferCaption || null,
          bracket,
        }),
      });
      setEditingTournamentId(null);
      setEditDraft(null);
      setMessage("Đã cập nhật giải đấu.");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught, "Không cập nhật được giải đấu"));
    } finally {
      setSavingTournamentId(null);
    }
  }

  async function deleteTournament(tournamentId: string) {
    if (!window.confirm("Xóa mềm giải đấu này khỏi public/player?")) return;
    setSavingTournamentId(tournamentId);
    setError("");
    try {
      await adminFetch(`/api/v1/admin/tournaments/${tournamentId}`, { method: "DELETE" });
      setMessage("Đã xóa mềm giải đấu.");
      if (editingTournamentId === tournamentId) {
        setEditingTournamentId(null);
        setEditDraft(null);
      }
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught, "Không xóa được giải đấu"));
    } finally {
      setSavingTournamentId(null);
    }
  }

  async function reviewRegistration(registrationId: string, nextStatus: "registered" | "cancelled") {
    setReviewingId(registrationId);
    setError("");
    try {
      const updated = await adminFetch<AdminRegistration>(`/api/v1/admin/tournaments/registrations/${registrationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reviewNote: reviewNote || null }),
      });
      setRegistrations((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .filter((item) => !registrationStatus || item.status === registrationStatus),
      );
      setReviewNote("");
      setMessage(nextStatus === "registered" ? "Đã xác nhận thanh toán thủ công." : "Đã hủy đơn đăng ký.");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught, "Không xử lý được đơn đăng ký"));
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Quản trị giải đấu"
        title="Tạo giải và duyệt đơn đăng ký của thí sinh."
        description={message}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Giải đấu" value={formatNumber(tournaments.length)} helper={`${activeTeams} đội giữ slot`} tone="accent" />
        <StatCard label="Đơn chờ duyệt" value={formatNumber(pendingCount)} helper="Cần check thanh toán" tone="warning" />
        <StatCard label="Đã xác nhận" value={formatNumber(approvedCount)} helper="Thanh toán thủ công" tone="success" />
        <StatCard label="Tổng giải thưởng" value={formatVnd(tournaments.reduce((total, item) => total + item.prizeMoney, 0))} helper="Các giải đang có" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
        <form onSubmit={createTournament} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-950">Tạo giải đấu</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Chỉ admin có quyền đăng giải lên marketplace.</p>
          </div>

          <Field label="Tên giải">
            <input className={inputClassName} value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Môn">
              <select className={inputClassName} value={sport} onChange={(event) => setSport(event.target.value)}>
                <option value="Cầu lông">Cầu lông</option>
                <option value="Tennis">Tennis</option>
                <option value="Pickleball">Pickleball</option>
                <option value="Bóng đá">Bóng đá</option>
              </select>
            </Field>
            <Field label="Cấp độ">
              <select className={inputClassName} value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>
                <option value="movement">Phong trào</option>
                <option value="semi_pro">Bán chuyên</option>
                <option value="pro">Chuyên nghiệp</option>
              </select>
            </Field>
            <Field label="Ngày bắt đầu">
              <input className={inputClassName} value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </Field>
            <Field label="Ngày kết thúc">
              <input className={inputClassName} value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
            </Field>
            <Field label="Số đội tối đa">
              <input className={inputClassName} type="number" min={1} value={maxTeams} onChange={(event) => setMaxTeams(event.target.value)} required />
            </Field>
            <Field label="Lệ phí">
              <input className={inputClassName} type="number" min={0} value={fee} onChange={(event) => setFee(event.target.value)} required />
            </Field>
          </div>

          <Field label="Địa điểm">
            <input className={inputClassName} value={location} onChange={(event) => setLocation(event.target.value)} required />
          </Field>
          <Field label="Giải thưởng">
            <input className={inputClassName} type="number" min={0} value={prizeMoney} onChange={(event) => setPrizeMoney(event.target.value)} required />
          </Field>
          <Field label="Banner URL">
            <input className={inputClassName} value={image} onChange={(event) => setImage(event.target.value)} placeholder="Để trống dùng ảnh mặc định" />
          </Field>
          <Field label="Ảnh QR ngân hàng" helper="Upload ảnh PNG, JPG hoặc WEBP tối đa 5MB. Ảnh này sẽ hiện cho người chơi sau khi gửi đơn.">
            <input
              className={inputClassName}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void uploadCreateQrImage(event)}
              disabled={uploadingQrTarget === "create"}
            />
          </Field>
          {bankQrImageUrl ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <img src={bankQrImageUrl} alt="QR chuyển khoản" className="mx-auto h-40 w-40 rounded-lg object-contain bg-white" />
              <div className="flex justify-center">
                <Button type="button" size="sm" variant="outline" onClick={() => setBankQrImageUrl("")}>
                  Xóa QR
                </Button>
              </div>
            </div>
          ) : null}
          <Field label="Caption chuyển khoản" helper="Dùng {registrationCode} nếu muốn đặt mã đơn vào đúng vị trí trong câu.">
            <textarea
              className={`${inputClassName} min-h-24`}
              value={bankTransferCaption}
              onChange={(event) => setBankTransferCaption(event.target.value)}
            />
          </Field>
          <Field label="Mô tả">
            <textarea className={`${inputClassName} min-h-24`} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>

          <Button disabled={isCreating || uploadingQrTarget === "create"}>
            {uploadingQrTarget === "create" ? "Đang upload QR..." : isCreating ? "Đang tạo..." : "Đăng giải đấu"}
          </Button>
        </form>

          <Card className="space-y-4">
            <div>
              <h2 className="font-heading text-xl font-semibold text-slate-950">Danh sách giải đấu</h2>
              <p className="mt-1 text-sm text-slate-600">Sửa thông tin, trạng thái hoặc xóa mềm giải khỏi public.</p>
            </div>

            <div className="space-y-3">
              {tournaments.length === 0 ? (
                <p className="text-sm text-slate-600">Chưa có giải đấu.</p>
              ) : (
                tournaments.map((item) => (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {item.startDate} - {item.endDate} · {item.joinedTeams}/{item.maxTeams} đội
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {item.bankQrImageUrl ? "Đã có QR chuyển khoản" : "Chưa có QR chuyển khoản"}
                        </p>
                      </div>
                      <Badge tone={item.status === "completed" ? "neutral" : item.status === "ongoing" ? "warning" : "success"}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEditTournament(item)}>
                        Sửa
                      </Button>
                      <Button type="button" size="sm" variant="danger" disabled={savingTournamentId === item.id} onClick={() => void deleteTournament(item.id)}>
                        Xóa mềm
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>

            {editDraft ? (
              <form onSubmit={updateTournament} className="space-y-4 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-heading text-lg font-semibold text-slate-950">Sửa giải đấu</h3>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingTournamentId(null); setEditDraft(null); }}>
                    Hủy
                  </Button>
                </div>
                <Field label="Tên giải">
                  <input className={inputClassName} value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} required />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Môn">
                    <input className={inputClassName} value={editDraft.sport} onChange={(event) => setEditDraft({ ...editDraft, sport: event.target.value })} required />
                  </Field>
                  <Field label="Trạng thái">
                    <select className={inputClassName} value={editDraft.status} onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value as TournamentDraft["status"] })}>
                      <option value="upcoming">Sắp diễn ra</option>
                      <option value="ongoing">Đang diễn ra</option>
                      <option value="completed">Đã hoàn tất</option>
                    </select>
                  </Field>
                  <Field label="Ngày bắt đầu">
                    <input className={inputClassName} value={editDraft.startDate} onChange={(event) => setEditDraft({ ...editDraft, startDate: event.target.value })} required />
                  </Field>
                  <Field label="Ngày kết thúc">
                    <input className={inputClassName} value={editDraft.endDate} onChange={(event) => setEditDraft({ ...editDraft, endDate: event.target.value })} required />
                  </Field>
                  <Field label="Số đội tối đa">
                    <input className={inputClassName} type="number" min={1} value={editDraft.maxTeams} onChange={(event) => setEditDraft({ ...editDraft, maxTeams: event.target.value })} required />
                  </Field>
                  <Field label="Lệ phí">
                    <input className={inputClassName} type="number" min={0} value={editDraft.fee} onChange={(event) => setEditDraft({ ...editDraft, fee: event.target.value })} required />
                  </Field>
                  <Field label="Giải thưởng">
                    <input className={inputClassName} type="number" min={0} value={editDraft.prizeMoney} onChange={(event) => setEditDraft({ ...editDraft, prizeMoney: event.target.value })} required />
                  </Field>
                  <Field label="Cấp độ">
                    <select className={inputClassName} value={editDraft.level} onChange={(event) => setEditDraft({ ...editDraft, level: event.target.value as TournamentDraft["level"] })}>
                      <option value="movement">Phong trào</option>
                      <option value="semi_pro">Bán chuyên</option>
                      <option value="pro">Chuyên nghiệp</option>
                    </select>
                  </Field>
                </div>
                <Field label="Địa điểm">
                  <input className={inputClassName} value={editDraft.location} onChange={(event) => setEditDraft({ ...editDraft, location: event.target.value })} required />
                </Field>
                <Field label="Banner URL">
                  <input className={inputClassName} value={editDraft.image} onChange={(event) => setEditDraft({ ...editDraft, image: event.target.value })} />
                </Field>
                <Field label="Ảnh QR ngân hàng" helper="Upload ảnh PNG, JPG hoặc WEBP tối đa 5MB để thay QR hiện tại.">
                  <input
                    className={inputClassName}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void uploadEditQrImage(event)}
                    disabled={uploadingQrTarget === "edit"}
                  />
                </Field>
                {editDraft.bankQrImageUrl ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <img src={editDraft.bankQrImageUrl} alt="QR chuyển khoản" className="mx-auto h-40 w-40 rounded-lg object-contain bg-white" />
                    <div className="flex justify-center">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditDraft({ ...editDraft, bankQrImageUrl: "" })}>
                        Xóa QR
                      </Button>
                    </div>
                  </div>
                ) : null}
                <Field label="Caption chuyển khoản" helper="Dùng {registrationCode} nếu muốn đặt mã đơn vào đúng vị trí trong câu.">
                  <textarea
                    className={`${inputClassName} min-h-24`}
                    value={editDraft.bankTransferCaption}
                    onChange={(event) => setEditDraft({ ...editDraft, bankTransferCaption: event.target.value })}
                  />
                </Field>
                <Field label="Mô tả">
                  <textarea className={`${inputClassName} min-h-24`} value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} />
                </Field>
                <Field label="Bracket JSON">
                  <textarea className={`${inputClassName} min-h-36 font-mono text-xs`} value={editDraft.bracketJson} onChange={(event) => setEditDraft({ ...editDraft, bracketJson: event.target.value })} />
                </Field>
                <Button disabled={savingTournamentId === editingTournamentId || uploadingQrTarget === "edit"}>
                  {uploadingQrTarget === "edit" ? "Đang upload QR..." : savingTournamentId === editingTournamentId ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </form>
            ) : null}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold text-slate-950">Đơn đăng ký thí sinh</h2>
                <p className="mt-1 text-sm text-slate-600">Đơn mới ở trạng thái chờ thanh toán để admin kiểm tra thủ công.</p>
              </div>
              <Badge tone="info">{isLoading ? "Đang tải" : `${registrations.length} đơn`}</Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto]">
              <Field label="Trạng thái">
                <select
                  className={inputClassName}
                  value={registrationStatus}
                  onChange={(event) => {
                    const next = event.target.value as "" | RegistrationStatus;
                    setRegistrationStatus(next);
                    void loadData(next, selectedTournamentId);
                  }}
                >
                  {statusOptions.map((item) => (
                    <option key={item.value || "all"} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Giải đấu">
                <select
                  className={inputClassName}
                  value={selectedTournamentId}
                  onChange={(event) => {
                    setSelectedTournamentId(event.target.value);
                    void loadData(registrationStatus, event.target.value);
                  }}
                >
                  <option value="">Tất cả giải</option>
                  {tournaments.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={() => void loadData()}>
                  Tải lại
                </Button>
              </div>
            </div>

            <Field label="Ghi chú duyệt">
              <input
                className={inputClassName}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Ví dụ: Đã nhận chuyển khoản 150.000đ"
              />
            </Field>
          </Card>

          <div className="grid gap-3">
            {registrations.length === 0 ? (
              <Card>
                <p className="text-sm font-semibold text-slate-600">Chưa có đơn đăng ký theo bộ lọc hiện tại.</p>
              </Card>
            ) : (
              registrations.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {item.profile.avatar_url ? (
                        <img src={item.profile.avatar_url} alt={item.profile.full_name} className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
                          {avatarInitials(item.profile.full_name)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-heading text-base font-semibold text-slate-950">{item.teamName}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.player1}{item.player2 ? ` & ${item.player2}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{item.tournamentTitle}</p>
                      </div>
                    </div>
                    <Badge tone={statusTone(item.status)}>{registrationStatusLabel(item.status)}</Badge>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-4">
                    <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-100">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Mã đơn</p>
                      <p className="mt-1 break-all font-mono text-sm font-black text-red-950">{item.registrationCode}</p>
                      <p className="mt-1 text-xs font-semibold text-red-800">{formatVnd(item.fee)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Liên hệ</p>
                      <p className="mt-1 font-semibold text-slate-950">{item.contactPhone}</p>
                      <p className="mt-1 break-all text-xs text-slate-600">{item.contactEmail}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Profile</p>
                      <p className="mt-1 font-semibold text-slate-950">{item.profile.full_name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {skillLabel(item.profile.visible_skill_tier)} · ELO {item.profile.elo_value} · {item.profile.matches_played} trận
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Thời gian</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatFullDateTime(item.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-600">{[item.profile.district, item.profile.city].filter(Boolean).join(", ") || "Chưa có khu vực"}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      {item.reviewedAt ? `Đã xử lý: ${formatFullDateTime(item.reviewedAt)}` : "Chưa xử lý"}
                      {item.reviewNote ? ` · ${item.reviewNote}` : ""}
                    </p>
                    <div className="flex gap-2">
                      {item.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={reviewingId === item.id}
                            onClick={() => void reviewRegistration(item.id, "registered")}
                          >
                            Xác nhận đã thanh toán
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={reviewingId === item.id}
                            onClick={() => void reviewRegistration(item.id, "cancelled")}
                          >
                            Hủy đơn
                          </Button>
                        </>
                      ) : (
                        <Badge tone={statusTone(item.status)}>{registrationStatusLabel(item.status)}</Badge>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

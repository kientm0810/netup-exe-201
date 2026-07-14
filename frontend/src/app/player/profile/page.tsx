"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge, Button, Card, Field, Notice, PageHero, StatCard, inputClassName } from "@/components/ui";
import { avatarInitials } from "@/lib/avatar";
import { apiFetch } from "@/lib/http";
import { errorMessage, formatFullDateTime, formatNumber } from "@/lib/format";

type PlayerProfile = {
  id: string;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  visible_skill_tier: string;
  elo_value: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  has_assessment: boolean;
  created_at: string;
  updated_at: string;
};

function skillLabel(value: string) {
  if (value === "Advanced") return "Nâng cao";
  if (value === "Intermediate") return "Trung bình";
  return "Người mới";
}

export default function PlayerProfilePage() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Đang tải hồ sơ người chơi...");
  const [isSaving, setIsSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");

  // Avatar error flags for fallback initials
  const [profileAvatarError, setProfileAvatarError] = useState(false);
  const [formAvatarError, setFormAvatarError] = useState(false);

  useEffect(() => {
    setProfileAvatarError(false);
    setFormAvatarError(false);
  }, [profile?.avatar_url, avatarUrl]);

  function syncForm(next: PlayerProfile) {
    setFullName(next.full_name);
    setAvatarUrl(next.avatar_url ?? "");
    setPhone(next.phone ?? "");
    setCity(next.city ?? "");
    setDistrict(next.district ?? "");
  }

  async function loadProfile() {
    setError("");
    try {
      const payload = await apiFetch<PlayerProfile>("/api/v1/player/profiles/me", {
        credentials: "include",
      });
      setProfile(payload);
      syncForm(payload);
      setMessage("Hồ sơ đã đồng bộ với dữ liệu tài khoản và ELO.");
    } catch (caught) {
      setError(errorMessage(caught, "Không tải được hồ sơ người chơi"));
      setProfile(null);
      setMessage("Không thể đọc hồ sơ hiện tại.");
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const payload = await apiFetch<PlayerProfile>("/api/v1/player/profiles/me", {
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({
          full_name: fullName,
          avatar_url: avatarUrl || null,
          phone: phone || null,
          city: city || null,
          district: district || null,
        }),
      });
      setProfile(payload);
      syncForm(payload);
      setMessage("Đã lưu hồ sơ người chơi.");
    } catch (caught) {
      setError(errorMessage(caught, "Không lưu được hồ sơ"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Hồ sơ người chơi"
        title="Thông tin cá nhân, khu vực chơi và chỉ số ELO."
        description={message}
        aside={
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            {profile?.avatar_url && !profileAvatarError ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.full_name} 
                className="h-16 w-16 rounded-full object-cover" 
                onError={() => setProfileAvatarError(true)}
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-xl font-black text-red-800 animate-fade-in">
                {avatarInitials(profile?.full_name ?? fullName)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-semibold text-slate-950">
                {profile?.full_name ?? "Người chơi"}
              </p>
              <p className="mt-1 truncate text-sm text-slate-600">{profile?.email ?? "Đăng nhập để xem email"}</p>
              <Badge className="mt-2" tone={profile?.has_assessment ? "success" : "warning"}>
                {profile?.has_assessment ? skillLabel(profile.visible_skill_tier) : "Chưa đánh giá level"}
              </Badge>
            </div>
          </div>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ELO" value={formatNumber(profile?.elo_value)} helper={skillLabel(profile?.visible_skill_tier ?? "Beginner")} tone="accent" />
        <StatCard label="Trận đã chơi" value={formatNumber(profile?.matches_played)} helper={`${profile?.wins ?? 0} thắng`} />
        <StatCard label="Thắng / thua" value={`${profile?.wins ?? 0}/${profile?.losses ?? 0}`} helper={`${profile?.draws ?? 0} hòa`} tone="success" />
        <StatCard label="Cập nhật" value={profile ? formatFullDateTime(profile.updated_at) : "Chưa có"} helper="Hồ sơ cá nhân" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-950">Thông tin hiển thị</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Các trường này giúp người khác nhận diện bạn trong phòng ghép slot và danh sách giải đấu.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Họ tên">
              <input className={inputClassName} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </Field>
            <Field label="Số điện thoại">
              <input className={inputClassName} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Ví dụ: 0912345678" />
            </Field>
            <Field label="Thành phố">
              <input className={inputClassName} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ví dụ: Hà Nội" />
            </Field>
            <Field label="Quận/Huyện">
              <input className={inputClassName} value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="Ví dụ: Thạch Thất" />
            </Field>
          </div>

          <Field label="Ảnh đại diện URL">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {avatarUrl && !formAvatarError ? (
                  <img
                    src={avatarUrl}
                    alt="Preview Avatar"
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100"
                    onError={() => setFormAvatarError(true)}
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-lg font-black text-red-800 animate-fade-in">
                    {avatarInitials(fullName)}
                  </span>
                )}
                <input
                  className={`${inputClassName} flex-1`}
                  value={avatarUrl}
                  onChange={(event) => {
                    setAvatarUrl(event.target.value);
                    setFormAvatarError(false);
                  }}
                  placeholder="https://... hoặc chọn avatar bên dưới"
                />
              </div>

              {/* Local Avatar presets */}
              <div className="space-y-1 mt-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chọn nhanh avatar ngộ nghĩnh</p>
                <div className="flex flex-wrap gap-2 py-1">
                  {["Felix", "Aneka", "Jack", "Kim", "Buster", "Luna", "Oliver", "Milo"].map((seed) => {
                    const url = `/avatars/${seed.toLowerCase()}.svg`;
                    const isSelected = avatarUrl === url;
                    return (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => {
                          setAvatarUrl(url);
                          setFormAvatarError(false);
                        }}
                        className={`h-9 w-9 rounded-full overflow-hidden border-2 bg-slate-50 transition cursor-pointer shrink-0 ${
                          isSelected ? "border-red-800 scale-110 shadow-sm" : "border-transparent opacity-80 hover:opacity-100 hover:scale-105"
                        }`}
                        title={`Chọn avatar ${seed}`}
                      >
                        <img src={url} alt={seed} className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Field>

          <Button disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu hồ sơ"}</Button>
        </form>

        <Card className="space-y-4">
          <h2 className="font-heading text-xl font-semibold text-slate-950">Tóm tắt profile</h2>
          <div className="space-y-3 text-sm text-slate-700">
            <p>Email: <span className="font-semibold text-slate-950">{profile?.email ?? "Chưa có"}</span></p>
            <p>Khu vực: <span className="font-semibold text-slate-950">{[profile?.district, profile?.city].filter(Boolean).join(", ") || "Chưa cập nhật"}</span></p>
            <p>Tham gia từ: <span className="font-semibold text-slate-950">{profile ? formatFullDateTime(profile.created_at) : "Chưa có"}</span></p>
          </div>
          <Notice tone="info">
            Email và số điện thoại chỉ hiển thị trong hồ sơ của bạn; danh sách matchup chỉ dùng thông tin công khai.
          </Notice>
        </Card>
      </section>
    </div>
  );
}

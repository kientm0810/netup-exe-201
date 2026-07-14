"use client";

import React, { useState } from "react";
import { avatarInitials } from "@/lib/avatar";
import { formatVnd } from "@/lib/format";

type Match = {
  id: string;
  teamA: string;
  scoreA?: number;
  teamB: string;
  scoreB?: number;
  time?: string;
  court?: string;
  winner?: "A" | "B";
};

type BracketRound = {
  roundName: string;
  matches: Match[];
};

type TournamentPlayerProfile = {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  city?: string | null;
  district?: string | null;
  visible_skill_tier: string;
  elo_value: number;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
};

export type TournamentRegistration = {
  id: string;
  status: "pending" | "registered" | "cancelled";
  teamName: string;
  player1: string;
  player2?: string | null;
  createdAt: string;
  profile: TournamentPlayerProfile;
};

export type Tournament = {
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
  level: "movement" | "semi_pro" | "pro";
  fee: number;
  description: string;
  bankQrImageUrl?: string | null;
  bankTransferCaption?: string | null;
  bracket?: BracketRound[];
  registrations?: TournamentRegistration[];
};

type Props = {
  tournament: Tournament | null;
  onClose: () => void;
  onRegister: (tournament: Tournament) => void;
  isJoined: boolean;
  registrationStatus?: "pending" | "registered" | "cancelled" | null;
};

export default function TournamentDetailModal({ tournament, onClose, onRegister, isJoined, registrationStatus }: Props) {
  const [activeTab, setActiveTab] = useState<"info" | "bracket" | "players">("info");

  if (!tournament) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "upcoming":
        return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 border border-red-200">Sắp diễn ra</span>;
      case "ongoing":
        return <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 border border-orange-200">Đang diễn ra</span>;
      case "completed":
        return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200">Đã kết thúc</span>;
      default:
        return null;
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case "movement":
        return "Phong trào";
      case "semi_pro":
        return "Bán chuyên";
      case "pro":
        return "Chuyên nghiệp";
      default:
        return "";
    }
  };

  const getRegistrationStatusLabel = (status: string | null | undefined) => {
    switch (status) {
      case "pending":
        return "Chờ admin duyệt thanh toán";
      case "registered":
        return "Đã xác nhận";
      case "cancelled":
        return "Đã hủy";
      default:
        return "";
    }
  };

  const getSkillLabel = (tier: string) => {
    switch (tier) {
      case "Advanced":
        return "Nâng cao";
      case "Intermediate":
        return "Trung bình";
      default:
        return "Người mới";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Image */}
        <div className="relative h-48 sm:h-60 w-full bg-slate-100 shrink-0">
          <img
            src={tournament.image}
            alt={tournament.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>

          {/* Title & Status */}
          <div className="absolute bottom-4 left-6 right-6 text-white">
            <div className="flex flex-wrap items-center gap-3">
              {getStatusBadge(tournament.status)}
              <span className="rounded-md bg-white/20 backdrop-blur-xs px-2.5 py-0.5 text-xs font-semibold text-white">
                {tournament.sport}
              </span>
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
              {tournament.title}
            </h2>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 shrink-0">
          <button
            onClick={() => setActiveTab("info")}
            className={`py-3.5 px-4 text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === "info"
                ? "border-red-800 text-red-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Thông tin chi tiết
          </button>
          <button
            onClick={() => setActiveTab("bracket")}
            className={`py-3.5 px-4 text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === "bracket"
                ? "border-red-800 text-red-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Sơ đồ nhánh đấu (Bracket)
          </button>
          <button
            onClick={() => setActiveTab("players")}
            className={`py-3.5 px-4 text-sm font-bold border-b-2 transition cursor-pointer ${
              activeTab === "players"
                ? "border-red-800 text-red-800"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Đội đăng ký
          </button>
        </div>

        {/* Tab Contents - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-slate-50/30">
          
          {/* Tab 1: Info */}
          {activeTab === "info" && (
            <div className="grid gap-6 md:grid-cols-3">
              {/* Main Content */}
              <div className="md:col-span-2 space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-3xs">
                  <h3 className="font-heading font-bold text-slate-900 text-base mb-3 pb-2 border-b border-slate-100">
                    Mô tả giải đấu
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                    {tournament.description}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-3xs">
                  <h3 className="font-heading font-bold text-slate-900 text-base mb-3 pb-2 border-b border-slate-100">
                    Cơ cấu giải thưởng
                  </h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Vô địch</p>
                      <p className="mt-1 font-heading text-lg font-black text-amber-950">
                        {formatVnd(tournament.prizeMoney * 0.5)}
                      </p>
                      <p className="text-[9px] text-amber-600 mt-0.5">Cúp + Huy chương Vàng</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Á quân</p>
                      <p className="mt-1 font-heading text-lg font-black text-slate-950">
                        {formatVnd(tournament.prizeMoney * 0.3)}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">Huy chương Bạc</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">Hạng ba</p>
                      <p className="mt-1 font-heading text-lg font-black text-orange-950">
                        {formatVnd(tournament.prizeMoney * 0.2)}
                      </p>
                      <p className="text-[9px] text-orange-600 mt-0.5">Huy chương Đồng</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-3xs text-sm space-y-3.5">
                  <h3 className="font-heading font-bold text-slate-900 text-sm mb-1">Thông số giải đấu</h3>
                  
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Thời gian:</span>
                    <span className="font-bold text-slate-800 text-right text-xs">
                      {tournament.startDate} - {tournament.endDate}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Địa điểm:</span>
                    <span className="font-bold text-slate-800 text-right text-xs max-w-[150px] truncate" title={tournament.location}>
                      {tournament.location}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Quy mô:</span>
                    <span className="font-bold text-slate-800">
                      {tournament.joinedTeams} / {tournament.maxTeams} đội
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Cấp độ:</span>
                    <span className="font-bold text-red-800 bg-red-50 rounded-md px-2 py-0.5 text-xs">
                      {getLevelLabel(tournament.level)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Lệ phí đăng ký:</span>
                    <span className="font-bold text-slate-850">
                      {tournament.fee === 0 ? "Miễn phí" : `${formatVnd(tournament.fee)} / đội`}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1.5">
                    <span className="text-slate-500 font-medium">Giải thưởng:</span>
                    <span className="font-heading font-extrabold text-[#b00c14] text-base">
                      {formatVnd(tournament.prizeMoney)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Bracket */}
          {activeTab === "bracket" && (
            <div className="w-full overflow-x-auto py-4">
              {tournament.bracket && tournament.bracket.length > 0 ? (
                <div className="flex min-w-[700px] items-stretch justify-around gap-4 px-2">
                  {tournament.bracket.map((round, rIdx) => (
                    <div key={rIdx} className="flex-1 flex flex-col justify-around gap-6">
                      <div className="text-center font-heading font-bold text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2 mb-2">
                        {round.roundName}
                      </div>
                      
                      <div className="flex-1 flex flex-col justify-around gap-4 min-h-[300px]">
                        {round.matches.map((match) => (
                          <div
                            key={match.id}
                            className="relative rounded-xl border border-slate-200 bg-white p-3 shadow-xs flex flex-col gap-1.5 hover:border-slate-350 transition duration-150"
                          >
                            {/* Team A */}
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-semibold truncate max-w-[120px] ${
                                match.winner === "A" ? "text-slate-900 font-bold" : "text-slate-500"
                              }`}>
                                {match.teamA}
                              </span>
                              {match.scoreA !== undefined && (
                                <span className={`font-bold ml-2 ${
                                  match.winner === "A" ? "text-red-800" : "text-slate-400"
                                }`}>
                                  {match.scoreA}
                                </span>
                              )}
                            </div>

                            {/* Separator Line */}
                            <div className="h-[1px] bg-slate-100" />

                            {/* Team B */}
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-semibold truncate max-w-[120px] ${
                                match.winner === "B" ? "text-slate-900 font-bold" : "text-slate-500"
                              }`}>
                                {match.teamB}
                              </span>
                              {match.scoreB !== undefined && (
                                <span className={`font-bold ml-2 ${
                                  match.winner === "B" ? "text-red-800" : "text-slate-400"
                                }`}>
                                  {match.scoreB}
                                </span>
                              )}
                            </div>

                            {/* Match details (Time, Court) */}
                            {(match.time || match.court) && (
                              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-dashed border-slate-100 pt-1.5">
                                <span>{match.time}</span>
                                <span>{match.court}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-sm font-semibold">Chưa cập nhật sơ đồ nhánh đấu</p>
                  <p className="text-xs text-slate-400 mt-1">Sơ đồ sẽ hiển thị khi giải đấu bắt đầu diễn ra.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "players" && (
            <div className="space-y-4">
              {(tournament.registrations ?? []).length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-sm font-semibold">Chưa có đội nào gửi đơn đăng ký</p>
                  <p className="text-xs text-slate-400 mt-1">Danh sách đội sẽ hiển thị sau khi có đơn đăng ký.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(tournament.registrations ?? []).map((registration) => (
                    <article key={registration.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-3xs">
                      <div className="flex items-start gap-3">
                        {registration.profile.avatar_url ? (
                          <img
                            src={registration.profile.avatar_url}
                            alt={registration.profile.full_name}
                            className="h-11 w-11 rounded-full object-cover ring-2 ring-slate-100"
                          />
                        ) : (
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
                            {avatarInitials(registration.profile.full_name)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-heading text-sm font-bold text-slate-950 truncate">
                                {registration.teamName}
                              </p>
                              <p className="mt-0.5 text-xs font-semibold text-slate-600 truncate">
                                {registration.player1}
                                {registration.player2 ? ` & ${registration.player2}` : ""}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              registration.status === "registered"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            }`}>
                              {registration.status === "registered" ? "Đã xác nhận" : "Chờ duyệt"}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                            <div className="rounded-lg bg-slate-50 p-2">
                              <p className="font-bold text-slate-400 uppercase">ELO</p>
                              <p className="mt-0.5 font-black text-slate-900">{registration.profile.elo_value}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-2">
                              <p className="font-bold text-slate-400 uppercase">Level</p>
                              <p className="mt-0.5 font-black text-slate-900">
                                {getSkillLabel(registration.profile.visible_skill_tier)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-2">
                              <p className="font-bold text-slate-400 uppercase">Trận</p>
                              <p className="mt-0.5 font-black text-slate-900">{registration.profile.matches_played}</p>
                            </div>
                          </div>

                          <p className="mt-3 text-[11px] font-semibold text-slate-500">
                            {[registration.profile.district, registration.profile.city].filter(Boolean).join(", ") || "Chưa cập nhật khu vực"}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 shrink-0 flex justify-between items-center">
          <div className="text-xs text-slate-500">
            {registrationStatus
              ? getRegistrationStatusLabel(registrationStatus)
              : tournament.status === "upcoming"
              ? "* Hạn chót đăng ký trước giải 5 ngày"
              : "* Giải đấu đã đóng đăng ký"}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              Đóng
            </button>
            {tournament.status === "upcoming" && (
              <button
                disabled={isJoined}
                onClick={() => onRegister(tournament)}
                className={`rounded-xl px-5 py-2 text-xs font-bold text-white transition shadow-xs cursor-pointer ${
                  registrationStatus === "pending"
                    ? "bg-amber-600 cursor-not-allowed"
                    : isJoined
                    ? "bg-emerald-600 cursor-not-allowed"
                    : "bg-[#b00c14] hover:bg-red-950"
                }`}
              >
                {registrationStatus === "pending"
                  ? "Chờ duyệt thanh toán"
                  : isJoined
                  ? "✓ Đã đăng ký"
                  : "Đăng ký tham gia giải"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

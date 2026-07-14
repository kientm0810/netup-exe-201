"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Target, Zap, RefreshCw, CalendarCheck, Heart, Car, Snowflake, Lightbulb, Check, Clock, Users, Sparkles, Scale, Handshake, ShieldCheck } from "lucide-react";

import { Badge, Button, ButtonLink, Card, EmptyState, Field, Notice, inputClassName } from "@/components/ui";
import { avatarInitials } from "@/lib/avatar";
import { API_BASE_URL, ApiError, apiFetch } from "@/lib/http";
import {
  courtImageForSport,
  errorMessage,
  formatTimeRange,
  formatVnd,
  postTypeLabel,
  recommendationLabel,
  sportLabel,
} from "@/lib/format";

type Variant = "player" | "owner";
type SportFilter = "" | "Badminton" | "Football" | "Tennis";
type PostTypeFilter = "" | "pool" | "rental";
type DiscoveryTab = "map" | "booked" | "favorites";

type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
};

type SkillTierSummary = {
  visible_skill_tier: string;
  has_assessment: boolean;
};

type JoinedPlayerProfile = {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  city?: string | null;
  district?: string | null;
  visible_skill_tier?: string;
  elo_value?: number;
  matches_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
};

type Session = {
  id: string;
  title: string;
  description?: string | null;
  post_type: string;
  status: string;
  image_url?: string | null;
  starts_at: string;
  duration_minutes: number;
  ends_at: string;
  open_slots: number;
  max_slots: number;
  required_skill_min: string;
  required_skill_max: string;
  slot_price_vnd: number;
  full_court_price_vnd: number;
  is_peak_hour: boolean;
  allows_solo_join: boolean;
  court_name: string;
  sub_court_name: string;
  court_image_url?: string | null;
  sport: string;
  amenities: string[];
  complex_name: string;
  district: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  pool_post_id?: string | null;
  player_skill_tier?: string | null;
  recommendation_score?: number | null;
  recommendation_label?: string | null;
  distance_bucket?: string | null;
  slot_fit_score?: number | null;
  joined_players?: JoinedPlayerProfile[];
};

type MatchmakingSession = Session & {
  index: number;
  courtName: string;
  complexName: string;
  distance: string;
  time: string;
  dateLabel: string;
  slotsJoined: number;
  slotsMax: number;
  price: number;
  isMostSuitable: boolean;
  levelStatus: "suitable" | "warning";
  levelText: string;
  players: Array<JoinedPlayerProfile & { name: string; avatar: string | null }>;
  joinedCountText: string;
  hasParking: boolean;
};

const sportOptions: Array<{ value: SportFilter; label: string }> = [
  { value: "", label: "Tất cả môn" },
  { value: "Badminton", label: "Cầu lông" },
  { value: "Football", label: "Bóng đá" },
  { value: "Tennis", label: "Tennis" },
];

const postTypeOptions: Array<{ value: PostTypeFilter; label: string }> = [
  { value: "", label: "Tất cả kiểu đặt" },
  { value: "pool", label: "Kèo chờ ghép" },
  { value: "rental", label: "Thuê nguyên sân" },
];

const discoveryTabs: Array<{ value: DiscoveryTab; label: string; icon: string }> = [
  { value: "map", label: "Bản đồ", icon: "⌖" },
  { value: "booked", label: "Sân đã đặt", icon: "✓" },
  { value: "favorites", label: "Yêu thích", icon: "♡" },
];

const skillRanks: Record<string, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

const tierLabels: Record<string, string> = {
  Beginner: "Người mới",
  Intermediate: "Trung bình",
  Advanced: "Nâng cao",
};

function getSportIcon(sport: string) {
  const s = sport.toLowerCase();
  if (s.includes("pickleball")) return "🏓";
  if (s.includes("badminton") || s.includes("cầu lông")) return "🏸";
  if (s.includes("tennis")) return "🎾";
  if (s.includes("football") || s.includes("bóng đá")) return "⚽";
  return "🏆";
}

function loginUrl() {
  return `${API_BASE_URL}/api/v1/auth/google/start`;
}

function isAuthFailure(caught: unknown) {
  return caught instanceof ApiError && (caught.status === 401 || caught.status === 403);
}

function recommendationTone(label: string | null | undefined): "success" | "info" | "neutral" {
  if (label === "high") return "success";
  if (label === "medium") return "info";
  return "neutral";
}

function hasOpenSlots(session: Session) {
  return session.open_slots > 0;
}

function sessionMatchesSearch(session: Session, search: string) {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return true;
  return [
    session.title,
    session.court_name,
    session.sub_court_name,
    session.complex_name,
    session.district,
    session.address,
    sportLabel(session.sport),
  ]
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}

function tierFitsSession(session: Session, tier: string) {
  const playerRank = skillRanks[tier] ?? 1;
  const minRank = skillRanks[session.required_skill_min] ?? 1;
  const maxRank = skillRanks[session.required_skill_max] ?? 3;
  return playerRank >= minRank && playerRank <= maxRank;
}

function distanceLabel(session: Session, index: number) {
  if (session.distance_bucket === "same_district") return "2.4km";
  if (session.distance_bucket === "different_district") return "6.7km";
  const seed = session.id.charCodeAt(0) + index * 7;
  return `${((seed % 72) / 10 + 1.2).toFixed(1)}km`;
}

function ratingLabel(session: Session, index: number) {
  const score = session.recommendation_score ?? 70 + index;
  return (4.3 + Math.min(score, 100) / 400).toFixed(1);
}

function mapUrl(session: Session) {
  const query =
    session.latitude && session.longitude
      ? `${session.latitude},${session.longitude}`
      : `${session.complex_name} ${session.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function shortTimeRange(startsAt: string, durationMinutes: number) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Chưa có giờ";
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const format = (value: Date) => value.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return `${format(start)} - ${format(end)}`;
}

function shortDateLabel(startsAt: string) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "Chưa có ngày";
  return date.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

function timeBucketMatches(startsAt: string, bucket: string) {
  if (bucket === "Tất cả khung giờ") return true;
  const startHour = Number(bucket.slice(0, 2));
  const endHour = Number(bucket.slice(8, 10));
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime()) || Number.isNaN(startHour) || Number.isNaN(endHour)) return true;
  const hourStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
  const hour = Number(hourStr);
  return hour >= startHour && hour < endHour;
}

function amenityIncludes(session: Session, keywords: string[]) {
  const text = session.amenities.join(" ").toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}

function playerSkillLabel(tier: string | null | undefined) {
  return tierLabels[tier ?? ""] ?? "Người mới";
}

function sessionImage(session: Session) {
  return session.image_url || session.court_image_url || courtImageForSport(session.sport);
}

function toMatchmakingSession(session: Session, index: number, activeTier: string): MatchmakingSession {
  const slotsJoined = Math.max(0, session.max_slots - session.open_slots);
  const players = (session.joined_players ?? []).slice(0, 4).map((player) => ({
    ...player,
    id: player.id,
    name: player.full_name,
    avatar: player.avatar_url ?? null,
  }));
  const hiddenPlayers = Math.max(0, slotsJoined - players.length);
  const fitsTier = tierFitsSession(session, activeTier);

  return {
    ...session,
    index: index + 1,
    courtName: session.sub_court_name || session.court_name,
    complexName: session.complex_name,
    distance: distanceLabel(session, index),
    time: shortTimeRange(session.starts_at, session.duration_minutes),
    dateLabel: shortDateLabel(session.starts_at),
    slotsJoined,
    slotsMax: session.max_slots,
    price: session.slot_price_vnd,
    isMostSuitable: session.recommendation_label === "high" || index === 0,
    levelStatus: fitsTier ? "suitable" : "warning",
    levelText: fitsTier ? "Trình độ phù hợp với bạn" : "Ngoài khoảng trình độ hiện tại",
    players,
    joinedCountText:
      slotsJoined > 0
        ? hiddenPlayers > 0
          ? `+${hiddenPlayers} người đã tham gia`
          : `${slotsJoined} slot đã được giữ`
        : "Chưa có người tham gia",
    hasParking: amenityIncludes(session, ["parking", "gửi xe", "giu xe", "đỗ xe", "do xe"]),
  };
}

// Type definitions
type GroupedCourt = {
  complexName: string;
  subCourtName: string;
  courtName: string;
  id: string;
  sport: string;
  address: string;
  district: string;
  basePrice: number;
  minRentalDurationMinutes: number;
  maxRentalDurationMinutes: number;
  amenities: string[];
  rating: string;
  distance: string;
  imageUrl: string;
  latitude?: number | null;
  longitude?: number | null;
  slots: Array<{
    sessionId: string;
    timeLabel: string;
    startsAt: string;
    openSlots: number;
    status: string;
  }>;
};

// Coordinates helper for the SVG map pin positions
const getPinCoords = (index: number) => {
  const predefinedCoords = [
    { x: 30, y: 35 }, // Pin 1
    { x: 72, y: 25 }, // Pin 2
    { x: 42, y: 55 }, // Pin 3
    { x: 60, y: 70 }, // Pin 4
    { x: 22, y: 65 }, // Pin 5
    { x: 80, y: 60 }, // Pin 6
  ];
  return predefinedCoords[index % predefinedCoords.length];
};

function generateDateOptions(days: number) {
  const options = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    const value = localDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const label = shortDateLabel(d.toISOString());
    options.push({ value, label });
  }
  return options;
}

export function BookingMarketplace({ variant }: { variant: Variant }) {
  const searchParams = useSearchParams();
  const isMatchmaking = searchParams.get("mode") === "matchmaking";
  const isBookingMode = searchParams.get("mode") === "booking";

  const [user, setUser] = useState<UserProfile | null>(null);
  const [skillTier, setSkillTier] = useState<SkillTierSummary | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("Đang tìm các khung giờ phù hợp cho bạn...");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [sport, setSport] = useState<SportFilter>("");
  const [district, setDistrict] = useState("");
  const [postType, setPostType] = useState<PostTypeFilter>("");
  const [openOnly, setOpenOnly] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("map");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [playAll, setPlayAll] = useState(false);

  const [location, setLocation] = useState("Tất cả khu vực");
  const [matchDate, setMatchDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    return localToday.toISOString().split("T")[0];
  });
  const [matchTime, setMatchTime] = useState("Tất cả khung giờ");
  const [courtType, setCourtType] = useState("Tất cả sân");
  const [activeFilterDropdown, setActiveFilterDropdown] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<JoinedPlayerProfile | null>(null);

  // Popup nhắc đánh giá trình độ khi vào xếp đối vãng lai
  const [showAssessmentPrompt, setShowAssessmentPrompt] = useState(false);
  const assessmentPromptShownRef = useRef(false);

  const effectivePostType: PostTypeFilter = isMatchmaking ? "pool" : isBookingMode ? "rental" : postType;

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (sport) params.set("sport", sport);
    if (district.trim()) params.set("district", district.trim());
    if (effectivePostType) params.set("post_type", effectivePostType);
    if (openOnly && !isBookingMode) params.set("has_open_slots", "true");
    
    if (matchDate) {
      params.set("starts_from", `${matchDate}T00:00:00+07:00`);
      params.set("starts_to", `${matchDate}T23:59:59+07:00`);
    }
    return params.toString();
  }, [district, effectivePostType, openOnly, sport, matchDate]);

  async function loadDiscovery() {
    setIsLoading(true);
    setError("");
    try {
      let nextUser: UserProfile | null = null;
      let nextTier: SkillTierSummary | null = null;
      let endpoint = "/api/v1/public/discovery/sessions";

      try {
        nextUser = await apiFetch<UserProfile>("/api/v1/auth/me", { credentials: "include" });
        endpoint = "/api/v1/player/discovery/sessions";
      } catch (caught) {
        if (!isAuthFailure(caught)) throw caught;
      }

      if (nextUser) {
        try {
          nextTier = await apiFetch<SkillTierSummary>("/api/v1/player/skill-tier", { credentials: "include" });
        } catch (caught) {
          if (isAuthFailure(caught)) {
            nextUser = null;
            endpoint = "/api/v1/public/discovery/sessions";
          } else {
            nextTier = null;
          }
        }
      }

      const nextSessions = await apiFetch<Session[]>(`${endpoint}${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      setUser(nextUser);
      setSkillTier(nextTier);
      setSessions(nextSessions);
      setMessage(
        nextUser
          ? isBookingMode
            ? `Có ${nextSessions.length} sân đang mở cho thuê nguyên sân.`
            : `Có ${nextSessions.length} khung giờ đang được xếp theo độ phù hợp.`
          : isBookingMode
            ? `Có ${nextSessions.length} sân công khai đang mở cho thuê nguyên sân. Đăng nhập để đặt sân.`
            : `Có ${nextSessions.length} khung giờ công khai. Đăng nhập để đặt sân và cá nhân hóa level.`,
      );
    } catch (caught) {
      setUser(null);
      setSkillTier(null);
      setSessions([]);
      setError(
        errorMessage(
          caught,
          isBookingMode ? "Không tải được danh sách sân cho thuê nguyên sân" : "Không tải được danh sách xếp đối vãng lai",
        ),
      );
      setMessage("Chưa tải được dữ liệu sân.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDiscovery();
  }, [query]);

  // Hiện popup gợi ý đánh giá khi lần đầu vào mode matchmaking mà chưa có assessment
  useEffect(() => {
    if (isMatchmaking && skillTier !== null && !skillTier.has_assessment && !assessmentPromptShownRef.current) {
      assessmentPromptShownRef.current = true;
      setShowAssessmentPrompt(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMatchmaking, skillTier]);

  function onFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadDiscovery();
  }

  const activeTier = skillTier?.visible_skill_tier ?? "Intermediate";

  const visibleSessions = useMemo(() => {
    let items = sessions.filter((item) => sessionMatchesSearch(item, search));
    if (activeTab === "favorites") {
      items = items.filter((item) => favorites.includes(item.id));
    }
    if (activeTab === "booked") {
      return [];
    }
    if (isMatchmaking && !playAll) {
      items = items.filter((item) => item.post_type === "pool" && tierFitsSession(item, activeTier));
    }
    return items;
  }, [activeTab, activeTier, favorites, isMatchmaking, playAll, search, sessions]);

  const stats = useMemo(() => {
    const poolCount = visibleSessions.filter((item) => item.post_type === "pool").length;
    const rentalCount = visibleSessions.filter((item) => item.post_type === "rental").length;
    const openSlotCount = visibleSessions.reduce((total, item) => total + item.open_slots, 0);
    return { poolCount, rentalCount, openSlotCount };
  }, [visibleSessions]);

  function toggleFavorite(sessionId: string) {
    setFavorites((current) =>
      current.includes(sessionId) ? current.filter((item) => item !== sessionId) : [...current, sessionId],
    );
  }

  const locationOptions = useMemo(() => {
    const districts = Array.from(new Set(sessions.map((item) => item.district).filter(Boolean))).sort();
    return ["Tất cả khu vực", ...districts.map((item) => `${item}, Hà Nội`)];
  }, [sessions]);

  const dateOptions = useMemo(() => {
    return generateDateOptions(30);
  }, []);

  const timeOptions = ["Tất cả khung giờ", "06:00 - 10:00", "10:00 - 14:00", "14:00 - 18:00", "18:00 - 22:00"];

  const visibleMatchmakingSessions = useMemo(() => {
    let items = sessions.filter((item) => item.post_type === "pool").map((item, index) => toMatchmakingSession(item, index, activeTier));

    if (location && location !== "Tất cả khu vực") {
      const selectedLocWord = location.split(",")[0].toLowerCase().trim();
      items = items.filter((item) =>
        item.district.toLowerCase().includes(selectedLocWord) ||
        item.address.toLowerCase().includes(selectedLocWord) ||
        item.complexName.toLowerCase().includes(selectedLocWord)
      );
    }

    if (matchTime !== "Tất cả khung giờ") {
      items = items.filter((item) => timeBucketMatches(item.starts_at, matchTime));
    }

    if (courtType === "Sân trong nhà") {
      items = items.filter((item) => amenityIncludes(item, ["indoor", "trong nhà", "trong nha"]));
    } else if (courtType === "Sân ngoài trời") {
      items = items.filter((item) => amenityIncludes(item, ["outdoor", "ngoài trời", "ngoai troi"]));
    }

    if (!playAll) {
      items = items.filter((item) => item.levelStatus === "suitable");
    }

    if (favorites.length > 0 && activeTab === "favorites") {
      items = items.filter((item) => favorites.includes(item.id));
    }

    return items;
  }, [activeTab, activeTier, courtType, favorites, location, matchDate, matchTime, playAll, sessions]);

  const selectedSession = useMemo(() => {
    return visibleMatchmakingSessions.find((s) => s.id === selectedSessionId) || null;
  }, [selectedSessionId, visibleMatchmakingSessions]);

  useEffect(() => {
    if (!isMatchmaking && selectedSessionId !== null) {
      setSelectedSessionId(null);
      return;
    }
    if (
      isMatchmaking &&
      selectedSessionId !== null &&
      !visibleMatchmakingSessions.some((session) => session.id === selectedSessionId)
    ) {
      setSelectedSessionId(null);
    }
  }, [visibleMatchmakingSessions, isMatchmaking, selectedSessionId]);

  const userTierLabel = skillTier?.visible_skill_tier === "Beginner"
    ? "Người mới"
    : skillTier?.visible_skill_tier === "Advanced"
    ? "Nâng cao"
    : "Trung cấp";

  const bestMatch = visibleMatchmakingSessions[0] ?? null;
  const matchmakingOpenSlots = visibleMatchmakingSessions.reduce((total, item) => total + item.open_slots, 0);
  const visibleMatchedPlayers = visibleMatchmakingSessions.reduce((total, item) => total + item.slotsJoined, 0);
  const busiestTime = visibleMatchmakingSessions.length > 0 ? visibleMatchmakingSessions[0].time : "Chưa có khung giờ";

  // RENDER BOOKING MODE STATE AND LOGIC (Moved up to follow React Hook rules)
  const [selectedSlots, setSelectedSlots] = useState<Record<string, string[]>>({});
  const [selectedCourtKey, setSelectedCourtKey] = useState<string | null>(null);
  const [activeBookingTab, setActiveBookingTab] = useState<"all" | "empty" | "near">("all");

  const visibleRentalSessions = useMemo(() => {
    let items = sessions.filter((item) => item.post_type === "rental" && sessionMatchesSearch(item, search));
    if (activeTab === "favorites") {
      items = items.filter((item) => favorites.includes(item.id));
    }
    
    // Filters
    if (location && location !== "Tất cả khu vực") {
      const selectedLocWord = location.split(",")[0].toLowerCase().trim();
      items = items.filter((item) =>
        item.district.toLowerCase().includes(selectedLocWord) ||
        item.address.toLowerCase().includes(selectedLocWord) ||
        item.complex_name.toLowerCase().includes(selectedLocWord)
      );
    }
    if (matchTime !== "Tất cả khung giờ") {
      items = items.filter((item) => timeBucketMatches(item.starts_at, matchTime));
    }
    if (courtType === "Sân trong nhà") {
      items = items.filter((item) => amenityIncludes(item, ["indoor", "trong nhà", "trong nha"]));
    } else if (courtType === "Sân ngoài trời") {
      items = items.filter((item) => amenityIncludes(item, ["outdoor", "ngoài trời", "ngoai troi"]));
    }
    return items;
  }, [activeTab, courtType, favorites, location, matchDate, matchTime, search, sessions]);

  // Group sessions by Court Complex & Sub Court to display hourly slots
  const groupedCourts = useMemo(() => {
    const map: Record<string, GroupedCourt> = {};
    visibleRentalSessions.forEach((session, index) => {
      const key = `${session.complex_name}-${session.sub_court_name}`;
      const timeLabel = new Date(session.starts_at).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      });
      
      if (!map[key]) {
        map[key] = {
          complexName: session.complex_name,
          subCourtName: session.sub_court_name,
          courtName: session.court_name,
          id: session.id,
          sport: session.sport,
          address: session.address,
          district: session.district,
          basePrice: session.full_court_price_vnd,
          minRentalDurationMinutes: (session as any).min_rental_duration_minutes || 60,
          maxRentalDurationMinutes: (session as any).max_rental_duration_minutes || 120,
          amenities: session.amenities,
          rating: ratingLabel(session, index),
          distance: distanceLabel(session, index),
          imageUrl: sessionImage(session),
          latitude: session.latitude,
          longitude: session.longitude,
          slots: []
        };
      }
      
      map[key].slots.push({
        sessionId: session.id,
        timeLabel,
        startsAt: session.starts_at,
        openSlots: session.open_slots,
        status: session.status
      });
    });
    
    // Sort slots by starting time
    Object.values(map).forEach((court) => {
      court.slots.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    });
    
    return Object.values(map);
  }, [visibleRentalSessions]);

  // Filter groupedCourts by booking tabs
  const filteredGroupedCourts = useMemo(() => {
    if (activeBookingTab === "empty") {
      return groupedCourts.filter(c => c.slots.some(s => s.openSlots > 0));
    }
    if (activeBookingTab === "near") {
      return [...groupedCourts].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    }
    return groupedCourts;
  }, [groupedCourts, activeBookingTab]);

  const activeCourt = useMemo(() => {
    if (!selectedCourtKey) return filteredGroupedCourts[0] ?? null;
    return filteredGroupedCourts.find(c => `${c.complexName}-${c.subCourtName}` === selectedCourtKey) || filteredGroupedCourts[0] || null;
  }, [selectedCourtKey, filteredGroupedCourts]);

  // RENDER MATCHMAKING LAYOUT
  if (isMatchmaking) {
    return (
      <div className="space-y-6">

        {/* ====== POPUP: Gợi ý đánh giá trình độ ====== */}
        {showAssessmentPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAssessmentPrompt(false)}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* Modal */}
            <div
              className="relative z-10 w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header đỏ */}
              <div className="bg-[#b00c14] px-6 pt-8 pb-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">AI Skill Assessment</h2>
                <p className="mt-1.5 text-sm text-white/80 font-medium">
                  Đánh giá trình độ giúp xếp đối chính xác hơn cho bạn
                </p>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <Target className="h-6 w-6 shrink-0 text-[#b00c14]" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">Ghép đối thủ cùng trình độ</p>
                      <p className="text-xs text-slate-500 mt-0.5">Không lo lệch trình khi tham gia phòng ghép ELO.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <Zap className="h-6 w-6 shrink-0 text-[#b00c14]" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">Chỉ mất 2–3 phút</p>
                      <p className="text-xs text-slate-500 mt-0.5">Trả lời nhanh vài câu hỏi để AI phân tích level của bạn.</p>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 text-center">Bạn vẫn có thể xếp đối mà không cần đánh giá ngay bây giờ.</p>

                {/* Buttons */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <a
                    href="/player/assessment"
                    className="block w-full rounded-2xl bg-[#b00c14] py-3.5 text-center text-sm font-bold text-white transition hover:bg-red-800 shadow-lg"
                  >
                    Đánh giá ngay →
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowAssessmentPrompt(false)}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 cursor-pointer"
                  >
                    Bỏ qua, tiếp tục xếp đối
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Title Section */}
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Ghép đối thủ <span className="text-[#b00c14]">phù hợp</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base max-w-3xl">
            Hệ thống đã phân tích trình độ, thói quen chơi và thời gian của bạn để đề xuất những trận đấu phù hợp nhất.
          </p>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          
          {/* Location Selector */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setActiveFilterDropdown(activeFilterDropdown === "location" ? null : "location")}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-red-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="text-left leading-tight">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Khu vực</p>
                <p className="text-slate-800 text-xs">{location}</p>
              </div>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {activeFilterDropdown === "location" && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActiveFilterDropdown(null)} />
                <div className="absolute left-0 mt-2 z-40 w-[200px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {locationOptions.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => {
                        setLocation(loc);
                        setActiveFilterDropdown(null);
                      }}
                      className={`w-full block rounded-lg px-3 py-2 text-left text-xs transition cursor-pointer ${
                        location === loc ? "bg-red-50 text-red-800 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Date Selector */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setActiveFilterDropdown(activeFilterDropdown === "date" ? null : "date")}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <div className="text-left leading-tight">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Ngày</p>
                <p className="text-slate-800 text-xs">{dateOptions.find(d => d.value === matchDate)?.label || matchDate}</p>
              </div>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {activeFilterDropdown === "date" && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActiveFilterDropdown(null)} />
                <div className="absolute left-0 mt-2 z-40 w-[200px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {dateOptions.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => {
                        setMatchDate(d.value);
                        setActiveFilterDropdown(null);
                      }}
                      className={`w-full block rounded-lg px-3 py-2 text-left text-xs transition cursor-pointer ${
                        matchDate === d.value ? "bg-red-50 text-red-800 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Time Selector */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setActiveFilterDropdown(activeFilterDropdown === "time" ? null : "time")}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div className="text-left leading-tight">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Thời gian</p>
                <p className="text-slate-800 text-xs">{matchTime}</p>
              </div>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {activeFilterDropdown === "time" && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActiveFilterDropdown(null)} />
                <div className="absolute left-0 mt-2 z-40 w-[200px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {timeOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setMatchTime(t);
                        setActiveFilterDropdown(null);
                      }}
                      className={`w-full block rounded-lg px-3 py-2 text-left text-xs transition cursor-pointer ${
                        matchTime === t ? "bg-red-50 text-red-800 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Court Selector */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setActiveFilterDropdown(activeFilterDropdown === "court" ? null : "court")}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-orange-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="18" rx="2" ry="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              <div className="text-left leading-tight">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Số sân</p>
                <p className="text-slate-800 text-xs">{courtType}</p>
              </div>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {activeFilterDropdown === "court" && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActiveFilterDropdown(null)} />
                <div className="absolute left-0 mt-2 z-40 w-[200px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  {["Tất cả sân", "Sân trong nhà", "Sân ngoài trời"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCourtType(c);
                        setActiveFilterDropdown(null);
                      }}
                      className={`w-full block rounded-lg px-3 py-2 text-left text-xs transition cursor-pointer ${
                        courtType === c ? "bg-red-50 text-red-800 font-semibold" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Toggle Switch + Filter Button */}
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1.5 pr-3 transition hover:border-slate-300">
              <input
                type="checkbox"
                checked={playAll}
                onChange={(event) => setPlayAll(event.target.checked)}
                className="sr-only"
              />
              <span className={`relative h-6 w-11 rounded-full transition duration-200 ${playAll ? "bg-red-800" : "bg-slate-300"}`}>
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${playAll ? "translate-x-5" : ""}`} />
              </span>
              <span className="text-xs font-semibold text-slate-700">Ghép mọi trình độ</span>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-500 cursor-help" title="Bật chế độ này để xem các phòng ghép ở tất cả các cấp độ ELO khác nhau">
                i
              </span>
            </label>

            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Bộ lọc
            </button>
          </div>
        </div>

        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : (
          <Notice tone="info">{message}</Notice>
        )}

        {/* 2-Column Main Content Section */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_340px]">
          
          {/* LEFT COLUMN: Suggested Rooms */}
          <div className="space-y-4">
            
            {/* Header List */}
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-500 shrink-0" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <h2 className="font-heading text-lg font-bold text-slate-900">Đề xuất dành cho bạn</h2>
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
                  Dựa trên AI
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-pulse text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67" />
                </svg>
                <span>{isLoading ? "Đang cập nhật" : `${sessions.length} khung giờ từ backend`}</span>
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                <p className="text-base font-semibold">Đang tải phòng ghép từ backend...</p>
              </div>
            ) : visibleMatchmakingSessions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                <p className="text-base font-semibold">Không tìm thấy trận đấu nào phù hợp</p>
                <p className="text-xs text-slate-400 mt-1">Hãy đổi bộ lọc khu vực hoặc bật toggle "Ghép mọi trình độ" để xem thêm.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleMatchmakingSessions.map((session) => {
                  const isFull = session.slotsJoined === session.slotsMax;
                  const isNearFull = session.slotsJoined === session.slotsMax - 1;
                  
                  let badgeColor = "bg-green-50 text-green-700 border-green-200";
                  let badgeText = `Thiếu ${session.slotsMax - session.slotsJoined} người`;
                  if (isFull) {
                    badgeColor = "bg-red-50 text-red-700 border-red-200";
                    badgeText = "Đã đủ người";
                  } else if (isNearFull) {
                    badgeColor = "bg-orange-50 text-orange-700 border-orange-200";
                    badgeText = "Chỉ còn 1 chỗ";
                  }

                  return (
                    <article
                      key={session.id}
                      onClick={() => setSelectedSessionId(session.id)}
                      className={`group relative overflow-hidden rounded-2xl border p-4 shadow-2xs hover:shadow-md transition duration-200 flex flex-col md:flex-row gap-4 lg:gap-5 items-stretch cursor-pointer ${
                        selectedSessionId === session.id ? "border-[#b00c14] bg-slate-50/30" : "border-slate-200 bg-white"
                      }`}
                    >
                      {/* Div 1: Sân Image */}
                      <div className="relative h-40 w-full md:w-52 shrink-0 rounded-xl overflow-hidden bg-slate-100">
                        <img
                          src={sessionImage(session)}
                          alt={session.courtName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {/* Index tag */}
                        <div className="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 font-extrabold text-white text-sm backdrop-blur-xs">
                          {session.index}
                        </div>
                        {/* Best fit badge */}
                        {session.isMostSuitable && (
                          <div className="absolute bottom-3 left-3 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                            Phù hợp nhất
                          </div>
                        )}
                      </div>

                      {/* Div 2: Sân Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-1 gap-2">
                        <div>
                          <h3 className="font-heading text-xl font-bold text-slate-900 leading-tight">
                            {session.courtName}
                          </h3>
                          <p className="font-bold text-slate-800 text-sm mt-0.5">{session.complexName}</p>
                          
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span className="truncate">{session.address}</span>
                          </p>
                        </div>

                        {/* Tags row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-600 mt-2">
                          <span className="flex items-center gap-1.5">
                            <span>{getSportIcon(session.sport)}</span>
                            {session.sport}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {/* Abstract route map icon for distance */}
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                              <line x1="9" y1="3" x2="9" y2="18" />
                              <line x1="15" y1="6" x2="15" y2="21" />
                            </svg>
                            {session.distance}
                          </span>
                          {session.hasParking && (
                            <span className="flex items-center gap-1.5">
                              {/* Abstract steering wheel parking icon */}
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="2" x2="12" y2="12" />
                                <line x1="12" y1="12" x2="8" y2="18" />
                                <line x1="12" y1="12" x2="16" y2="18" />
                              </svg>
                              Có chỗ gửi xe
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Div 3: Match Details */}
                      <div className="w-full md:w-52 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 flex flex-col gap-2.5 justify-center py-1">
                        {/* Time */}
                        <div className="flex items-center gap-2 text-slate-700">
                          {/* Abstract Hourglass for Time */}
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 2h14M5 22h14M19 2v4a7 7 0 01-7 7v0a7 7 0 01-7-7V2M5 22v-4a7 7 0 017-7v0a7 7 0 017 7v4" />
                            <path d="M12 7v0M12 17v0" />
                          </svg>
                          <span className="font-bold text-slate-800 text-sm">{session.time}</span>
                        </div>

                        {/* Slots */}
                        <div className="flex items-center gap-2 text-slate-700">
                          {/* Abstract Capacity Connected Nodes Icon */}
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <circle cx="6" cy="6" r="2" />
                            <circle cx="18" cy="6" r="2" />
                            <circle cx="18" cy="18" r="2" />
                            <circle cx="6" cy="18" r="2" />
                            <line x1="6" y1="6" x2="9.5" y2="9.5" />
                            <line x1="18" y1="6" x2="14.5" y2="9.5" />
                            <line x1="18" y1="18" x2="14.5" y2="14.5" />
                            <line x1="6" y1="18" x2="9.5" y2="14.5" />
                          </svg>
                          <span className="font-bold text-emerald-700 text-sm">
                            {session.slotsJoined} / {session.slotsMax} người
                          </span>
                        </div>

                        {/* Badge slots left */}
                        <div>
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeColor}`}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Suitability */}
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          {session.levelStatus === "suitable" ? (
                            <>
                              {/* Abstract suit radar chart symbol */}
                              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 12l10 10 10-10L12 2z" />
                                <path d="M12 6l-6 6 6 6 6-6-6-6z" />
                                <circle cx="12" cy="12" r="2" fill="currentColor" />
                              </svg>
                              <span className="text-emerald-700 font-bold">{session.levelText}</span>
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 12l10 10 10-10L12 2z" />
                                <path d="M12 6l-6 6 6 6 6-6-6-6z" fill="#fef3c7" />
                              </svg>
                              <span className="text-amber-700 font-bold">{session.levelText}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Div 4: Pricing & Actions */}
                      <div className="w-full md:w-44 shrink-0 flex flex-col justify-between items-end py-1 pl-2">
                        {/* Heart Icon at top right */}
                        <div className="w-full flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(session.id);
                            }}
                            className={`flex h-8.5 w-8.5 items-center justify-center rounded-xl border transition ${
                              favorites.includes(session.id)
                                ? "border-rose-200 bg-rose-50 text-rose-600"
                                : "border-slate-200 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            } cursor-pointer`}
                          >
                            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill={favorites.includes(session.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                            </svg>
                          </button>
                        </div>

                        {/* Price & Join Button */}
                        <div className="w-full flex flex-col items-end gap-2.5">
                          <span className="font-heading text-xl font-extrabold text-slate-900 leading-none">
                            {formatVnd(session.price)}
                          </span>
                          {isFull ? (
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full inline-flex h-9.5 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer text-center"
                            >
                              Xem sân khác
                            </button>
                          ) : (
                            <Link
                              href={user ? `/player/booking?sessionId=${session.id}&mode=solo` : loginUrl()}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full inline-flex h-9.5 items-center justify-center rounded-xl bg-red-800 hover:bg-red-950 px-5 text-xs font-bold text-white transition shadow-xs cursor-pointer text-center whitespace-nowrap"
                            >
                              Tham gia ngay
                            </Link>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {session.players.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedPlayerProfile(p);
                                }}
                                className="rounded-full focus:outline-none focus:ring-2 focus:ring-red-800/30"
                                title={`Xem profile ${p.name}`}
                              >
                                {p.avatar ? (
                                  <img
                                    src={p.avatar}
                                    alt={p.name}
                                    className="inline-block h-6.5 w-6.5 rounded-full ring-2 ring-white object-cover"
                                  />
                                ) : (
                                  <span className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-600 ring-2 ring-white">
                                    {avatarInitials(p.name)}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                            {session.joinedCountText}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Sidebar stats and advice OR Match details */}
          <div className="space-y-6">
            {selectedSessionId && selectedSession ? (
              /* Panel Chi tiết trận đấu */
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col gap-4">
                {/* Header: Title & Close Button */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="font-heading font-bold text-slate-900 text-sm sm:text-base">Chi tiết trận đấu</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedSessionId(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer text-sm font-bold"
                    aria-label="Đóng chi tiết"
                  >
                    ✕
                  </button>
                </div>

                {/* Court Image with Index and Badge */}
                <div className="relative h-44 w-full rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  <img
                    src={sessionImage(selectedSession)}
                    alt={selectedSession.courtName}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 font-extrabold text-white text-sm backdrop-blur-xs">
                    {selectedSession.index}
                  </div>
                  {selectedSession.isMostSuitable && (
                    <div className="absolute bottom-3 left-3 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                      Phù hợp nhất
                    </div>
                  )}
                </div>

                {/* Name & Complex */}
                <div>
                  <h4 className="font-heading text-xl font-bold text-slate-900 leading-tight">
                    {selectedSession.courtName}
                  </h4>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedSession.complexName}</p>
                  
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a8 8 0 00-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 00-8-8z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{selectedSession.address}</span>
                  </p>
                </div>

                {/* Tags: Sport, Distance, Parking */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600 border-b border-slate-100 pb-3">
                  <span className="flex items-center gap-1.5">
                    <span>{getSportIcon(selectedSession.sport)}</span>
                    {selectedSession.sport}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                      <line x1="9" y1="3" x2="9" y2="18" />
                      <line x1="15" y1="6" x2="15" y2="21" />
                    </svg>
                    {selectedSession.distance}
                  </span>
                  {selectedSession.hasParking && (
                    <span className="flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="2" x2="12" y2="12" />
                        <line x1="12" y1="12" x2="8" y2="18" />
                        <line x1="12" y1="12" x2="16" y2="18" />
                      </svg>
                      Có chỗ gửi xe
                    </span>
                  )}
                </div>

                {/* Detailed Information Grid */}
                <div className="space-y-3.5 py-1">
                  {/* Row 1: Thời gian */}
                  <div className="flex items-start gap-3 text-xs">
                    <div className="mt-0.5 text-slate-400 shrink-0">
                      {/* Hourglass */}
                      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 2h14M5 22h14M19 2v4a7 7 0 01-7 7v0a7 7 0 01-7-7V2M5 22v-4a7 7 0 017-7v0a7 7 0 017 7v4" />
                        <path d="M12 7v0M12 17v0" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-500">Thời gian</p>
                      <p className="font-bold text-slate-800 text-sm mt-0.5">
                        {selectedSession.time} <span className="font-normal text-slate-400 mx-1">|</span> {matchDate}
                      </p>
                    </div>
                  </div>

                  {/* Row 2: Số lượng */}
                  <div className="flex items-start gap-3 text-xs">
                    <div className="mt-0.5 text-slate-400 shrink-0">
                      {/* Connected Nodes */}
                      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="6" cy="6" r="2" />
                        <circle cx="18" cy="6" r="2" />
                        <circle cx="18" cy="18" r="2" />
                        <circle cx="6" cy="18" r="2" />
                        <line x1="6" y1="6" x2="9.5" y2="9.5" />
                        <line x1="18" y1="6" x2="14.5" y2="9.5" />
                        <line x1="18" y1="18" x2="14.5" y2="14.5" />
                        <line x1="6" y1="18" x2="9.5" y2="14.5" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-500">Số lượng</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-slate-800 text-sm">
                          {selectedSession.slotsJoined} / {selectedSession.slotsMax} người
                        </span>
                        {(() => {
                          const isFull = selectedSession.slotsJoined === selectedSession.slotsMax;
                          const isNearFull = selectedSession.slotsJoined === selectedSession.slotsMax - 1;
                          let badgeColor = "bg-green-50 text-green-700 border-green-200";
                          let badgeText = `Thiếu ${selectedSession.slotsMax - selectedSession.slotsJoined} người`;
                          if (isFull) {
                            badgeColor = "bg-red-50 text-red-700 border-red-200";
                            badgeText = "Đã đủ người";
                          } else if (isNearFull) {
                            badgeColor = "bg-orange-50 text-orange-700 border-orange-200";
                            badgeText = "Chỉ còn 1 chỗ";
                          }
                          return (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                              {badgeText}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Trình độ */}
                  <div className="flex items-start gap-3 text-xs">
                    <div className="mt-0.5 text-slate-400 shrink-0">
                      {/* Diamond Radar Chart */}
                      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 12l10 10 10-10L12 2z" />
                        <path d="M12 6l-6 6 6 6 6-6-6-6z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-500">Trình độ</p>
                      <p className={`font-bold text-sm mt-0.5 ${
                        selectedSession.levelStatus === "suitable" ? "text-emerald-700" : "text-amber-700"
                      }`}>
                        {selectedSession.levelText}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Hệ thống AI đã cân bằng trình độ trong trận</p>
                    </div>
                  </div>

                  {/* Row 4: Phí tham gia */}
                  <div className="flex items-start gap-3 text-xs border-b border-slate-100 pb-4">
                    <div className="mt-0.5 text-slate-400 shrink-0">
                      {/* Price Tag */}
                      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                        <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-500">Phí tham gia</p>
                      <p className="font-extrabold text-[#b00c14] text-base mt-0.5">
                        {formatVnd(selectedSession.price)} <span className="text-xs font-normal text-slate-400">/ người</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Additional Information Notice */}
                <div className="rounded-xl bg-blue-50/60 border border-blue-100/80 p-3.5 text-xs text-blue-800 flex items-start gap-2.5">
                  <span className="text-sm shrink-0 mt-0.5">ℹ️</span>
                  <p className="leading-relaxed">
                    <span className="font-bold">Thông tin thêm:</span> Đến sớm 10-15 phút để khởi động và làm quen với các thành viên nhé!
                  </p>
                </div>

                {/* Joined Players */}
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-700">Những người đã tham gia</p>
                  {selectedSession.players.length === 0 ? (
                    <p className="text-xs font-semibold text-slate-500">{selectedSession.joinedCountText}</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedSession.players.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPlayerProfile(p)}
                          className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2 text-left transition hover:bg-slate-50"
                        >
                          {p.avatar ? (
                            <img
                              src={p.avatar}
                              alt={p.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black text-slate-600">
                              {avatarInitials(p.name)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-slate-900">{p.name}</span>
                            <span className="block truncate text-[10px] font-semibold text-slate-500">
                              {playerSkillLabel(p.visible_skill_tier)} · ELO {p.elo_value ?? 1000}
                            </span>
                          </span>
                          <span className="text-[10px] font-bold text-red-800">Profile</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-2 space-y-2">
                  {selectedSession.slotsJoined === selectedSession.slotsMax ? (
                    <button
                      type="button"
                      className="w-full inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer text-center"
                    >
                      Xem sân khác
                    </button>
                  ) : (
                    <Link
                      href={user ? `/player/booking?sessionId=${selectedSession.id}&mode=solo` : loginUrl()}
                      className="w-full inline-flex h-11 items-center justify-center rounded-xl bg-[#b00c14] hover:bg-red-950 px-5 text-sm font-bold text-white transition shadow-sm cursor-pointer text-center whitespace-nowrap"
                    >
                      Tham gia ngay
                    </Link>
                  )}
                  <p className="text-[10px] text-slate-400 text-center font-medium">Bạn sẽ thanh toán ở bước tiếp theo</p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Lightbulb className="text-emerald-700 h-5 w-5" />
                    <h3 className="font-heading font-bold text-slate-900 text-sm sm:text-base">Lời khuyên cho bạn</h3>
                  </div>
                  <div className="mt-4 space-y-4">
                    <div className="flex gap-3 text-xs">
                      <div className="h-7 w-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-sm">
                        <Check className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">
                          {bestMatch ? `${bestMatch.courtName} phù hợp nhất` : "Chưa có đề xuất phù hợp"}
                        </p>
                        <p className="mt-0.5 text-slate-500 leading-relaxed">
                          {bestMatch
                            ? `${bestMatch.complexName} đang có ${bestMatch.open_slots} slot trống theo dữ liệu hiện tại.`
                            : "Thử mở rộng bộ lọc hoặc bật ghép mọi trình độ để xem thêm phòng."}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 text-xs">
                      <div className="h-7 w-7 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 font-bold text-sm">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">Khung giờ đang mở</p>
                        <p className="mt-0.5 text-slate-500 leading-relaxed">
                          {busiestTime} là khung giờ nổi bật trong danh sách đang hiển thị.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 text-xs">
                      <div className="h-7 w-7 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 font-bold text-sm">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">Slot còn trống</p>
                        <p className="mt-0.5 text-slate-500 leading-relaxed">
                          Có {matchmakingOpenSlots} slot đang mở trong các phòng ghép phù hợp bộ lọc.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <h3 className="font-heading font-bold text-slate-900 text-sm sm:text-base pb-3 border-b border-slate-100">
                    Thống kê nhanh
                  </h3>
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-red-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20v-8M17 20V8M7 20v-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="font-semibold text-slate-600">Trình độ của bạn</span>
                      </div>
                      <div className="text-right leading-tight">
                        <p className="font-bold text-slate-900">{skillTier?.visible_skill_tier ?? "Chưa đánh giá"}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{userTierLabel}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                          <polyline points="17 6 23 6 23 12" />
                        </svg>
                        <span className="font-semibold text-slate-600">Phòng phù hợp</span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">{visibleMatchmakingSessions.length}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-orange-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span className="font-semibold text-slate-600">Người đã giữ slot</span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">{visibleMatchedPlayers}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom AI explanation banner */}
        <div className="bg-red-50/40 border border-red-100 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-4 shadow-2xs">
          <div className="h-10 w-10 rounded-xl bg-red-100 text-red-800 flex items-center justify-center shrink-0 text-xl font-bold">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h4 className="font-heading font-bold text-slate-900 text-sm sm:text-base">Ghép đối thủ thông minh</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Chúng tôi sử dụng AI để phân tích trình độ, lịch sử trận, vị trí và thói quen chơi để đề xuất những trận đấu phù hợp nhất với bạn.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-3xs ring-1 ring-slate-100">
              <Scale className="h-3.5 w-3.5" /> Trình độ cân bằng
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-3xs ring-1 ring-slate-100">
              <Handshake className="h-3.5 w-3.5" /> Cộng đồng văn minh
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-3xs ring-1 ring-slate-100">
              <ShieldCheck className="h-3.5 w-3.5" /> Trải nghiệm an toàn
            </span>
          </div>
        </div>

        {selectedPlayerProfile && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setSelectedPlayerProfile(null)} />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  {selectedPlayerProfile.avatar_url ? (
                    <img
                      src={selectedPlayerProfile.avatar_url}
                      alt={selectedPlayerProfile.full_name}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-lg font-black text-red-800">
                      {avatarInitials(selectedPlayerProfile.full_name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-lg font-bold text-slate-950">
                      {selectedPlayerProfile.full_name}
                    </h3>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {[selectedPlayerProfile.district, selectedPlayerProfile.city].filter(Boolean).join(", ") || "Chưa cập nhật khu vực"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlayerProfile(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Đóng profile"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ELO</p>
                  <p className="mt-1 font-heading text-xl font-black text-slate-950">
                    {selectedPlayerProfile.elo_value ?? 1000}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Level</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {playerSkillLabel(selectedPlayerProfile.visible_skill_tier)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Trận</p>
                  <p className="mt-1 font-heading text-xl font-black text-slate-950">
                    {selectedPlayerProfile.matches_played ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-semibold text-slate-500">Thắng</span>
                  <span className="font-bold text-emerald-700">{selectedPlayerProfile.wins ?? 0}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-semibold text-slate-500">Thua</span>
                  <span className="font-bold text-red-700">{selectedPlayerProfile.losses ?? 0}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="font-semibold text-slate-500">Hòa</span>
                  <span className="font-bold text-slate-700">{selectedPlayerProfile.draws ?? 0}</span>
                </div>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Profile này chỉ hiển thị thông tin công khai trong phòng ghép slot.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render method for Booking layout (isBookingMode = true)
  function renderBookingLayout() {
    return (
      <div className="space-y-6">
        {/* Banner Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-500/10 via-pink-500/5 to-white p-6 sm:p-8 border border-red-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 space-y-2">
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.15em] text-[#b00c14]">ĐẶT SÂN NHANH CHÓNG</span>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
              Tìm sân phù hợp, <span className="text-[#b00c14]">đặt lịch dễ dàng</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
              Tìm kiếm theo môn thể thao, khu vực, khung giờ và đặt sân chỉ trong vài giây.
            </p>
          </div>
          {/* Decorative Badminton SVG */}
          <div className="hidden md:block w-32 h-20 relative opacity-85 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full text-[#b00c14]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="50" cy="50" r="24" strokeDasharray="3 3" />
              <path d="M40 35l25 25M35 40l25 25" strokeWidth="1" />
              <circle cx="65" cy="65" r="8" fill="currentColor" className="text-red-100" />
            </svg>
          </div>
        </div>

        {/* Search & Filter Box */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/60 shadow-md space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.1fr_1.1fr_auto_auto]">
            {/* Sport selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Môn thể thao</span>
              <select
                className={`${inputClassName} text-xs font-semibold py-2`}
                value={sport}
                onChange={(e) => setSport(e.target.value as SportFilter)}
              >
                {sportOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            {/* Location selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Khu vực</span>
              <select
                className={`${inputClassName} text-xs font-semibold py-2`}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {/* Date selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Ngày</span>
              <select
                className={`${inputClassName} text-xs font-semibold py-2`}
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
              >
                {dateOptions.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Time selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Khung giờ</span>
              <select
                className={`${inputClassName} text-xs font-semibold py-2`}
                value={matchTime}
                onChange={(e) => setMatchTime(e.target.value)}
              >
                {timeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Advanced Filters Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex h-9.5 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-505 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Bộ lọc
              </button>
            </div>

            {/* Search/Reload Button */}
            <div className="flex items-end">
              <button
                onClick={() => void loadDiscovery()}
                disabled={isLoading}
                className="w-full flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-red-800 hover:bg-red-900 px-4 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? "Đang tìm..." : "Tìm sân"}
              </button>
            </div>
          </div>

          {/* Quick Filters Capsules */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => { setSport(""); setLocation("Tất cả khu vực"); setMatchDate("Tất cả ngày"); setMatchTime("Tất cả khung giờ"); setCourtType("Tất cả sân"); setSearch(""); }}
              className="flex items-center px-3.5 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tất cả sân
            </button>
            <Link
              href="/player/bookings/"
              className="flex items-center px-3.5 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
            >
              <CalendarCheck className="mr-1.5 h-3.5 w-3.5" /> Sân đã đặt
            </Link>
            <button
              onClick={() => setActiveTab(activeTab === "favorites" ? "map" : "favorites")}
              className={`flex items-center px-3.5 py-1.5 rounded-full border transition cursor-pointer font-semibold text-xs ${
                activeTab === "favorites"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Heart className={`mr-1.5 h-3.5 w-3.5 ${activeTab === "favorites" ? "fill-rose-700" : ""}`} /> Sân yêu thích
            </button>
            <button
              onClick={() => setCourtType(courtType === "Sân ngoài trời" ? "Tất cả sân" : "Sân ngoài trời")}
              className={`flex items-center px-3.5 py-1.5 rounded-full border transition cursor-pointer font-semibold text-xs ${
                courtType === "Sân ngoài trời"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Car className="mr-1.5 h-3.5 w-3.5" /> Có gửi xe
            </button>
            <button
              onClick={() => setCourtType(courtType === "Sân trong nhà" ? "Tất cả sân" : "Sân trong nhà")}
              className={`flex items-center px-3.5 py-1.5 rounded-full border transition cursor-pointer font-semibold text-xs ${
                courtType === "Sân trong nhà"
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Snowflake className="mr-1.5 h-3.5 w-3.5" /> Sân điều hòa
            </button>
          </div>
        </div>

        {/* 2-Column Content Layout */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
          
          {/* LEFT COLUMN: Court List */}
          <div className="space-y-4">
            {/* Header Tabs */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveBookingTab("all")}
                  className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                    activeBookingTab === "all" ? "border-red-800 text-red-800" : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Tất cả sân ({groupedCourts.length})
                </button>
                <button
                  onClick={() => setActiveBookingTab("empty")}
                  className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                    activeBookingTab === "empty" ? "border-red-800 text-red-800" : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Còn trống ({groupedCourts.filter(c => c.slots.some(s => s.openSlots > 0)).length})
                </button>
                <button
                  onClick={() => setActiveBookingTab("near")}
                  className={`px-4 py-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                    activeBookingTab === "near" ? "border-red-800 text-red-800" : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Gần bạn nhất
                </button>
              </div>

              {/* Sort selector */}
              <div className="text-xs text-slate-505">
                <span className="font-semibold text-slate-800">Sắp xếp:</span> Gần nhất
              </div>
            </div>

            {/* List items */}
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-3xs">
                <p className="text-base font-semibold">Đang tải danh sách sân...</p>
              </div>
            ) : filteredGroupedCourts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-3xs">
                <p className="text-base font-semibold">Không tìm thấy cụm sân nào phù hợp</p>
                <p className="text-xs text-slate-400 mt-1">Hãy thử tìm kiếm với từ khóa khác hoặc thay đổi bộ lọc.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredGroupedCourts.map((court, idx) => {
                  const courtKey = `${court.complexName}-${court.subCourtName}`;
                  const selectedSessionIdsForCourt = selectedSlots[courtKey] || [];
                  
                  // Total slots empty check
                  const emptySlotsCount = court.slots.filter(s => s.openSlots > 0).length;
                  const isAnyEmpty = emptySlotsCount > 0;
                  
                  return (
                    <article
                      key={courtKey}
                      onClick={() => setSelectedCourtKey(courtKey)}
                      className={`group relative overflow-hidden rounded-2xl border p-4.5 shadow-2xs hover:shadow-md transition duration-205 flex flex-col sm:flex-row gap-4 items-stretch cursor-pointer ${
                        selectedCourtKey === courtKey ? "border-red-800 bg-slate-50/20" : "border-slate-200 bg-white"
                      }`}
                    >
                      {/* Left: Court Image */}
                      <div className="relative h-36 w-full sm:w-48 shrink-0 rounded-xl overflow-hidden bg-slate-100">
                        <img
                          src={court.imageUrl}
                          alt={court.courtName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
                        />
                        {/* Status Badge */}
                        <div className={`absolute top-3 left-3 px-2 py-0.5 rounded-md font-bold text-[10px] text-white shadow-xs ${
                          isAnyEmpty ? "bg-emerald-600" : "bg-orange-500"
                        }`}>
                          {isAnyEmpty ? "Còn trống" : "Sắp hết chỗ"}
                        </div>
                        {/* Heart Favorite button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(court.id);
                          }}
                          className={`absolute top-2.5 right-2.5 flex h-7.5 w-7.5 items-center justify-center rounded-lg border transition shadow-xs ${
                            favorites.includes(court.id)
                              ? "border-rose-200 bg-rose-50 text-rose-600"
                              : "border-slate-200/50 bg-white/90 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          } cursor-pointer`}
                        >
                          ♥
                        </button>
                      </div>

                      {/* Middle: Details & Time Slots */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-heading text-lg font-bold text-slate-900 truncate leading-snug">
                              {court.complexName} ({court.subCourtName})
                            </h3>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-505 font-medium">
                            <span className="flex items-center gap-1 font-bold text-amber-500">★ {court.rating}</span>
                            <span>•</span>
                            <span>{court.distance}</span>
                            <span>•</span>
                            <span className="truncate">{court.address}</span>
                          </div>

                          {/* Time Slots Button Grid */}
                          <div className={`mt-4 space-y-1.5 transition-all duration-300 ${selectedCourtKey === courtKey ? 'animate-in slide-in-from-top-2 fade-in' : ''}`}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Khung giờ trống hôm nay {selectedCourtKey === courtKey && `(Tối thiểu ${court.minRentalDurationMinutes} phút)`}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {(selectedCourtKey === courtKey ? court.slots : court.slots.slice(0, 5)).map((slot) => {
                                const isSelected = selectedSessionIdsForCourt.includes(slot.sessionId);
                                const isBooked = slot.openSlots === 0 || slot.status === "cancelled";
                                const isPast = new Date(slot.startsAt).getTime() < Date.now();
                                const isDisabled = isBooked || isPast;
                                return (
                                  <button
                                    key={slot.sessionId}
                                    type="button"
                                    title={isDisabled ? (isPast ? "Đã qua giờ" : slot.status === "cancelled" ? "Đã khóa" : "Đã có người đặt trước") : ""}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isDisabled) return;
                                      
                                      if (selectedCourtKey !== courtKey) {
                                        setSelectedCourtKey(courtKey);
                                      }
                                      setSelectedSlots(prev => {
                                        const arr = prev[courtKey] || [];
                                        const sortedIndices = arr.map(id => court.slots.findIndex(s => s.sessionId === id)).sort((a,b) => a - b);
                                        const slotIndex = court.slots.findIndex(s => s.sessionId === slot.sessionId);

                                        if (arr.includes(slot.sessionId)) {
                                          if (arr.length > 1 && slotIndex !== sortedIndices[0] && slotIndex !== sortedIndices[sortedIndices.length - 1]) {
                                            alert("Vui lòng bỏ chọn các khung giờ ở hai đầu trước.");
                                            return prev;
                                          }
                                          return { ...prev, [courtKey]: arr.filter(id => id !== slot.sessionId) };
                                        } else {
                                          if (arr.length > 0 && slotIndex !== sortedIndices[0] - 1 && slotIndex !== sortedIndices[sortedIndices.length - 1] + 1) {
                                            alert("Vui lòng chọn các khung giờ liên tiếp.");
                                            return prev;
                                          }
                                          return { ...prev, [courtKey]: [...arr, slot.sessionId] };
                                        }
                                      });
                                    }}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition border ${
                                      isDisabled
                                        ? "bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-60"
                                        : isSelected
                                        ? "bg-red-50 text-[#b00c14] border-red-200 shadow-3xs cursor-pointer"
                                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer"
                                    }`}
                                  >
                                    {slot.timeLabel}
                                  </button>
                                );
                              })}
                              {selectedCourtKey !== courtKey && court.slots.length > 5 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCourtKey(courtKey);
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition border border-slate-200 bg-slate-50 text-slate-500 cursor-pointer hover:bg-slate-100"
                                >
                                  +{court.slots.length - 5}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Amenities Tags (Always visible like in the image) */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-400 mt-4 pt-3 border-t border-slate-100">
                          <span className="flex items-center gap-1">🏓 {court.sport}</span>
                          <span>•</span>
                          <span>Có gửi xe</span>
                          <span>•</span>
                          <span>WC</span>
                          {court.amenities.includes("AirCond") && (
                            <>
                              <span>•</span>
                              <span>Điều hòa</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Price and CTA Button */}
                      <div className="w-full sm:w-36 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3.5 sm:pt-0 sm:pl-4 flex flex-col justify-between items-stretch sm:items-end py-0.5">
                        <div className="text-left sm:text-right flex items-center sm:items-end justify-between sm:flex-col sm:justify-start w-full">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase hidden sm:block">Giá thuê</p>
                            <p className="font-heading text-lg font-black text-slate-900 leading-snug mt-0 sm:mt-1">
                              {formatVnd(court.basePrice)}
                              <span className="text-[11px] font-semibold text-slate-400">/giờ</span>
                            </p>
                            <p className="text-[10px] text-emerald-700 font-bold mt-1 hidden sm:block">✓ Còn trống</p>
                          </div>
                          
                          {/* Caret indicating expansion state */}
                          <div className="sm:hidden text-slate-400">
                            <svg className={`h-5 w-5 transition-transform duration-300 ${selectedCourtKey === courtKey ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>

                        {selectedCourtKey === courtKey ? (
                          <Link
                            href={user ? `/player/booking?sessionIds=${selectedSessionIdsForCourt.join(",")}&mode=full_court` : loginUrl()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedSessionIdsForCourt.length === 0) {
                                e.preventDefault();
                                alert(`Vui lòng chọn khung giờ để đặt. Thời gian tối thiểu là ${court.minRentalDurationMinutes} phút.`);
                              } else if (selectedSessionIdsForCourt.length * 30 < court.minRentalDurationMinutes) {
                                e.preventDefault();
                                alert(`Bạn cần chọn thời gian tối thiểu là ${court.minRentalDurationMinutes} phút.`);
                              }
                            }}
                            className={`mt-3 w-full inline-flex h-9 items-center justify-center rounded-xl font-bold transition shadow-xs cursor-pointer text-center whitespace-nowrap text-xs ${
                              selectedSessionIdsForCourt.length * 30 >= court.minRentalDurationMinutes
                                ? "bg-red-800 hover:bg-red-900 text-white"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            <CalendarCheck className="w-3.5 h-3.5 mr-1.5" />
                            Đặt sân
                          </Link>
                        ) : (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCourtKey(courtKey);
                            }}
                            className="mt-3 w-full hidden sm:inline-flex h-9 items-center justify-center rounded-xl font-bold transition shadow-xs cursor-pointer text-center whitespace-nowrap text-xs bg-[#b00c14] hover:bg-red-900 text-white"
                          >
                            <CalendarCheck className="w-3.5 h-3.5 mr-1.5" />
                            Đặt sân
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            
            {/* Show More Button */}
            {filteredGroupedCourts.length > 0 && (
              <div className="pt-2 text-center">
                <button className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-700 transition cursor-pointer shadow-3xs">
                  Xem thêm sân ➔
                </button>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Interactive Mock Map */}
          <div className="relative">
            <div className="sticky top-20 rounded-3xl border border-slate-200/80 bg-[#f4f6f7] overflow-hidden shadow-sm h-[560px] flex flex-col justify-between p-4">
              
              {/* Virtual Map Header (Search address overlay) */}
              <div className="absolute top-4 left-4 right-4 z-20 flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">⌕</span>
                  <input
                    type="text"
                    placeholder="Tìm kiếm khi di chuyển bản đồ"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium shadow-md focus:outline-none"
                  />
                </div>
                <button className="h-8 w-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-md shrink-0 cursor-pointer">
                  ⚙️
                </button>
              </div>

              {/* SVG Virtual Map Graphics */}
              <div className="absolute inset-0 z-10 w-full h-full">
                <svg className="w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
                  {/* Background base */}
                  <rect width="400" height="400" fill="#e8eaed" />
                  
                  {/* Green spaces (Parks, CNC zone) */}
                  <path d="M 50 80 Q 120 40 180 80 T 320 60 L 380 150 L 250 220 Z" fill="#d7ecc9" opacity="0.8" />
                  <path d="M 20 250 Q 80 200 120 280 T 260 300 L 280 390 L 10 390 Z" fill="#d7ecc9" opacity="0.8" />
                  
                  {/* Roads / Streets */}
                  <path d="M 0 100 L 400 130" stroke="#ffffff" strokeWidth="12" fill="none" />
                  <path d="M 0 100 L 400 130" stroke="#e0e0e0" strokeWidth="8" fill="none" />

                  <path d="M 120 0 L 160 400" stroke="#ffffff" strokeWidth="12" fill="none" />
                  <path d="M 120 0 L 160 400" stroke="#e0e0e0" strokeWidth="8" fill="none" />

                  <path d="M 50 400 C 150 250 200 150 350 0" stroke="#ffffff" strokeWidth="10" fill="none" strokeDasharray="3 3" />
                  
                  {/* Map Text Labels */}
                  <text x="240" y="240" fill="#78909c" fontSize="11" fontWeight="bold" fontFamily="sans-serif" opacity="0.8">HÒA LẠC</text>
                  <text x="50" y="320" fill="#90a4ae" fontSize="8" fontWeight="bold" fontFamily="sans-serif" opacity="0.7">Khu Công nghệ</text>
                  <text x="50" y="332" fill="#90a4ae" fontSize="8" fontWeight="bold" fontFamily="sans-serif" opacity="0.7">cao Hòa Lạc</text>

                  {/* Draw Court Location Pins dynamically */}
                  {filteredGroupedCourts.map((court, index) => {
                    const coords = getPinCoords(index);
                    const courtKey = `${court.complexName}-${court.subCourtName}`;
                    const isActive = activeCourt && `${activeCourt.complexName}-${activeCourt.subCourtName}` === courtKey;
                    
                    return (
                      <g
                        key={courtKey}
                        className="cursor-pointer select-none"
                        onClick={() => setSelectedCourtKey(courtKey)}
                      >
                        {/* Marker Pin bubble shadow */}
                        <circle cx={coords.x * 4} cy={coords.y * 4} r={isActive ? 16 : 13} fill="black" opacity="0.1" transform="translate(0, 2)" />
                        
                        {/* Marker Pin body */}
                        <path
                          d={`M ${coords.x * 4} ${coords.y * 4 + 12} L ${coords.x * 4 - 4} ${coords.y * 4 + 6} A 8 8 0 1 1 ${coords.x * 4 + 4} ${coords.y * 4 + 6} Z`}
                          fill={isActive ? "#b00c14" : "#ffffff"}
                          stroke={isActive ? "#ffffff" : "#b00c14"}
                          strokeWidth="1.5"
                        />
                        
                        {/* Price Tag Overlay */}
                        <rect
                          x={coords.x * 4 - 18}
                          y={coords.y * 4 - 20}
                          width="36"
                          height="14"
                          rx="4"
                          fill={isActive ? "#b00c14" : "#ffffff"}
                          stroke={isActive ? "#ffffff" : "#b00c14"}
                          strokeWidth="1.2"
                          shadow-xs="true"
                        />
                        <text
                          x={coords.x * 4}
                          y={coords.y * 4 - 10}
                          fill={isActive ? "#ffffff" : "#334155"}
                          fontSize="8"
                          fontWeight="bold"
                          textAnchor="middle"
                          fontFamily="sans-serif"
                        >
                          {Math.round(court.basePrice / 1000)}K
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Map Zoom Controls */}
              <div className="absolute right-4 bottom-32 z-20 flex flex-col gap-1.5">
                <button className="h-7 w-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-md font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">+</button>
                <button className="h-7 w-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-md font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">-</button>
                <button className="h-7 w-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-md text-red-650 hover:bg-slate-50 cursor-pointer mt-1">⌖</button>
              </div>

              {/* Floating Bottom Card Preview for Active Court Complex */}
              {activeCourt && (
                <div className="absolute bottom-4 left-4 right-4 z-20 bg-white rounded-2xl border border-slate-100 p-3 shadow-2xl flex gap-3 items-center animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <img
                    src={activeCourt.imageUrl}
                    alt={activeCourt.courtName}
                    className="h-15 w-18 rounded-lg object-cover shrink-0 bg-slate-50"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-slate-900 text-xs truncate leading-snug">{activeCourt.complexName}</h4>
                    <p className="text-[10px] text-amber-500 font-semibold mt-0.5">★ {activeCourt.rating} <span className="text-slate-400 font-normal">({activeCourt.distance})</span></p>
                    <p className="text-xs font-extrabold text-[#b00c14] mt-1">{formatVnd(activeCourt.basePrice)}<span className="text-[10px] text-slate-400 font-normal">/giờ</span></p>
                  </div>
                  
                  {/* Chevron Button Link to Booking Page */}
                  <Link
                    href={user ? `/player/booking?sessionIds=${(selectedSlots[`${activeCourt.complexName}-${activeCourt.subCourtName}`] || []).join(",")}&mode=full_court` : loginUrl()}
                    onClick={(e) => {
                      const slots = selectedSlots[`${activeCourt.complexName}-${activeCourt.subCourtName}`] || [];
                      if (slots.length === 0) {
                        e.preventDefault();
                        alert("Vui lòng chọn ít nhất 1 khung giờ");
                      }
                    }}
                    className="h-8 w-8 rounded-full bg-slate-50 hover:bg-red-50 hover:text-red-700 transition flex items-center justify-center shrink-0 border border-slate-100 cursor-pointer text-slate-700 font-bold"
                  >
                    ➔
                  </Link>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    );
  }

  // DEFAULT BOOKING MARKETPLACE LAYOUT FALLBACK
  return isBookingMode ? renderBookingLayout() : (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-slate-500">
        Để xem danh sách đặt sân nâng cao, vui lòng truy cập đường dẫn booking.
      </p>
    </div>
  );
}


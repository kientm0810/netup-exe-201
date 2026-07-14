"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

import { Button } from "@/components/ui";
import { avatarInitials } from "@/lib/avatar";

export type UserProfile = {
  email: string;
  full_name: string;
  roles: string[];
  avatar_url?: string | null;
};

function loginUrl() {
  return "/login/";
}

type HeaderUserAuthProps = {
  user: UserProfile | null;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
  onProfileUpdated?: () => void;
};

export function HeaderUserAuth({ user, logout, isLoggingOut }: HeaderUserAuthProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Avatar error states to toggle fallback initials
  const [avatarError, setAvatarError] = useState(false);
  const [dropdownAvatarError, setDropdownAvatarError] = useState(false);

  // Reset errors on user profile change
  useEffect(() => {
    setAvatarError(false);
    setDropdownAvatarError(false);
  }, [user?.avatar_url]);

  const initials = avatarInitials(user?.full_name, "U");

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (user) {
    return (
      <div className="relative flex items-center gap-3" ref={dropdownRef}>
        {/* Avatar Trigger (With gradient ring) */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="p-[2.5px] bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 rounded-full hover:scale-105 transition duration-200 focus:outline-none cursor-pointer shadow-sm active:scale-95"
        >
          <div className="bg-white rounded-full p-[1.5px]">
            {user.avatar_url && !avatarError ? (
              <img 
                src={user.avatar_url} 
                alt={user.full_name} 
                className="h-8.5 w-8.5 rounded-full object-cover" 
                onError={() => setAvatarError(true)}
              />
            ) : (
              <span className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-800 animate-fade-in">
                {initials}
              </span>
            )}
          </div>
        </button>

        {/* Dropdown Menu (Premium styled) */}
        {isDropdownOpen && (
          <div className="absolute right-0 top-15 z-50 w-[290px] rounded-[22px] border border-slate-100/90 bg-white p-3.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] animate-in fade-in slide-in-from-top-3 duration-200 select-none">
            {/* Profile Brief Header inside Dropdown */}
            <div className="flex items-center justify-between px-1.5 py-2 pb-3.5">
              <div className="min-w-0 flex-1 pr-3">
                <h4 className="truncate text-[15px] font-bold text-slate-900 leading-snug">{user.full_name}</h4>
                <p className="truncate text-xs text-slate-400 font-medium leading-none mt-0.5">{user.email}</p>
              </div>
              <div className="p-[2px] bg-gradient-to-tr from-amber-500 via-rose-500 to-violet-600 rounded-full shrink-0 shadow-xs">
                <div className="bg-white rounded-full p-[1px]">
                  {user.avatar_url && !dropdownAvatarError ? (
                    <img 
                      src={user.avatar_url} 
                      alt={user.full_name} 
                      className="h-10.5 w-10.5 rounded-full object-cover" 
                      onError={() => setDropdownAvatarError(true)}
                    />
                  ) : (
                    <span className="flex h-10.5 w-10.5 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800 animate-fade-in">
                      {initials}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Links */}
            <div className="space-y-0.5">
              {/* Roles-based Dashboards (Admin / Owner Roles) - Đưa lên trên cùng */}
              {user.roles.includes("owner") && (
                <Link
                  href="/owner/dashboard/"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                      <rect width="7" height="9" x="3" y="3" rx="1" />
                      <rect width="7" height="5" x="14" y="3" rx="1" />
                      <rect width="7" height="9" x="14" y="12" rx="1" />
                      <rect width="7" height="5" x="3" y="16" rx="1" />
                    </svg>
                    <span>Kênh chủ sân (Owner)</span>
                  </div>
                  <span className="px-2 py-0.5 text-[9px] font-black text-rose-700 bg-rose-50 rounded-[4px] uppercase">Owner</span>
                </Link>
              )}

              {user.roles.includes("admin") && (
                <Link
                  href="/_internal/netup-admin/"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>Trang quản trị (Admin)</span>
                  </div>
                  <span className="px-2 py-0.5 text-[9px] font-black text-amber-700 bg-amber-50 rounded-[4px] uppercase">Admin</span>
                </Link>
              )}

              {(user.roles.includes("admin") || user.roles.includes("owner")) && (
                <div className="my-1.5 border-t border-slate-100/80" />
              )}

              {/* Profile Link (Selected state style) */}
              <Link
                href="/player/profile/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 bg-slate-100/80 hover:bg-slate-200/50 transition duration-150 text-slate-900 font-bold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5 text-slate-800 shrink-0">
                  <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.498 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.307 4.491 4.491 0 0 1-1.307-3.497A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                </svg>
                <span>Trang cá nhân (Profile)</span>
              </Link>

              {/* Booking của tôi Link */}
              <Link
                href="/player/bookings/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
                <span>Booking của tôi</span>
              </Link>

              {/* Hóa đơn của tôi Link */}
              <Link
                href="/player/bills/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                  <path d="M6 2h12a2 2 0 0 1 2 2v18l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2Z" />
                  <path d="M8 7h8M8 11h8M8 15h5" />
                </svg>
                <span>Hóa đơn của tôi</span>
              </Link>

              {/* Lịch thi đấu Link */}
              <Link
                href="/player/matches/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
                  <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Z" />
                </svg>
                <span>Lịch thi đấu của tôi</span>
              </Link>

              {/* Đánh giá kĩ năng AI Link */}
              <Link
                href="/player/assessment/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>Đánh giá kĩ năng AI</span>
              </Link>

              {/* Community Link */}
              <Link
                href="/player/tournaments/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <div className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Cộng đồng (Community)</span>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 font-semibold hover:bg-slate-200/80 transition text-xs cursor-pointer select-none">+</span>
              </Link>

              {/* Subscription Link */}
              <Link
                href="/player/profile/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <div className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                    <rect width="20" height="14" x="2" y="5" rx="2" />
                    <line x1="2" x2="22" y1="10" y2="10" />
                  </svg>
                  <span>Đăng ký (Subscription)</span>
                </div>
                <span className="px-2 py-0.5 text-[9px] font-black text-green-700 bg-green-50 rounded-[4px] uppercase tracking-wider">PRO</span>
              </Link>

              {/* Settings Link */}
              <Link
                href="/player/profile/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                  <rect width="20" height="12" x="2" y="6" rx="6" />
                  <circle cx="16" cy="12" r="3.2" fill="currentColor" className="text-slate-500" />
                </svg>
                <span>Cài đặt (Settings)</span>
              </Link>

              {/* Separator line */}
              <div className="my-1.5 border-t border-slate-100/80" />

              {/* Help Center Link */}
              <Link
                href="/contact/"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 hover:bg-slate-50 transition duration-150 text-slate-700 hover:text-slate-900 font-semibold text-[13px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-slate-500 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span>Trợ giúp (Help center)</span>
              </Link>

              {/* Sign Out Button */}
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  void logout();
                }}
                disabled={isLoggingOut}
                className="w-full flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-red-600 hover:bg-red-50/70 hover:text-red-700 transition duration-150 text-left font-bold text-[13px] cursor-pointer disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-red-500 shrink-0">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                <span>{isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất (Sign out)"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <a
      href={loginUrl()}
      className="inline-flex items-center justify-center rounded-xl bg-red-800 px-5 py-2 text-sm font-semibold text-white shadow-xs transition duration-200 hover:bg-red-900 shrink-0 cursor-pointer"
    >
      Đăng nhập
    </a>
  );
}

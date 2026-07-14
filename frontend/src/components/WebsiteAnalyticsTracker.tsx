"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { API_BASE_URL } from "@/lib/http";

const VISITOR_KEY = "netup_analytics_visitor_key";
const SESSION_KEY = "netup_analytics_session_key";
const LAST_ACTIVITY_KEY = "netup_analytics_last_activity";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function randomKey(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

function getOrCreateVisitorKey(): string {
  const current = window.localStorage.getItem(VISITOR_KEY);
  if (current) return current;

  const created = randomKey("visitor");
  window.localStorage.setItem(VISITOR_KEY, created);
  return created;
}

function getOrCreateSessionKey(now: number): string {
  const current = window.sessionStorage.getItem(SESSION_KEY);
  const lastActivity = Number(window.sessionStorage.getItem(LAST_ACTIVITY_KEY) ?? "0");
  const expired = !lastActivity || now - lastActivity > SESSION_TIMEOUT_MS;

  if (current && !expired) {
    window.sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    return current;
  }

  const created = randomKey("session");
  window.sessionStorage.setItem(SESSION_KEY, created);
  window.sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  return created;
}

export function WebsiteAnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/_internal/")) return;

    try {
      const now = Date.now();
      const visitorKey = getOrCreateVisitorKey();
      const sessionKey = getOrCreateSessionKey(now);

      void fetch(`${API_BASE_URL}/api/v1/public/analytics/visit`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_key: visitorKey,
          session_key: sessionKey,
          path: pathname,
        }),
      }).catch(() => undefined);
    } catch {
      // Analytics must never interrupt navigation when storage is unavailable.
    }
  }, [pathname]);

  return null;
}

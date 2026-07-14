/**
 * Builds the compact initials used by avatar fallbacks.
 *
 * Vietnamese names are commonly written as "Họ Đệm Tên", so the most useful
 * two-letter avatar is the first letter of the surname plus the first letter
 * of the given name: "Nguyễn Hương Lan" becomes "NL".
 */
export function avatarInitials(
  fullName: string | null | undefined,
  fallback = "?",
): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;

  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] ?? "" : "";
  return `${first}${last}`.toLocaleUpperCase("vi-VN") || fallback;
}

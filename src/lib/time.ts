export function parseHMS(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, h, m, s] = match.map(Number);
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

export function secondsToHMS(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function secondsToDays(total: number): string {
  const days = total / 86400;
  return days % 1 === 0 ? `${days} days` : `${days.toFixed(2)} days`;
}

/** Parse ISO 8601 duration (e.g. PT1H2M3S) into total seconds */
export function parseISO8601Duration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch {
    // not a valid URL
  }
  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { extractYouTubeId, parseISO8601Duration, secondsToHMS } from "@/lib/time";

type CachedResult = { duration: string; title: string };
const cache = new Map<string, CachedResult>();

// Rate limiter: max 20 requests per IP per minute
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
type RateEntry = { count: number; windowStart: number };
const rateLimiter = new Map<string, RateEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimiter.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

const VALID_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { url } = await req.json();

  const videoId = extractYouTubeId(url);
  if (!videoId || !VALID_VIDEO_ID.test(videoId)) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  if (cache.has(videoId)) {
    return NextResponse.json(cache.get(videoId));
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "YouTube API not configured" }, { status: 500 });
  }

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoId}&key=${apiKey}`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    return NextResponse.json({ error: "YouTube API error" }, { status: 502 });
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const result: CachedResult = {
    duration: secondsToHMS(parseISO8601Duration(item.contentDetails.duration)),
    title: item.snippet.title as string,
  };
  cache.set(videoId, result);
  return NextResponse.json(result);
}

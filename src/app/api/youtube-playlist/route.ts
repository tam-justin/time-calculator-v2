import { NextRequest } from "next/server";
import { parseISO8601Duration, secondsToHMS } from "@/lib/time";
import { isRateLimited } from "@/lib/rate-limit";
import { videoCache } from "@/lib/video-cache";

const VALID_PLAYLIST_ID = /^[a-zA-Z0-9_-]{10,64}$/;

function encode(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return new Response(encode({ type: "error", error: "Too many requests" }), { status: 429 });
  }

  const { playlistId } = await req.json();
  if (!playlistId || !VALID_PLAYLIST_ID.test(playlistId)) {
    return new Response(encode({ type: "error", error: "Invalid playlist ID" }), { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return new Response(encode({ type: "error", error: "YouTube API not configured" }), { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Fetch playlist title
        const playlistRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`
        );
        if (!playlistRes.ok) {
          controller.enqueue(encode({ type: "error", error: "YouTube API error" }));
          controller.close();
          return;
        }
        const playlistData = await playlistRes.json();
        if (!playlistData.items?.[0]) {
          controller.enqueue(encode({ type: "error", error: "Playlist not found" }));
          controller.close();
          return;
        }
        const playlistTitle = playlistData.items[0].snippet.title as string;

        // Paginate through playlist items
        const videoIds: string[] = [];
        let pageToken: string | undefined;
        let total = 0;

        do {
          const params = new URLSearchParams({
            part: "snippet",
            playlistId,
            maxResults: "50",
            key: apiKey,
            ...(pageToken ? { pageToken } : {}),
          });
          const itemsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
          );
          if (!itemsRes.ok) {
            controller.enqueue(encode({ type: "error", error: "YouTube API error" }));
            controller.close();
            return;
          }
          const itemsData = await itemsRes.json();

          if (total === 0) total = itemsData.pageInfo?.totalResults ?? 0;

          for (const item of itemsData.items ?? []) {
            if (item.snippet?.resourceId?.kind === "youtube#video") {
              videoIds.push(item.snippet.resourceId.videoId as string);
            }
          }

          controller.enqueue(encode({ type: "progress", loaded: videoIds.length, total }));
          pageToken = itemsData.nextPageToken;
        } while (pageToken);

        // Batch-fetch video details (50 per call), checking cache first
        const uncachedIds = videoIds.filter((id) => !videoCache.has(id));
        for (let i = 0; i < uncachedIds.length; i += 50) {
          const chunk = uncachedIds.slice(i, i + 50);
          const videosRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${chunk.join(",")}&key=${apiKey}`
          );
          if (!videosRes.ok) continue;
          const videosData = await videosRes.json();
          for (const item of videosData.items ?? []) {
            const seconds = parseISO8601Duration(item.contentDetails.duration);
            videoCache.set(item.id, {
              duration: secondsToHMS(seconds),
              title: item.snippet.title as string,
              seconds,
              thumbnail: (item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "") as string,
            });
          }
        }

        // Build final video list (only videos we have details for)
        const videos = videoIds
          .filter((id) => videoCache.has(id))
          .map((id) => ({ videoId: id, ...videoCache.get(id)! }));

        controller.enqueue(encode({ type: "complete", title: playlistTitle, videos }));
      } catch {
        controller.enqueue(encode({ type: "error", error: "Unexpected error" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

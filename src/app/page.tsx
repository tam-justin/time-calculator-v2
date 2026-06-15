"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  parseHMS,
  secondsToHMS,
  secondsToDays,
  extractYouTubePlaylistId,
  isPlaylistUrl,
} from "@/lib/time";

type ManualEntry = {
  id: string;
  label: string;
  duration: string;
  seconds: number;
  type: "manual";
};

type YoutubeEntry = {
  id: string;
  label: string;
  duration: string;
  seconds: number;
  type: "youtube";
  thumbnail: string;
};

type PlaylistVideoEntry = {
  id: string;
  label: string;
  duration: string;
  seconds: number;
  type: "playlist-video";
  thumbnail: string;
};

type PlaylistEntry = {
  id: string;
  label: string;
  duration: string;
  seconds: number;
  type: "playlist";
  playlistId: string;
  children: PlaylistVideoEntry[];
};

type Entry = ManualEntry | YoutubeEntry | PlaylistEntry;

type VisibleRow =
  | { kind: "flat"; entry: ManualEntry | YoutubeEntry }
  | { kind: "playlist-header"; entry: PlaylistEntry }
  | { kind: "playlist-child"; entry: PlaylistEntry; video: PlaylistVideoEntry };

type RenderRow = VisibleRow | { kind: "playlist-continuation"; entry: PlaylistEntry };

function buildVisibleRows(entries: Entry[], expanded: Set<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  for (const entry of entries) {
    if (entry.type === "playlist") {
      rows.push({ kind: "playlist-header", entry });
      if (expanded.has(entry.id)) {
        for (const video of entry.children) {
          rows.push({ kind: "playlist-child", entry, video });
        }
      }
    } else {
      rows.push({ kind: "flat", entry });
    }
  }
  return rows;
}

function buildRenderRows(pageRows: VisibleRow[]): RenderRow[] {
  const headersOnPage = new Set(
    pageRows.filter((r): r is Extract<VisibleRow, { kind: "playlist-header" }> => r.kind === "playlist-header")
      .map((r) => r.entry.id)
  );
  const continuationShown = new Set<string>();
  const result: RenderRow[] = [];
  for (const row of pageRows) {
    if (row.kind === "playlist-child" && !headersOnPage.has(row.entry.id) && !continuationShown.has(row.entry.id)) {
      continuationShown.add(row.entry.id);
      result.push({ kind: "playlist-continuation", entry: row.entry });
    }
    result.push(row);
  }
  return result;
}

function Thumbnail({ src, alt }: { src?: string; alt: string }) {
  return (
    <div className="relative w-[106px] h-[60px] shrink-0 rounded overflow-hidden bg-neutral-800">
      {src && (
        <Image src={src} alt={alt} fill className="object-cover" unoptimized />
      )}
    </div>
  );
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [youtubeError, setYoutubeError] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set());
  const [playlistProgress, setPlaylistProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [listPage, setListPage] = useState(0);
  const PAGE_SIZE = 10;
  const manualRef = useRef<HTMLInputElement>(null);
  const youtubeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("time-calculator-entries");
      if (stored) setEntries(JSON.parse(stored) as Entry[]);
    } catch {
      // corrupted storage — start fresh
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("time-calculator-entries", JSON.stringify(entries));
  }, [entries]);

  const totalSeconds = entries.reduce((sum, e) => sum + e.seconds, 0);

  const entryCount = entries.reduce(
    (sum, e) => sum + (e.type === "playlist" ? e.children.length : 1),
    0
  );

  function addManual() {
    const seconds = parseHMS(manualInput);
    if (seconds === null) {
      setManualError("Use format HH:MM:SS (e.g. 01:30:00)");
      manualRef.current?.focus();
      return;
    }
    setManualError("");
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: manualInput.trim(),
        duration: manualInput.trim(),
        seconds,
        type: "manual",
      },
    ]);
    setManualInput("");
    manualRef.current?.focus();
  }

  async function addYouTube() {
    const url = youtubeInput.trim();
    if (!url) {
      setYoutubeError("Paste a YouTube URL");
      youtubeRef.current?.focus();
      return;
    }
    if (isPlaylistUrl(url)) {
      await addPlaylist(url);
    } else {
      await addSingleVideo(url);
    }
  }

  async function addSingleVideo(url: string) {
    setYoutubeLoading(true);
    setYoutubeError("");
    try {
      const res = await fetch("/api/youtube-duration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setYoutubeError(data.error ?? "Something went wrong");
        return;
      }
      const seconds = parseHMS(data.duration) ?? 0;
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          label: data.title,
          duration: data.duration,
          seconds,
          type: "youtube",
          thumbnail: data.thumbnail ?? "",
        },
      ]);
      setYoutubeInput("");
      youtubeRef.current?.focus();
    } catch {
      setYoutubeError("Network error — try again");
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function addPlaylist(url: string) {
    const playlistId = extractYouTubePlaylistId(url);
    if (!playlistId) {
      setYoutubeError("Invalid playlist URL");
      return;
    }

    const alreadyAdded = entries.some(
      (e) => e.type === "playlist" && e.playlistId === playlistId
    );
    if (alreadyAdded) {
      setYoutubeError("Playlist already added");
      return;
    }

    setYoutubeLoading(true);
    setYoutubeError("");
    setPlaylistProgress(null);

    try {
      const res = await fetch("/api/youtube-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId }),
      });

      if (!res.body) {
        setYoutubeError("No response from server");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "progress") {
              setPlaylistProgress({ loaded: msg.loaded, total: msg.total });
            } else if (msg.type === "complete") {
              const children: PlaylistVideoEntry[] = msg.videos.map(
                (v: { videoId: string; title: string; duration: string; seconds: number; thumbnail: string }) => ({
                  id: crypto.randomUUID(),
                  label: v.title,
                  duration: v.duration,
                  seconds: v.seconds,
                  type: "playlist-video" as const,
                  thumbnail: v.thumbnail,
                })
              );
              const totalSecs = children.reduce((sum, c) => sum + c.seconds, 0);
              const playlistEntry: PlaylistEntry = {
                id: crypto.randomUUID(),
                label: msg.title,
                duration: secondsToHMS(totalSecs),
                seconds: totalSecs,
                type: "playlist",
                playlistId,
                children,
              };
              setEntries((prev) => [...prev, playlistEntry]);
              setYoutubeInput("");
              youtubeRef.current?.focus();
            } else if (msg.type === "error") {
              setYoutubeError(msg.error ?? "Something went wrong");
            }
          } catch {
            // skip malformed line
          }
        }
      }
    } catch {
      setYoutubeError("Network error — try again");
    } finally {
      setYoutubeLoading(false);
      setPlaylistProgress(null);
    }
  }

  function clampPage(nextEntries: Entry[]) {
    const rowCount = buildVisibleRows(nextEntries, expandedPlaylists).length;
    const maxPage = Math.max(0, Math.ceil(rowCount / PAGE_SIZE) - 1);
    setListPage((p) => Math.min(p, maxPage));
  }

  function removeEntry(id: string) {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      clampPage(next);
      return next;
    });
  }

  function removePlaylistVideo(playlistId: string, videoId: string) {
    setEntries((prev) => {
      const next = prev
        .map((e) => {
          if (e.type !== "playlist" || e.id !== playlistId) return e;
          const children = e.children.filter((c) => c.id !== videoId);
          if (children.length === 0) return null;
          const seconds = children.reduce((sum, c) => sum + c.seconds, 0);
          return { ...e, children, seconds, duration: secondsToHMS(seconds) };
        })
        .filter((e): e is Entry => e !== null);
      clampPage(next);
      return next;
    });
  }

  function togglePlaylist(id: string) {
    setExpandedPlaylists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const rowCount = buildVisibleRows(entries, next).length;
        const maxPage = Math.max(0, Math.ceil(rowCount / PAGE_SIZE) - 1);
        setListPage((p) => Math.min(p, maxPage));
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const visibleRows = buildVisibleRows(entries, expandedPlaylists);
  const totalPages = Math.ceil(visibleRows.length / PAGE_SIZE);
  const pageRows = visibleRows.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
  const renderRows = buildRenderRows(pageRows);

  return (
    <div className="flex flex-col min-h-screen font-sans">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-5">
        <h1 className="text-2xl font-semibold tracking-tight">Time Calculator</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Add durations manually or from YouTube videos
        </p>
      </header>

      {/* Main */}
      <main className="flex flex-1 gap-6 p-6 max-w-5xl w-full mx-auto">
        {/* Left: inputs + total */}
        <div className="flex flex-col gap-6 w-80 shrink-0">
          {/* Manual input */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-4">
              Manual
            </h2>
            <div className="flex gap-2">
              <input
                ref={manualRef}
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addManual()}
                placeholder="HH:MM:SS"
                className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500"
              />
              <button
                onClick={addManual}
                className="shrink-0 bg-white text-black text-sm font-medium px-4 py-2 rounded-lg hover:bg-neutral-200 active:scale-95 transition-all"
              >
                Add
              </button>
            </div>
            {manualError && (
              <p className="text-red-400 text-xs mt-2">{manualError}</p>
            )}
          </section>

          {/* YouTube input */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-4">
              YouTube
            </h2>
            <div className="flex gap-2">
              <input
                ref={youtubeRef}
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addYouTube()}
                placeholder="Paste video or playlist URL"
                className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500"
              />
              <button
                onClick={addYouTube}
                disabled={youtubeLoading}
                className="shrink-0 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {youtubeLoading ? "…" : "Add"}
              </button>
            </div>
            {youtubeError && (
              <p className="text-red-400 text-xs mt-2">{youtubeError}</p>
            )}
            {youtubeLoading && playlistProgress && (
              <p className="text-neutral-400 text-xs mt-2">
                Loading {playlistProgress.loaded}/{playlistProgress.total} videos…
              </p>
            )}
          </section>

          {/* Total */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mt-auto">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">
              Total
            </h2>
            <div className="text-3xl font-mono font-semibold tabular-nums">
              {secondsToHMS(totalSeconds)}
            </div>
            <div className="text-sm text-neutral-400 mt-1 font-mono tabular-nums">
              {secondsToDays(totalSeconds)}
            </div>
          </section>
        </div>

        {/* Right: entry list */}
        <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col">
          {entries.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-neutral-600 text-sm">
              No entries yet
            </div>
          ) : (
            <ul className="overflow-y-auto flex-1 divide-y divide-neutral-800">
              {renderRows.map((row) => {
                if (row.kind === "playlist-continuation") {
                  const { entry } = row;
                  return (
                    <li
                      key={`pc-cont-${entry.id}`}
                      className="flex items-center gap-4 px-5 py-2 bg-neutral-800/30 border-l-2 border-neutral-700 cursor-pointer"
                      onClick={() => togglePlaylist(entry.id)}
                    >
                      <div className="w-20 shrink-0 flex items-center">
                        <div className="w-5 shrink-0 flex items-center">
                          <svg className="w-3 h-3 text-red-500 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-red-500">Playlist</span>
                      </div>
                      <span className="text-xs text-neutral-500 truncate">
                        {entry.label} <span className="text-neutral-600">cont'd</span>
                      </span>
                    </li>
                  );
                }

                if (row.kind === "playlist-header") {
                  const { entry } = row;
                  const isExpanded = expandedPlaylists.has(entry.id);
                  return (
                    <li
                      key={`ph-${entry.id}`}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-neutral-800/50 transition-colors group cursor-pointer"
                      onClick={() => togglePlaylist(entry.id)}
                    >
                      <div className="w-20 shrink-0 flex items-center">
                        <div className="w-5 shrink-0 flex items-center">
                          <svg
                            className={`w-3 h-3 text-red-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-red-500">
                          Playlist
                        </span>
                      </div>
                      <Thumbnail src={entry.children[0]?.thumbnail} alt={entry.label} />
                      <span className="flex-1 text-sm text-neutral-200 truncate">{entry.label}</span>
                      <span className="text-xs text-neutral-500 shrink-0">{entry.children.length} videos</span>
                      <span className="font-mono text-sm tabular-nums text-neutral-300 shrink-0">{entry.duration}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }}
                        className="text-neutral-600 hover:text-red-400 transition-colors text-lg leading-none ml-1 opacity-0 group-hover:opacity-100"
                        aria-label="Remove playlist"
                      >×</button>
                    </li>
                  );
                }

                if (row.kind === "playlist-child") {
                  const { entry, video } = row;
                  return (
                    <li
                      key={`pc-${video.id}`}
                      className="flex items-center gap-4 px-5 py-3 bg-neutral-950/40 border-l-2 border-neutral-700 hover:bg-neutral-800/30 transition-colors group"
                    >
                      <div className="w-20 shrink-0" />
                      <Thumbnail src={video.thumbnail} alt={video.label} />
                      <span className="flex-1 text-sm text-neutral-300 truncate">{video.label}</span>
                      <span className="font-mono text-sm tabular-nums text-neutral-400 shrink-0">{video.duration}</span>
                      <button
                        onClick={() => removePlaylistVideo(entry.id, video.id)}
                        className="text-neutral-600 hover:text-red-400 transition-colors text-lg leading-none ml-1 opacity-0 group-hover:opacity-100"
                        aria-label="Remove video"
                      >×</button>
                    </li>
                  );
                }

                const { entry } = row;
                return (
                  <li
                    key={`fe-${entry.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-neutral-800/50 transition-colors group"
                  >
                    <div className="w-20 shrink-0 flex items-center">
                      <div className="w-5 shrink-0" />
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-red-500">
                        {entry.type === "youtube" ? "YT Video" : "Manual"}
                      </span>
                    </div>
                    {entry.type === "youtube" && <Thumbnail src={entry.thumbnail} alt={entry.label} />}
                    {entry.type === "youtube" && (
                      <span className="flex-1 text-sm text-neutral-200 truncate">{entry.label}</span>
                    )}
                    {entry.type === "manual" && <span className="flex-1" />}
                    <span className="font-mono text-sm tabular-nums text-neutral-300 shrink-0">{entry.duration}</span>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="text-neutral-600 hover:text-red-400 transition-colors text-lg leading-none ml-1 opacity-0 group-hover:opacity-100"
                      aria-label="Remove"
                    >×</button>
                  </li>
                );
              })}
            </ul>
          )}
          {entries.length > 0 && (
            <div className="border-t border-neutral-800 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-xs text-neutral-500 shrink-0">
                {entryCount} {entryCount === 1 ? "entry" : "entries"}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setListPage((p) => Math.max(0, p - 1))}
                    disabled={listPage === 0}
                    className="text-xs text-neutral-400 hover:text-white disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors"
                  >← Prev</button>
                  <span className="text-xs text-neutral-500 tabular-nums">{listPage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={listPage === totalPages - 1}
                    className="text-xs text-neutral-400 hover:text-white disabled:text-neutral-700 disabled:cursor-not-allowed transition-colors"
                  >Next →</button>
                </div>
              )}
              <button
                onClick={() => { setEntries([]); setListPage(0); }}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors shrink-0"
              >Clear all</button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 px-6 py-4 text-center text-xs text-neutral-600">
        by tam-justin
      </footer>
    </div>
  );
}

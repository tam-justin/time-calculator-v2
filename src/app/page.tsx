"use client";

import { useState, useRef, useEffect } from "react";
import { parseHMS, secondsToHMS, secondsToDays } from "@/lib/time";

type Entry = {
  id: string;
  label: string;
  duration: string;
  seconds: number;
  type: "manual" | "youtube";
};

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [youtubeError, setYoutubeError] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
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

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col min-h-screen font-sans">
      {/* Header */}
      <header className="border-b border-neutral-800 px-4 sm:px-6 py-4 sm:py-5">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Time Calculator</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Add durations manually or from YouTube videos
        </p>
      </header>

      {/* Main */}
      <main className="flex flex-col lg:flex-row flex-1 gap-6 p-4 sm:p-6 max-w-5xl w-full mx-auto">
        {/* Inputs + total */}
        <div className="flex flex-col gap-4 sm:gap-6 lg:w-80 lg:shrink-0">
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
                placeholder="Paste video URL"
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
          </section>

          {/* Total */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 lg:mt-auto">
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

        {/* Entry list */}
        <div className="flex-1 min-h-0 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col lg:max-h-none max-h-[50vh]">
          {entries.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-neutral-600 text-sm">
              No entries yet
            </div>
          ) : (
            <ul className="overflow-y-auto flex-1 divide-y divide-neutral-800">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-800/50 transition-colors group"
                >
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-neutral-500 w-14 shrink-0">
                    {entry.type === "youtube" ? "YT" : "manual"}
                  </span>
                  <span className="flex-1 text-sm text-neutral-200 truncate">
                    {entry.label}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-neutral-300 shrink-0">
                    {entry.duration}
                  </span>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="text-neutral-600 hover:text-red-400 active:text-red-400 transition-colors text-lg leading-none ml-1 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {entries.length > 0 && (
            <div className="border-t border-neutral-800 px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
              <button
                onClick={() => setEntries([])}
                className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 px-4 sm:px-6 py-4 text-center text-xs text-neutral-600">
        by tam-justin
      </footer>
    </div>
  );
}

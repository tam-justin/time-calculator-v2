# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Time Calculator v2 — a Next.js rewrite of a simple HTML/CSS/JS time calculator. Users can add time durations manually (HH:MM:SS format) or by pasting YouTube video URLs, which fetch durations via the YouTube Data API. The app displays a list of added times and a running total (in hours and days).

The original v1 lives at `../time-calculator` for reference. It's a single-page app with a two-panel layout (input + instructions on the left, time list + total on the right), displaying total time in both HH:MM:SS and days. The v2 UI can improve on this design.

## Deployment

Hosted on Vercel. `YOUTUBE_API_KEY` must be set as a Vercel environment variable in addition to `.env.local` for local dev. The YouTube API call goes through a Next.js API route (`/api/youtube-duration`) so the key is never exposed to the client.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

- **Framework**: Next.js 15 (App Router, `src/` directory)
- **Styling**: Tailwind CSS
- **API Integration**: YouTube Data API v3

### Key Features
- Manual time input in `HH:MM:SS` format with validation
- YouTube URL input: paste a video link, app fetches duration via API and adds it to the list
- Scrollable list of added times, each with a label (manual entry or video title) and a remove button
- Running total displayed in both `HH:MM:SS` and days

### YouTube URL → Duration Flow
1. User pastes a YouTube URL (`youtube.com/watch?v=`, `youtu.be/`, etc.)
2. POST to `/api/youtube-duration` with the URL
3. API route validates the extracted video ID against `/^[a-zA-Z0-9_-]{11}$/`, checks the in-process cache, then calls YouTube Data API v3: `GET https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id={VIDEO_ID}&key={API_KEY}`
4. Parse ISO 8601 duration (`PT1H2M3S`) from `contentDetails.duration`, pull title from `snippet.title`
5. Cache the result by video ID; return `{ duration: "HH:MM:SS", title: string }` to the client

### API Route Security (`/api/youtube-duration`)
- **Rate limiting**: 20 requests per IP per minute (keyed on `x-forwarded-for`)
- **Video ID validation**: strict regex before interpolating into the API URL
- **In-process cache**: module-level `Map` keyed by video ID — same ID never hits the YouTube API twice per server lifetime

## Environment Variables

```
YOUTUBE_API_KEY=     # YouTube Data API v3 key — set in .env.local for dev, Vercel env vars for prod
```

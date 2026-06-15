export type CachedVideo = {
  duration: string;
  title: string;
  seconds: number;
  thumbnail: string;
};

export const videoCache = new Map<string, CachedVideo>();

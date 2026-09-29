import { prisma } from "../lib/prisma.js";
import type { ResumePoint, WatchProgress } from "../types/watch.js";

// Past this fraction the viewer has effectively finished, so the film leaves Keep watching.
// Trailers end with a title card nobody sits through, which is why it is not 1.
const COMPLETION_THRESHOLD = 0.95;
// Below this the viewer barely started, and a two-second row entry is noise rather than memory
const MINIMUM_SECONDS = 5;
// One screenful. Keep watching is a shortcut, not an archive.
const KEEP_WATCHING_LIMIT = 20;

const movieSummarySelect = { id: true, title: true, posterUrl: true, releaseYear: true };

export async function record(
  userId: string,
  movieId: string,
  positionSeconds: number,
  durationSeconds: number,
): Promise<void> {
  const finished = durationSeconds > 0 && positionSeconds / durationSeconds >= COMPLETION_THRESHOLD;
  const completedAt = finished ? new Date() : undefined;

  await prisma.watchProgress.upsert({
    where: { userId_movieId: { userId, movieId } },
    create: { userId, movieId, positionSeconds, durationSeconds, completedAt },
    // completedAt is only ever set, never cleared: replaying the opening ten seconds of a film
    // you finished should not put it back in Keep watching
    update: { positionSeconds, durationSeconds, ...(finished ? { completedAt } : {}) },
  });
}

export type WatchStatus = "in-progress" | "completed";

// The two rows read opposite sides of the same flag: Keep watching wants what is unfinished,
// and "Because you watched" wants what is done.
export async function listProgress(userId: string, status: WatchStatus): Promise<WatchProgress[]> {
  const rows = await prisma.watchProgress.findMany({
    where:
      status === "completed"
        ? { userId, completedAt: { not: null } }
        : { userId, completedAt: null, positionSeconds: { gte: MINIMUM_SECONDS } },
    select: {
      positionSeconds: true,
      durationSeconds: true,
      updatedAt: true,
      movie: { select: movieSummarySelect },
    },
    orderBy: { updatedAt: "desc" },
    take: KEEP_WATCHING_LIMIT,
  });

  return rows.map((row) => ({
    movie: row.movie,
    positionSeconds: row.positionSeconds,
    durationSeconds: row.durationSeconds,
    progress: row.durationSeconds > 0 ? row.positionSeconds / row.durationSeconds : 0,
    updatedAt: row.updatedAt,
  }));
}

export async function resumePoint(userId: string, movieId: string): Promise<ResumePoint> {
  const row = await prisma.watchProgress.findUnique({
    where: { userId_movieId: { userId, movieId } },
    select: { positionSeconds: true, completedAt: true },
  });

  if (row === null) {
    return { positionSeconds: 0, completed: false };
  }

  // A film already finished starts from the beginning rather than from its last second
  if (row.completedAt !== null) {
    return { positionSeconds: 0, completed: true };
  }

  return { positionSeconds: row.positionSeconds, completed: false };
}

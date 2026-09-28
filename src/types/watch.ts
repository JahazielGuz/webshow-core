import type { MovieSummary } from "./catalogue.js";

export type WatchProgress = {
  movie: MovieSummary;
  positionSeconds: number;
  durationSeconds: number;
  // 0 to 1, computed here so every client draws the same bar
  progress: number;
  updatedAt: Date;
};

export type ResumePoint = {
  positionSeconds: number;
  completed: boolean;
};

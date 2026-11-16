/**
 * The API returns SQLite timestamps as UTC `YYYY-MM-DD HH:MM:SS` with no zone
 * marker, which `new Date()` would parse as local time and shift by the UTC
 * offset. Anything already carrying a zone is parsed as-is.
 */
export function parseServerTimestamp(value: string): Date {
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value)) return new Date(value);
  return new Date(`${value.replace(" ", "T")}Z`);
}

/** `37.8` -> `"+1.4"`, `-2.05` -> `"-2.1"`, used for target deltas. */
export function formatDelta(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** Coarse elapsed time: `2d 4h`, `5h 12m`, `42s`. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** Collapses runs of whitespace (incl. newlines) to single spaces and trims. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Shortens to at most `max` characters, marking the cut with "…". */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

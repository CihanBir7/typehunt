import path from "node:path";

import { MAX_SNIPPET_LENGTH } from "./constants.js";

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/** Convert a file path to POSIX-style forward slashes. */
export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Check whether a relative POSIX path matches any of the exclude patterns.
 *
 * Match rules (documented in --help):
 * - Exact match against the token
 * - Token is a prefix followed by `/`
 * - Token appears anywhere as a substring
 */
export function matchesExclude(
  relPathPosix: string,
  patterns: string[],
): boolean {
  if (patterns.length === 0) return false;

  const rel = relPathPosix.replace(/^\.\/+/, "");

  return patterns.some((raw) => {
    const p = raw.trim().replace(/^\.\/+/, "");
    if (!p) return false;
    return rel === p || rel.startsWith(`${p}/`) || rel.includes(p);
  });
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/** Collapse all whitespace and strip comments from a code string. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ") // strip block comments
    .replace(/\/\/.*$/gm, " ") // strip line comments
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/** Escape special regex characters in a string. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Produce a compact, truncated snippet for display. */
export function formatSnippet(
  rawSnippet: string,
  maxLength = MAX_SNIPPET_LENGTH,
): string {
  const compact = normalizeWhitespace(rawSnippet);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

// ---------------------------------------------------------------------------
// Collection utilities
// ---------------------------------------------------------------------------

/** Group items by a string key derived from each item. */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/** Filter grouped entries to only those meeting the minimum count, sorted descending. */
export function filterDuplicateGroups<T>(
  groups: Map<string, T[]>,
  minCount: number,
): Array<[string, T[]]> {
  return [...groups.entries()]
    .filter(([, items]) => items.length >= minCount)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

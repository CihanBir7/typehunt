// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions recognized as TypeScript source files. */
export const TYPE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".d.ts"]);

/** Directories always excluded from manual directory walks. */
export const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
]);

/** Maximum length for inline snippet display. */
export const MAX_SNIPPET_LENGTH = 200;

/** Maximum length for shape preview in text/markdown output. */
export const MAX_PREVIEW_LENGTH = 120;

/** Maximum number of file-read errors shown before truncating. */
export const MAX_DISPLAYED_ERRORS = 5;

/** Number of files to read concurrently during declaration collection. */
export const FILE_READ_CONCURRENCY = 50;

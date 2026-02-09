import type { CliOptions, Mode, OutputFormat } from "./types.js";
import { MODES, OUTPUT_FORMATS } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers for argument parsing
// ---------------------------------------------------------------------------

/**
 * Read a `--flag=value` or `--flag value` string argument from argv.
 * Returns the parsed value and the new index (advanced by 1 if the value
 * was in the next argv slot). Returns `null` if the current arg doesn't
 * match the flag.
 */
function readStringArg(
  argv: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } | null {
  const arg = argv[index];
  if (!arg) return null;

  const prefix = `${flag}=`;
  if (arg.startsWith(prefix)) {
    const value = arg.slice(prefix.length);
    if (!value) throw new Error(`Missing value for ${flag}`);
    return { value, nextIndex: index };
  }

  if (arg === flag) {
    const next = argv[index + 1];
    if (!next) throw new Error(`Missing value for ${flag}`);
    return { value: next, nextIndex: index + 1 };
  }

  return null;
}

/**
 * Read a validated enum-like string argument (e.g. --mode name).
 */
function readEnumArg<T extends string>(
  argv: string[],
  index: number,
  flag: string,
  allowed: readonly T[],
): { value: T; nextIndex: number } | null {
  const result = readStringArg(argv, index, flag);
  if (!result) return null;

  if (!allowed.includes(result.value as T)) {
    throw new Error(
      `Invalid value for ${flag}: ${result.value}. Expected: ${allowed.join(", ")}`,
    );
  }

  return { value: result.value as T, nextIndex: result.nextIndex };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: "src",
    mode: "both",
    minCount: 2,
    format: "text",
    outputFile: null,
    failOnDuplicates: false,
    tsconfig: null,
    exclude: [],
    includeEnums: true,
    skipReExports: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    // ── Boolean flags ─────────────────────────────────────────────────
    if (arg === "--json") {
      options.format = "json";
      continue;
    }
    if (arg === "--markdown" || arg === "--md") {
      options.format = "markdown";
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--fail-on-duplicates") {
      options.failOnDuplicates = true;
      continue;
    }
    if (arg === "--no-enums") {
      options.includeEnums = false;
      continue;
    }
    if (arg === "--include-reexports") {
      options.skipReExports = false;
      continue;
    }

    // ── Enum flags ────────────────────────────────────────────────────
    const formatResult = readEnumArg<OutputFormat>(
      argv,
      i,
      "--format",
      OUTPUT_FORMATS,
    );
    if (formatResult) {
      options.format = formatResult.value;
      i = formatResult.nextIndex;
      continue;
    }

    const modeResult = readEnumArg<Mode>(argv, i, "--mode", MODES);
    if (modeResult) {
      options.mode = modeResult.value;
      i = modeResult.nextIndex;
      continue;
    }

    // ── String flags ──────────────────────────────────────────────────
    const outputResult =
      readStringArg(argv, i, "--output") ?? readStringArg(argv, i, "--out");
    if (outputResult) {
      options.outputFile = outputResult.value;
      i = outputResult.nextIndex;
      continue;
    }

    const rootResult = readStringArg(argv, i, "--root");
    if (rootResult) {
      options.root = rootResult.value;
      i = rootResult.nextIndex;
      continue;
    }

    const tsconfigResult = readStringArg(argv, i, "--tsconfig");
    if (tsconfigResult) {
      options.tsconfig = tsconfigResult.value;
      i = tsconfigResult.nextIndex;
      continue;
    }

    // ── Repeatable / special flags ────────────────────────────────────
    const excludeResult = readStringArg(argv, i, "--exclude");
    if (excludeResult) {
      options.exclude.push(...excludeResult.value.split(","));
      i = excludeResult.nextIndex;
      continue;
    }

    // ── --min (numeric) ───────────────────────────────────────────────
    const minResult = readStringArg(argv, i, "--min");
    if (minResult) {
      const value = Number(minResult.value);
      if (!Number.isInteger(value) || value < 2) {
        throw new Error("Invalid value for --min; expected integer >= 2");
      }
      options.minCount = value;
      i = minResult.nextIndex;
      continue;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

export function printHelp(): void {
  console.log(`typehunt — Find duplicate type definitions across your TypeScript codebase

Usage:
  npx typehunt [options]

Options:
  --root <path>             Root directory to scan (default: src)
  --tsconfig <path>         Path to tsconfig.json — respects include/exclude
  --mode <name|shape|both>  Duplicate detection mode (default: both)
  --min <number>            Minimum duplicates per group (default: 2)
  --exclude <token,...>     Exclude by matching tokens against relative paths (repeatable).
                            Match rules: equals, prefix (token/...), or substring.
  --no-enums                Skip enum declarations
  --include-reexports       Include re-exports (excluded by default)
  --format <text|json|markdown>  Output format (default: text)
  --json                    Shortcut for --format json
  --markdown, --md          Shortcut for --format markdown
  --output <path>           Save output to a file
  --fail-on-duplicates      Exit with code 1 when duplicates are found (CI mode)
  --help, -h                Show this help

Examples:
  npx typehunt
  npx typehunt --tsconfig tsconfig.json
  npx typehunt --root src --mode shape --json
  npx typehunt --markdown --output report.md
  npx typehunt --exclude generated,src/vendor,.storybook
`);
}

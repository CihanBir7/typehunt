import { describe, expect, it } from "vitest";

import { parseArgs } from "../args.js";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("returns defaults for empty argv", () => {
    const opts = parseArgs([]);
    expect(opts.root).toBe("src");
    expect(opts.mode).toBe("both");
    expect(opts.minCount).toBe(2);
    expect(opts.format).toBe("text");
    expect(opts.outputFile).toBeNull();
    expect(opts.failOnDuplicates).toBe(false);
    expect(opts.tsconfig).toBeNull();
    expect(opts.exclude).toEqual([]);
    expect(opts.includeEnums).toBe(true);
    expect(opts.skipReExports).toBe(true);
    expect(opts.help).toBe(false);
  });

  // ── Boolean flags ─────────────────────────────────────────────────────

  it("parses --help flag", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("parses -h flag", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("parses --json shortcut", () => {
    expect(parseArgs(["--json"]).format).toBe("json");
  });

  it("parses --markdown shortcut", () => {
    expect(parseArgs(["--markdown"]).format).toBe("markdown");
  });

  it("parses --md shortcut", () => {
    expect(parseArgs(["--md"]).format).toBe("markdown");
  });

  it("parses --fail-on-duplicates flag", () => {
    expect(parseArgs(["--fail-on-duplicates"]).failOnDuplicates).toBe(true);
  });

  it("parses --no-enums flag", () => {
    expect(parseArgs(["--no-enums"]).includeEnums).toBe(false);
  });

  it("parses --include-reexports flag", () => {
    expect(parseArgs(["--include-reexports"]).skipReExports).toBe(false);
  });

  // ── String flags (--flag value) ──────────────────────────────────────

  it("parses --root with space separator", () => {
    expect(parseArgs(["--root", "lib"]).root).toBe("lib");
  });

  it("parses --root with = separator", () => {
    expect(parseArgs(["--root=lib"]).root).toBe("lib");
  });

  it("parses --tsconfig", () => {
    expect(parseArgs(["--tsconfig", "tsconfig.app.json"]).tsconfig).toBe(
      "tsconfig.app.json",
    );
  });

  it("parses --output", () => {
    expect(parseArgs(["--output", "report.json"]).outputFile).toBe(
      "report.json",
    );
  });

  it("parses --out alias", () => {
    expect(parseArgs(["--out", "report.json"]).outputFile).toBe("report.json");
  });

  // ── Enum flags ────────────────────────────────────────────────────────

  it("parses --mode name", () => {
    expect(parseArgs(["--mode", "name"]).mode).toBe("name");
  });

  it("parses --mode shape", () => {
    expect(parseArgs(["--mode", "shape"]).mode).toBe("shape");
  });

  it("parses --mode both", () => {
    expect(parseArgs(["--mode", "both"]).mode).toBe("both");
  });

  it("throws on invalid --mode value", () => {
    expect(() => parseArgs(["--mode", "invalid"])).toThrow(
      /Invalid value for --mode/,
    );
  });

  it("parses --format json", () => {
    expect(parseArgs(["--format", "json"]).format).toBe("json");
  });

  it("parses --format markdown", () => {
    expect(parseArgs(["--format", "markdown"]).format).toBe("markdown");
  });

  it("throws on invalid --format value", () => {
    expect(() => parseArgs(["--format", "xml"])).toThrow(
      /Invalid value for --format/,
    );
  });

  // ── Numeric flags ────────────────────────────────────────────────────

  it("parses --min with valid integer", () => {
    expect(parseArgs(["--min", "3"]).minCount).toBe(3);
  });

  it("throws on --min < 2", () => {
    expect(() => parseArgs(["--min", "1"])).toThrow(/integer >= 2/);
  });

  it("throws on --min with non-integer", () => {
    expect(() => parseArgs(["--min", "abc"])).toThrow(/integer >= 2/);
  });

  // ── Repeatable / special flags ───────────────────────────────────────

  it("parses --exclude with comma-separated values", () => {
    const opts = parseArgs(["--exclude", "generated,vendor"]);
    expect(opts.exclude).toEqual(["generated", "vendor"]);
  });

  it("accumulates multiple --exclude flags", () => {
    const opts = parseArgs([
      "--exclude",
      "generated",
      "--exclude",
      "vendor",
    ]);
    expect(opts.exclude).toEqual(["generated", "vendor"]);
  });

  // ── Combined flags ───────────────────────────────────────────────────

  it("parses multiple flags together", () => {
    const opts = parseArgs([
      "--root",
      "lib",
      "--mode",
      "name",
      "--json",
      "--min",
      "3",
      "--fail-on-duplicates",
      "--no-enums",
      "--exclude",
      "test,spec",
    ]);

    expect(opts.root).toBe("lib");
    expect(opts.mode).toBe("name");
    expect(opts.format).toBe("json");
    expect(opts.minCount).toBe(3);
    expect(opts.failOnDuplicates).toBe(true);
    expect(opts.includeEnums).toBe(false);
    expect(opts.exclude).toEqual(["test", "spec"]);
  });

  // ── Missing value errors ─────────────────────────────────────────────

  it("throws when --root has no value", () => {
    expect(() => parseArgs(["--root"])).toThrow(/Missing value for --root/);
  });

  it("throws when --mode has no value", () => {
    expect(() => parseArgs(["--mode"])).toThrow(/Missing value for --mode/);
  });

  it("throws when --root= has empty value", () => {
    expect(() => parseArgs(["--root="])).toThrow(/Missing value for --root/);
  });
});

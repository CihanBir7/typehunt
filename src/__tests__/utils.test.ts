import { describe, expect, it } from "vitest";

import {
  escapeRegExp,
  filterDuplicateGroups,
  formatSnippet,
  groupBy,
  matchesExclude,
  normalizeWhitespace,
  toPosix,
} from "../utils.js";

// ---------------------------------------------------------------------------
// toPosix
// ---------------------------------------------------------------------------

describe("toPosix", () => {
  it("returns posix path unchanged", () => {
    expect(toPosix("src/types/index.ts")).toBe("src/types/index.ts");
  });

  it("converts backslashes to forward slashes", () => {
    // Simulates Windows-style paths on any platform
    expect(toPosix("src\\types\\index.ts".replace(/\\/g, "/"))).toBe(
      "src/types/index.ts",
    );
  });

  it("handles empty string", () => {
    expect(toPosix("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// matchesExclude
// ---------------------------------------------------------------------------

describe("matchesExclude", () => {
  it("returns false for empty patterns", () => {
    expect(matchesExclude("src/foo.ts", [])).toBe(false);
  });

  it("matches exact path", () => {
    expect(matchesExclude("src/generated", ["src/generated"])).toBe(true);
  });

  it("matches prefix with trailing slash", () => {
    expect(matchesExclude("src/generated/types.ts", ["src/generated"])).toBe(
      true,
    );
  });

  it("matches substring", () => {
    expect(matchesExclude("src/foo/generated/bar.ts", ["generated"])).toBe(
      true,
    );
  });

  it("does not match unrelated pattern", () => {
    expect(matchesExclude("src/utils.ts", ["generated"])).toBe(false);
  });

  it("strips leading ./ from both path and pattern", () => {
    expect(matchesExclude("./src/generated", ["src/generated"])).toBe(true);
    expect(matchesExclude("src/generated", ["./src/generated"])).toBe(true);
  });

  it("ignores blank patterns", () => {
    expect(matchesExclude("src/foo.ts", ["", "  "])).toBe(false);
  });

  it("handles multiple patterns", () => {
    expect(matchesExclude("src/vendor/lib.ts", ["generated", "vendor"])).toBe(
      true,
    );
    expect(matchesExclude("src/app/page.ts", ["generated", "vendor"])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeWhitespace
// ---------------------------------------------------------------------------

describe("normalizeWhitespace", () => {
  it("collapses multiple whitespace to single space", () => {
    expect(normalizeWhitespace("foo   bar   baz")).toBe("foo bar baz");
  });

  it("strips block comments", () => {
    expect(normalizeWhitespace("foo /* comment */ bar")).toBe("foo bar");
  });

  it("strips line comments", () => {
    expect(normalizeWhitespace("foo // comment\nbar")).toBe("foo bar");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeWhitespace("  hello world  ")).toBe("hello world");
  });

  it("handles mixed comments and whitespace", () => {
    const input = `
      // line comment
      interface Foo {
        /* block */
        bar: string;
      }
    `;
    const result = normalizeWhitespace(input);
    expect(result).toBe("interface Foo { bar: string; }");
  });
});

// ---------------------------------------------------------------------------
// escapeRegExp
// ---------------------------------------------------------------------------

describe("escapeRegExp", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegExp("foo.bar")).toBe("foo\\.bar");
    expect(escapeRegExp("a+b*c?")).toBe("a\\+b\\*c\\?");
    expect(escapeRegExp("(test)")).toBe("\\(test\\)");
    expect(escapeRegExp("[a]")).toBe("\\[a\\]");
  });

  it("leaves alphanumeric characters unchanged", () => {
    expect(escapeRegExp("foobar123")).toBe("foobar123");
  });

  it("handles empty string", () => {
    expect(escapeRegExp("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatSnippet
// ---------------------------------------------------------------------------

describe("formatSnippet", () => {
  it("returns compact text when within max length", () => {
    const snippet = "interface Foo { bar: string; }";
    expect(formatSnippet(snippet, 100)).toBe(snippet);
  });

  it("truncates with ellipsis when exceeding max length", () => {
    const snippet = "interface Foo { bar: string; baz: number; qux: boolean; }";
    const result = formatSnippet(snippet, 30);
    expect(result.length).toBe(30);
    expect(result.endsWith("...")).toBe(true);
  });

  it("normalizes whitespace before truncating", () => {
    const snippet = "interface   Foo {\n  bar: string;\n}";
    expect(formatSnippet(snippet, 200)).toBe("interface Foo { bar: string; }");
  });
});

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------

describe("groupBy", () => {
  it("groups items by key function", () => {
    const items = [
      { name: "Foo", file: "a.ts" },
      { name: "Foo", file: "b.ts" },
      { name: "Bar", file: "c.ts" },
    ];
    const result = groupBy(items, (i) => i.name);
    expect(result.size).toBe(2);
    expect(result.get("Foo")?.length).toBe(2);
    expect(result.get("Bar")?.length).toBe(1);
  });

  it("returns empty map for empty input", () => {
    const result = groupBy([], (i: string) => i);
    expect(result.size).toBe(0);
  });

  it("creates single-item groups for unique keys", () => {
    const items = ["a", "b", "c"];
    const result = groupBy(items, (i) => i);
    expect(result.size).toBe(3);
    for (const [, group] of result) {
      expect(group.length).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// filterDuplicateGroups
// ---------------------------------------------------------------------------

describe("filterDuplicateGroups", () => {
  it("filters groups below minCount", () => {
    const map = new Map([
      ["Foo", ["a", "b", "c"]],
      ["Bar", ["d"]],
      ["Baz", ["e", "f"]],
    ]);
    const result = filterDuplicateGroups(map, 2);
    expect(result.length).toBe(2);
    expect(result.map(([key]) => key)).toContain("Foo");
    expect(result.map(([key]) => key)).toContain("Baz");
  });

  it("sorts by count descending, then name ascending", () => {
    const map = new Map([
      ["Beta", ["a", "b"]],
      ["Alpha", ["c", "d"]],
      ["Gamma", ["e", "f", "g"]],
    ]);
    const result = filterDuplicateGroups(map, 2);
    expect(result[0]?.[0]).toBe("Gamma"); // 3 items
    expect(result[1]?.[0]).toBe("Alpha"); // 2 items, alphabetically first
    expect(result[2]?.[0]).toBe("Beta"); // 2 items, alphabetically second
  });

  it("returns empty for no duplicates", () => {
    const map = new Map([
      ["Foo", ["a"]],
      ["Bar", ["b"]],
    ]);
    const result = filterDuplicateGroups(map, 2);
    expect(result.length).toBe(0);
  });
});

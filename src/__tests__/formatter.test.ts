import { describe, expect, it } from "vitest";

import { buildJsonPayload, renderMarkdown } from "../formatter.js";
import type { DeclarationRecord, Mode, ReportMeta } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeclaration(
  overrides: Partial<DeclarationRecord> = {},
): DeclarationRecord {
  return {
    name: "Foo",
    kind: "interface",
    file: "src/types.ts",
    line: 1,
    snippet: "interface Foo { bar: string; }",
    normalizedShape: "type __NAME__ = { bar: string; }",
    isReExport: false,
    propertyCount: 1,
    propertyNames: ["bar"],
    ...overrides,
  };
}

function makeMeta(overrides: Partial<ReportMeta> = {}): ReportMeta {
  return {
    filesScanned: 10,
    declarationsScanned: 25,
    mode: "both" as Mode,
    fileSource: "directory walk (src)",
    duplicateCount: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildJsonPayload
// ---------------------------------------------------------------------------

describe("buildJsonPayload", () => {
  it("includes name groups when mode is 'name'", () => {
    const d1 = makeDeclaration({ file: "a.ts", line: 1 });
    const d2 = makeDeclaration({ file: "b.ts", line: 5 });
    const nameGroups: Array<[string, DeclarationRecord[]]> = [
      ["Foo", [d1, d2]],
    ];
    const shapeGroups: Array<[string, DeclarationRecord[]]> = [];

    const payload = buildJsonPayload(
      nameGroups,
      shapeGroups,
      { ...makeMeta({ mode: "name" }), root: "src", errors: [] },
      "name",
    );

    expect(payload.duplicateNameGroups.length).toBe(1);
    expect(payload.duplicateNameGroups[0]?.name).toBe("Foo");
    expect(payload.duplicateNameGroups[0]?.count).toBe(2);
    expect(payload.duplicateShapeGroups).toEqual([]);
  });

  it("includes shape groups when mode is 'shape'", () => {
    const d1 = makeDeclaration({ name: "Foo", file: "a.ts" });
    const d2 = makeDeclaration({ name: "Bar", file: "b.ts" });
    const shapeGroups: Array<[string, DeclarationRecord[]]> = [
      ["type __NAME__ = { bar: string; }", [d1, d2]],
    ];

    const payload = buildJsonPayload(
      [],
      shapeGroups,
      { ...makeMeta({ mode: "shape" }), root: "src", errors: [] },
      "shape",
    );

    expect(payload.duplicateNameGroups).toEqual([]);
    expect(payload.duplicateShapeGroups.length).toBe(1);
    expect(payload.duplicateShapeGroups[0]?.count).toBe(2);
  });

  it("includes both groups when mode is 'both'", () => {
    const d1 = makeDeclaration({ file: "a.ts" });
    const d2 = makeDeclaration({ file: "b.ts" });
    const nameGroups: Array<[string, DeclarationRecord[]]> = [
      ["Foo", [d1, d2]],
    ];
    const shapeGroups: Array<[string, DeclarationRecord[]]> = [
      ["type __NAME__ = { bar: string; }", [d1, d2]],
    ];

    const payload = buildJsonPayload(
      nameGroups,
      shapeGroups,
      { ...makeMeta({ mode: "both" }), root: "src", errors: [] },
      "both",
    );

    expect(payload.duplicateNameGroups.length).toBe(1);
    expect(payload.duplicateShapeGroups.length).toBe(1);
  });

  it("includes metadata fields", () => {
    const payload = buildJsonPayload(
      [],
      [],
      {
        ...makeMeta({ filesScanned: 42, declarationsScanned: 100 }),
        root: "lib",
        errors: [],
      },
      "both",
    );

    expect(payload.filesScanned).toBe(42);
    expect(payload.declarationsScanned).toBe(100);
    expect(payload.root).toBe("lib");
    expect(payload.mode).toBe("both");
  });

  it("includes errors when present", () => {
    const errors = [{ file: "broken.ts", error: "ENOENT" }];
    const payload = buildJsonPayload(
      [],
      [],
      { ...makeMeta(), root: "src", errors },
      "both",
    );

    expect(payload.errors).toEqual(errors);
  });

  it("omits errors when empty", () => {
    const payload = buildJsonPayload(
      [],
      [],
      { ...makeMeta(), root: "src", errors: [] },
      "both",
    );

    expect(payload.errors).toBeUndefined();
  });

  it("maps declarations with correct fields", () => {
    const d = makeDeclaration({
      name: "Test",
      file: "src/test.ts",
      line: 42,
      kind: "type",
      snippet: "type Test = string",
      isReExport: false,
    });
    const payload = buildJsonPayload(
      [["Test", [d]]],
      [],
      { ...makeMeta({ mode: "name" }), root: "src", errors: [] },
      "name",
    );

    const decl = payload.duplicateNameGroups[0]?.declarations[0];
    expect(decl?.file).toBe("src/test.ts");
    expect(decl?.line).toBe(42);
    expect(decl?.kind).toBe("type");
    expect(decl?.name).toBe("Test");
    expect(decl?.isReExport).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// renderMarkdown
// ---------------------------------------------------------------------------

describe("renderMarkdown", () => {
  it("renders header with duplicate count when duplicates exist", () => {
    const d1 = makeDeclaration({ file: "a.ts" });
    const d2 = makeDeclaration({ file: "b.ts" });
    const md = renderMarkdown(
      [["Foo", [d1, d2]]],
      [],
      makeMeta({ mode: "name", duplicateCount: 1 }),
    );

    expect(md).toContain("# 🔍 Duplicate Types Report");
    expect(md).toContain("**1 duplicate group(s) found**");
  });

  it("renders success header when no duplicates", () => {
    const md = renderMarkdown([], [], makeMeta({ duplicateCount: 0 }));
    expect(md).toContain("# ✅ Duplicate Types Report");
    expect(md).toContain("**No duplicates found**");
  });

  it("includes summary table", () => {
    const md = renderMarkdown(
      [],
      [],
      makeMeta({ filesScanned: 15, declarationsScanned: 50 }),
    );
    expect(md).toContain("| Files scanned | 15 |");
    expect(md).toContain("| Declarations found | 50 |");
  });

  it("renders name duplicate section", () => {
    const d1 = makeDeclaration({ file: "a.ts", line: 10 });
    const d2 = makeDeclaration({ file: "b.ts", line: 20 });
    const md = renderMarkdown(
      [["Foo", [d1, d2]]],
      [],
      makeMeta({ mode: "name" }),
    );

    expect(md).toContain("## Duplicate Type Names");
    expect(md).toContain("### `Foo` (2 occurrences)");
    expect(md).toContain("`a.ts`");
    expect(md).toContain("`b.ts`");
  });

  it("renders shape duplicate section with preview", () => {
    const d1 = makeDeclaration({ name: "Foo", file: "a.ts" });
    const d2 = makeDeclaration({ name: "Bar", file: "b.ts" });
    const md = renderMarkdown(
      [],
      [["shape-key", [d1, d2]]],
      makeMeta({ mode: "shape" }),
    );

    expect(md).toContain("## Duplicate Type Shapes");
    expect(md).toContain("Shape #1");
    expect(md).toContain("`Foo`");
    expect(md).toContain("`Bar`");
    expect(md).toContain("<details>");
    expect(md).toContain("Shape preview");
    expect(md).toContain("```typescript");
  });

  it("renders no-duplicate message for empty groups", () => {
    const md = renderMarkdown([], [], makeMeta({ mode: "both" }));
    expect(md).toContain("No duplicate names found");
    expect(md).toContain("No duplicate shapes found");
  });

  it("includes footer with typehunt link", () => {
    const md = renderMarkdown([], [], makeMeta());
    expect(md).toContain("Generated by [typehunt]");
    expect(md).toContain("github.com/nicecihan/typehunt");
  });

  it("only shows name section when mode is 'name'", () => {
    const md = renderMarkdown([], [], makeMeta({ mode: "name" }));
    expect(md).toContain("## Duplicate Type Names");
    expect(md).not.toContain("## Duplicate Type Shapes");
  });

  it("only shows shape section when mode is 'shape'", () => {
    const md = renderMarkdown([], [], makeMeta({ mode: "shape" }));
    expect(md).not.toContain("## Duplicate Type Names");
    expect(md).toContain("## Duplicate Type Shapes");
  });

  it("shows both sections when mode is 'both'", () => {
    const md = renderMarkdown([], [], makeMeta({ mode: "both" }));
    expect(md).toContain("## Duplicate Type Names");
    expect(md).toContain("## Duplicate Type Shapes");
  });
});

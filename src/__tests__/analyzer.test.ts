import { describe, expect, it } from "vitest";

import { collectDeclarations, normalizeShape } from "../analyzer.js";

// ---------------------------------------------------------------------------
// normalizeShape
// ---------------------------------------------------------------------------

describe("normalizeShape", () => {
  it("replaces the declaration name with __NAME__", () => {
    const result = normalizeShape("interface Foo { bar: string; }", "Foo");
    expect(result).toContain("__NAME__");
    expect(result).not.toContain("Foo");
  });

  it("normalizes interface to type alias syntax", () => {
    const result = normalizeShape("interface Foo { bar: string; }", "Foo");
    expect(result).toMatch(/^type __NAME__ = \{/);
  });

  it("strips export keyword", () => {
    const result = normalizeShape(
      "export interface Foo { bar: string; }",
      "Foo",
    );
    expect(result).not.toMatch(/^export/);
  });

  it("normalizes const enum to enum", () => {
    const result = normalizeShape(
      "const enum Status { Active, Inactive }",
      "Status",
    );
    expect(result).not.toContain("const enum");
    expect(result).toContain("enum __NAME__");
  });

  it("strips comments", () => {
    const result = normalizeShape(
      "/* comment */ interface Foo { bar: string; }",
      "Foo",
    );
    expect(result).not.toContain("comment");
  });

  it("strips trailing semicolons", () => {
    const result = normalizeShape("type Foo = string;", "Foo");
    expect(result).not.toMatch(/;\s*$/);
  });

  it("produces the same shape for equivalent interface and type alias", () => {
    const interfaceShape = normalizeShape(
      "interface User { name: string; age: number; }",
      "User",
    );
    const typeShape = normalizeShape(
      "type Person = { name: string; age: number; }",
      "Person",
    );
    // Both should normalize the name to __NAME__ and interface → type
    // The shapes should be identical since the structure is the same
    expect(interfaceShape).toBe(typeShape);
  });

  it("replaces all occurrences of the name (self-referencing types)", () => {
    const result = normalizeShape(
      "interface TreeNode { value: string; children: TreeNode[]; }",
      "TreeNode",
    );
    expect(result).not.toContain("TreeNode");
    expect(result).toContain("__NAME__[]");
  });
});

// ---------------------------------------------------------------------------
// collectDeclarations
// ---------------------------------------------------------------------------

describe("collectDeclarations", () => {
  it("collects interface declarations", () => {
    const source = `
      export interface User {
        name: string;
        age: number;
      }
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    const interfaces = records.filter((r) => r.kind === "interface");
    expect(interfaces.length).toBe(1);
    expect(interfaces[0]?.name).toBe("User");
    expect(interfaces[0]?.propertyNames).toEqual(["age", "name"]);
    expect(interfaces[0]?.propertyCount).toBe(2);
  });

  it("collects type alias declarations", () => {
    const source = `
      export type Status = "active" | "inactive";
      export type Config = { debug: boolean; verbose: boolean; };
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    const types = records.filter((r) => r.kind === "type");
    expect(types.length).toBe(2);
    expect(types.map((t) => t.name).sort()).toEqual(["Config", "Status"]);
  });

  it("collects enum declarations when includeEnums is true", () => {
    const source = `
      enum Color { Red, Green, Blue }
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    const enums = records.filter((r) => r.kind === "enum");
    expect(enums.length).toBe(1);
    expect(enums[0]?.name).toBe("Color");
    expect(enums[0]?.propertyNames).toEqual(["Blue", "Green", "Red"]);
  });

  it("skips enum declarations when includeEnums is false", () => {
    const source = `
      enum Color { Red, Green, Blue }
      interface Foo { bar: string; }
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: false,
    });
    expect(records.filter((r) => r.kind === "enum").length).toBe(0);
    expect(records.filter((r) => r.kind === "interface").length).toBe(1);
  });

  it("collects re-export declarations", () => {
    const source = `
      export { Foo, Bar } from "./other";
      export type { Baz } from "./types";
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    const reexports = records.filter((r) => r.kind === "reexport");
    expect(reexports.length).toBe(3);
    expect(reexports.every((r) => r.isReExport)).toBe(true);
    expect(reexports.map((r) => r.name).sort()).toEqual(["Bar", "Baz", "Foo"]);
  });

  it("ignores export * from statements", () => {
    const source = `
      export * from "./other";
      interface Foo { bar: string; }
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    const reexports = records.filter((r) => r.kind === "reexport");
    expect(reexports.length).toBe(0);
  });

  it("handles TSX files", () => {
    const source = `
      interface Props { label: string; }
      type ButtonProps = { onClick: () => void; };
    `;
    const records = collectDeclarations("/test/component.tsx", source, {
      includeEnums: true,
    });
    expect(records.filter((r) => r.kind === "interface").length).toBe(1);
    expect(records.filter((r) => r.kind === "type").length).toBe(1);
  });

  it("sets correct line numbers", () => {
    const source = `interface Foo {
  bar: string;
}

interface Bar {
  baz: number;
}`;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    const foo = records.find((r) => r.name === "Foo");
    const bar = records.find((r) => r.name === "Bar");
    expect(foo?.line).toBe(1);
    expect(bar?.line).toBe(5);
  });

  it("returns empty array for files with no declarations", () => {
    const source = `
      const x = 42;
      function hello() { return "world"; }
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    expect(records.length).toBe(0);
  });

  it("handles empty source text", () => {
    const records = collectDeclarations("/test/empty.ts", "", {
      includeEnums: true,
    });
    expect(records.length).toBe(0);
  });

  it("extracts property names from type literals", () => {
    const source = `
      type Config = {
        debug: boolean;
        verbose: boolean;
        output: string;
      };
    `;
    const records = collectDeclarations("/test/file.ts", source, {
      includeEnums: true,
    });
    expect(records[0]?.propertyNames).toEqual(["debug", "output", "verbose"]);
    expect(records[0]?.propertyCount).toBe(3);
  });
});

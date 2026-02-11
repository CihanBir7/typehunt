import type {
  DeclarationRecord,
  Mode,
  ReportMeta,
  ReportPayload,
} from "./types.js";
import { MAX_PREVIEW_LENGTH } from "./constants.js";

// ---------------------------------------------------------------------------
// Text output
// ---------------------------------------------------------------------------

function printNameReport(groups: Array<[string, DeclarationRecord[]]>): void {
  console.log("\n── Duplicate type names ──────────────────────────────────");
  if (groups.length === 0) {
    console.log("  ✓ No duplicates found");
    return;
  }

  for (const [name, items] of groups) {
    console.log(`\n  ${name} (${items.length} occurrences)`);
    for (const item of items) {
      console.log(`    ${item.kind.padEnd(9)}  ${item.file}:${item.line}`);
    }
  }
}

function printShapeReport(groups: Array<[string, DeclarationRecord[]]>): void {
  console.log("\n── Duplicate type shapes ─────────────────────────────────");
  if (groups.length === 0) {
    console.log("  ✓ No duplicates found");
    return;
  }

  let shapeIndex = 0;
  for (const [, items] of groups) {
    shapeIndex++;
    const names = [...new Set(items.map((i) => i.name))].join(", ");
    console.log(
      `\n  shape#${shapeIndex} — names: ${names} (${items.length} occurrences)`,
    );
    for (const item of items) {
      console.log(
        `    ${item.kind.padEnd(9)}  ${item.name.padEnd(24)}  ${item.file}:${item.line}`,
      );
    }

    const representative = items[0];
    if (representative) {
      const preview =
        representative.snippet.length > MAX_PREVIEW_LENGTH
          ? `${representative.snippet.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
          : representative.snippet;
      console.log(`    shape:   ${preview}`);
    }
  }
}

function renderNameReport(groups: Array<[string, DeclarationRecord[]]>): string[] {
  const lines: string[] = [];
  lines.push("\n── Duplicate type names ──────────────────────────────────");
  if (groups.length === 0) {
    lines.push("  ✓ No duplicates found");
    return lines;
  }

  for (const [name, items] of groups) {
    lines.push(`\n  ${name} (${items.length} occurrences)`);
    for (const item of items) {
      lines.push(`    ${item.kind.padEnd(9)}  ${item.file}:${item.line}`);
    }
  }

  return lines;
}

function renderShapeReport(groups: Array<[string, DeclarationRecord[]]>): string[] {
  const lines: string[] = [];
  lines.push("\n── Duplicate type shapes ─────────────────────────────────");
  if (groups.length === 0) {
    lines.push("  ✓ No duplicates found");
    return lines;
  }

  let shapeIndex = 0;
  for (const [, items] of groups) {
    shapeIndex++;
    const names = [...new Set(items.map((i) => i.name))].join(", ");
    lines.push(
      `\n  shape#${shapeIndex} — names: ${names} (${items.length} occurrences)`,
    );
    for (const item of items) {
      lines.push(
        `    ${item.kind.padEnd(9)}  ${item.name.padEnd(24)}  ${item.file}:${item.line}`,
      );
    }

    const representative = items[0];
    if (representative) {
      const preview =
        representative.snippet.length > MAX_PREVIEW_LENGTH
          ? `${representative.snippet.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
          : representative.snippet;
      lines.push(`    shape:   ${preview}`);
    }
  }

  return lines;
}

export function renderTextReport(
  nameGroups: Array<[string, DeclarationRecord[]]>,
  shapeGroups: Array<[string, DeclarationRecord[]]>,
  meta: ReportMeta,
): string {
  const lines: string[] = [];

  // Summary
  lines.push("\n── Summary ──────────────────────────────────────────────");
  lines.push(`  Files scanned:          ${meta.filesScanned}`);
  lines.push(`  Declarations found:     ${meta.declarationsScanned}`);
  lines.push(`  Source:                 ${meta.fileSource}`);
  if (meta.mode === "name" || meta.mode === "both") {
    lines.push(`  Duplicate name groups:  ${nameGroups.length}`);
  }
  if (meta.mode === "shape" || meta.mode === "both") {
    lines.push(`  Duplicate shape groups: ${shapeGroups.length}`);
  }
  lines.push("");

  // Detail sections
  if (meta.mode === "name" || meta.mode === "both") {
    lines.push(...renderNameReport(nameGroups));
  }
  if (meta.mode === "shape" || meta.mode === "both") {
    lines.push(...renderShapeReport(shapeGroups));
  }

  return lines.join("\n");
}

export function printTextReport(
  nameGroups: Array<[string, DeclarationRecord[]]>,
  shapeGroups: Array<[string, DeclarationRecord[]]>,
  meta: ReportMeta,
): void {
  console.log(renderTextReport(nameGroups, shapeGroups, meta));
}

// ---------------------------------------------------------------------------
// JSON payload builder
// ---------------------------------------------------------------------------

export function buildJsonPayload(
  nameGroups: Array<[string, DeclarationRecord[]]>,
  shapeGroups: Array<[string, DeclarationRecord[]]>,
  meta: ReportMeta & {
    root: string;
    errors?: Array<{ file: string; error: string }>;
  },
  mode: Mode,
): ReportPayload {
  const mapDeclarations = (items: DeclarationRecord[]) =>
    items.map((item) => ({
      file: item.file,
      line: item.line,
      kind: item.kind,
      name: item.name,
      snippet: item.snippet,
      isReExport: item.isReExport,
    }));

  return {
    root: meta.root,
    mode,
    fileSource: meta.fileSource,
    filesScanned: meta.filesScanned,
    declarationsScanned: meta.declarationsScanned,
    duplicateNameGroups:
      mode === "shape"
        ? []
        : nameGroups.map(([name, items]) => ({
            name,
            count: items.length,
            declarations: mapDeclarations(items),
          })),
    duplicateShapeGroups:
      mode === "name"
        ? []
        : shapeGroups.map(([shape, items]) => ({
            shape,
            count: items.length,
            declarations: mapDeclarations(items),
          })),
    errors: meta.errors && meta.errors.length > 0 ? meta.errors : undefined,
  };
}

// ---------------------------------------------------------------------------
// Markdown output
// ---------------------------------------------------------------------------

export function renderMarkdown(
  nameGroups: Array<[string, DeclarationRecord[]]>,
  shapeGroups: Array<[string, DeclarationRecord[]]>,
  meta: ReportMeta,
): string {
  const lines: string[] = [];

  // Header
  if (meta.duplicateCount > 0) {
    lines.push("# 🔍 Duplicate Types Report");
    lines.push("");
    lines.push(
      `> **${meta.duplicateCount} duplicate group(s) found** across ${meta.filesScanned} files (${meta.declarationsScanned} declarations)`,
    );
  } else {
    lines.push("# ✅ Duplicate Types Report");
    lines.push("");
    lines.push(
      `> **No duplicates found** across ${meta.filesScanned} files (${meta.declarationsScanned} declarations)`,
    );
  }

  lines.push("");

  // Summary table
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Files scanned | ${meta.filesScanned} |`);
  lines.push(`| Declarations found | ${meta.declarationsScanned} |`);
  lines.push(`| Source | ${meta.fileSource} |`);
  if (meta.mode === "name" || meta.mode === "both") {
    lines.push(`| Duplicate name groups | ${nameGroups.length} |`);
  }
  if (meta.mode === "shape" || meta.mode === "both") {
    lines.push(`| Duplicate shape groups | ${shapeGroups.length} |`);
  }
  lines.push("");

  // Name duplicates
  if (meta.mode === "name" || meta.mode === "both") {
    lines.push("## Duplicate Type Names");
    lines.push("");

    if (nameGroups.length === 0) {
      lines.push("✅ No duplicate names found.");
      lines.push("");
    } else {
      for (const [name, items] of nameGroups) {
        lines.push(`### \`${name}\` (${items.length} occurrences)`);
        lines.push("");
        lines.push("| Kind | File | Line |");
        lines.push("| --- | --- | --- |");
        for (const item of items) {
          lines.push(`| \`${item.kind}\` | \`${item.file}\` | ${item.line} |`);
        }
        lines.push("");
      }
    }
  }

  // Shape duplicates
  if (meta.mode === "shape" || meta.mode === "both") {
    lines.push("## Duplicate Type Shapes");
    lines.push("");

    if (shapeGroups.length === 0) {
      lines.push("✅ No duplicate shapes found.");
      lines.push("");
    } else {
      let shapeIndex = 0;
      for (const [, items] of shapeGroups) {
        shapeIndex++;
        const names = [...new Set(items.map((i) => i.name))];
        const namesBadge = names.map((n) => `\`${n}\``).join(", ");

        lines.push(
          `### Shape #${shapeIndex} — ${namesBadge} (${items.length} occurrences)`,
        );
        lines.push("");
        lines.push("| Kind | Name | File | Line |");
        lines.push("| --- | --- | --- | --- |");
        for (const item of items) {
          lines.push(
            `| \`${item.kind}\` | \`${item.name}\` | \`${item.file}\` | ${item.line} |`,
          );
        }
        lines.push("");

        const representative = items[0];
        if (representative) {
          lines.push("<details>");
          lines.push("<summary>Shape preview</summary>");
          lines.push("");
          lines.push("```typescript");
          lines.push(representative.snippet);
          lines.push("```");
          lines.push("</details>");
          lines.push("");
        }
      }
    }
  }

  // Footer
  lines.push("---");
  lines.push(
    "*Generated by [typehunt](https://github.com/CihanBir7/typehunt)*",
  );
  lines.push("");

  return lines.join("\n");
}

import path from "node:path";
import ts from "typescript";

import type { DeclarationKind, DeclarationRecord } from "./types.js";
import {
  escapeRegExp,
  formatSnippet,
  normalizeWhitespace,
  toPosix,
} from "./utils.js";

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

/**
 * Create a normalised shape string for duplicate comparison.
 * - Strips comments & whitespace
 * - Replaces the declaration name with `__NAME__` (globally)
 * - Normalises `interface` vs `type` keyword differences
 */
export function normalizeShape(rawSnippet: string, name: string): string {
  let compact = normalizeWhitespace(rawSnippet);

  // Replace ALL occurrences of the declaration name
  const namedPattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  compact = compact.replace(namedPattern, "__NAME__");

  // Normalise interface ↔ type for shape comparison
  compact = compact.replace(/\binterface\s+__NAME__\s*\{/, "type __NAME__ = {");

  // Strip optional `export` keyword (shouldn't affect shape)
  compact = compact.replace(/^export\s+/, "");

  // Normalise `const enum` → `enum`
  compact = compact.replace(/\bconst\s+enum\b/, "enum");

  // Strip trailing semicolons
  compact = compact.replace(/\s*;\s*$/, "");

  return compact;
}

// ---------------------------------------------------------------------------
// Property extraction
// ---------------------------------------------------------------------------

function extractPropertyNames(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): string[] {
  const names: string[] = [];

  if (ts.isInterfaceDeclaration(node)) {
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        names.push(member.name.getText(sourceFile));
      }
    }
  } else if (
    ts.isTypeAliasDeclaration(node) &&
    node.type &&
    ts.isTypeLiteralNode(node.type)
  ) {
    for (const member of node.type.members) {
      if (ts.isPropertySignature(member) && member.name) {
        names.push(member.name.getText(sourceFile));
      }
    }
  } else if (ts.isEnumDeclaration(node)) {
    for (const member of node.members) {
      if (member.name) {
        names.push(member.name.getText(sourceFile));
      }
    }
  }

  return names.sort();
}

// ---------------------------------------------------------------------------
// Re-export detection
// ---------------------------------------------------------------------------

/**
 * Collect names that are re-exported from other modules in a given file.
 *
 * Patterns detected:
 * - `export { Foo } from "./bar";`
 * - `export { Foo as Bar } from "./bar";`
 * - `export type { Foo } from "./bar";`
 */
function collectReExportRecords(
  sourceFile: ts.SourceFile,
  sourceText: string,
  relativeFile: string,
): DeclarationRecord[] {
  const records: DeclarationRecord[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier) continue;

    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue; // ignore `export * from "..."`
    }

    const stmtSnippet = sourceText.slice(
      statement.getStart(sourceFile),
      statement.end,
    );

    for (const el of statement.exportClause.elements) {
      const exportedName = el.name.text;

      records.push({
        name: exportedName,
        kind: "reexport",
        file: relativeFile,
        line: getLine(sourceFile, statement),
        snippet: formatSnippet(stmtSnippet),
        normalizedShape: normalizeShape(stmtSnippet, exportedName),
        isReExport: true,
        propertyCount: 0,
        propertyNames: [],
      });
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Declaration collection (single file)
// ---------------------------------------------------------------------------

export function collectDeclarations(
  file: string,
  sourceText: string,
  options: { includeEnums: boolean },
): DeclarationRecord[] {
  const scriptKind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const records: DeclarationRecord[] = [];
  const relativeFile = toPosix(path.relative(process.cwd(), file));

  records.push(...collectReExportRecords(sourceFile, sourceText, relativeFile));

  function visit(node: ts.Node): void {
    let kind: DeclarationKind | null = null;
    let name: string | null = null;

    if (ts.isInterfaceDeclaration(node)) {
      kind = "interface";
      name = node.name.text;
    } else if (ts.isTypeAliasDeclaration(node)) {
      kind = "type";
      name = node.name.text;
    } else if (ts.isEnumDeclaration(node) && options.includeEnums) {
      kind = "enum";
      name = node.name.text;
    }

    if (kind && name) {
      const snippet = sourceText.slice(node.getStart(sourceFile), node.end);
      const propertyNames = extractPropertyNames(node, sourceFile);

      records.push({
        name,
        kind,
        file: relativeFile,
        line: getLine(sourceFile, node),
        snippet: formatSnippet(snippet),
        normalizedShape: normalizeShape(snippet, name),
        isReExport: false,
        propertyCount: propertyNames.length,
        propertyNames,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return records;
}

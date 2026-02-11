#!/usr/bin/env node

// src/cli.ts
import { promises as fs2 } from "fs";
import path4 from "path";

// src/analyzer.ts
import path2 from "path";
import ts from "typescript";

// src/utils.ts
import path from "path";

// src/constants.ts
var TYPE_EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".tsx", ".mts", ".d.ts"]);
var DEFAULT_IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo"
]);
var MAX_SNIPPET_LENGTH = 200;
var MAX_PREVIEW_LENGTH = 120;
var MAX_DISPLAYED_ERRORS = 5;
var FILE_READ_CONCURRENCY = 50;

// src/utils.ts
function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}
function matchesExclude(relPathPosix, patterns) {
  if (patterns.length === 0) return false;
  const rel = relPathPosix.replace(/^\.\/+/, "");
  return patterns.some((raw) => {
    const p = raw.trim().replace(/^\.\/+/, "");
    if (!p) return false;
    return rel === p || rel.startsWith(`${p}/`) || rel.includes(p);
  });
}
function normalizeWhitespace(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ").replace(/\s+/g, " ").trim();
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function formatSnippet(rawSnippet, maxLength = MAX_SNIPPET_LENGTH) {
  const compact = normalizeWhitespace(rawSnippet);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}
function groupBy(items, keyFn) {
  const map = /* @__PURE__ */ new Map();
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
function filterDuplicateGroups(groups, minCount) {
  return [...groups.entries()].filter(([, items]) => items.length >= minCount).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

// src/analyzer.ts
function getLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
function normalizeShape(rawSnippet, name) {
  let compact = normalizeWhitespace(rawSnippet);
  const namedPattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  compact = compact.replace(namedPattern, "__NAME__");
  compact = compact.replace(/\binterface\s+__NAME__\s*\{/, "type __NAME__ = {");
  compact = compact.replace(/^export\s+/, "");
  compact = compact.replace(/\bconst\s+enum\b/, "enum");
  compact = compact.replace(/\s*;\s*$/, "");
  return compact;
}
function extractPropertyNames(node, sourceFile) {
  const names = [];
  if (ts.isInterfaceDeclaration(node)) {
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        names.push(member.name.getText(sourceFile));
      }
    }
  } else if (ts.isTypeAliasDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type)) {
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
function collectReExportRecords(sourceFile, sourceText, relativeFile) {
  const records = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    const stmtSnippet = sourceText.slice(
      statement.getStart(sourceFile),
      statement.end
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
        propertyNames: []
      });
    }
  }
  return records;
}
function collectDeclarations(file, sourceText, options) {
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const records = [];
  const relativeFile = toPosix(path2.relative(process.cwd(), file));
  records.push(...collectReExportRecords(sourceFile, sourceText, relativeFile));
  function visit(node) {
    let kind = null;
    let name = null;
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
        propertyNames
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return records;
}

// src/types.ts
var MODES = ["name", "shape", "both"];
var OUTPUT_FORMATS = ["text", "json", "markdown"];

// src/args.ts
function readStringArg(argv, index, flag) {
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
function readEnumArg(argv, index, flag, allowed) {
  const result = readStringArg(argv, index, flag);
  if (!result) return null;
  if (!allowed.includes(result.value)) {
    throw new Error(
      `Invalid value for ${flag}: ${result.value}. Expected: ${allowed.join(", ")}`
    );
  }
  return { value: result.value, nextIndex: result.nextIndex };
}
function parseArgs(argv) {
  const options = {
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
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
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
    const formatResult = readEnumArg(
      argv,
      i,
      "--format",
      OUTPUT_FORMATS
    );
    if (formatResult) {
      options.format = formatResult.value;
      i = formatResult.nextIndex;
      continue;
    }
    const modeResult = readEnumArg(argv, i, "--mode", MODES);
    if (modeResult) {
      options.mode = modeResult.value;
      i = modeResult.nextIndex;
      continue;
    }
    const outputResult = readStringArg(argv, i, "--output") ?? readStringArg(argv, i, "--out");
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
    const excludeResult = readStringArg(argv, i, "--exclude");
    if (excludeResult) {
      options.exclude.push(...excludeResult.value.split(","));
      i = excludeResult.nextIndex;
      continue;
    }
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
function printHelp() {
  console.log(`typehunt \u2014 Find duplicate type definitions across your TypeScript codebase

Usage:
  npx typehunt [options]

Options:
  --root <path>             Root directory to scan (default: src)
  --tsconfig <path>         Path to tsconfig.json \u2014 respects include/exclude
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

// src/formatter.ts
function printNameReport(groups) {
  console.log("\n\u2500\u2500 Duplicate type names \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  if (groups.length === 0) {
    console.log("  \u2713 No duplicates found");
    return;
  }
  for (const [name, items] of groups) {
    console.log(`
  ${name} (${items.length} occurrences)`);
    for (const item of items) {
      console.log(`    ${item.kind.padEnd(9)}  ${item.file}:${item.line}`);
    }
  }
}
function printShapeReport(groups) {
  console.log("\n\u2500\u2500 Duplicate type shapes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  if (groups.length === 0) {
    console.log("  \u2713 No duplicates found");
    return;
  }
  let shapeIndex = 0;
  for (const [, items] of groups) {
    shapeIndex++;
    const names = [...new Set(items.map((i) => i.name))].join(", ");
    console.log(
      `
  shape#${shapeIndex} \u2014 names: ${names} (${items.length} occurrences)`
    );
    for (const item of items) {
      console.log(
        `    ${item.kind.padEnd(9)}  ${item.name.padEnd(24)}  ${item.file}:${item.line}`
      );
    }
    const representative = items[0];
    if (representative) {
      const preview = representative.snippet.length > MAX_PREVIEW_LENGTH ? `${representative.snippet.slice(0, MAX_PREVIEW_LENGTH - 3)}...` : representative.snippet;
      console.log(`    shape:   ${preview}`);
    }
  }
}
function printTextReport(nameGroups, shapeGroups, meta) {
  console.log("\n\u2500\u2500 Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log(`  Files scanned:          ${meta.filesScanned}`);
  console.log(`  Declarations found:     ${meta.declarationsScanned}`);
  console.log(`  Source:                 ${meta.fileSource}`);
  if (meta.mode === "name" || meta.mode === "both") {
    console.log(`  Duplicate name groups:  ${nameGroups.length}`);
  }
  if (meta.mode === "shape" || meta.mode === "both") {
    console.log(`  Duplicate shape groups: ${shapeGroups.length}`);
  }
  console.log("");
  if (meta.mode === "name" || meta.mode === "both") {
    printNameReport(nameGroups);
  }
  if (meta.mode === "shape" || meta.mode === "both") {
    printShapeReport(shapeGroups);
  }
}
function buildJsonPayload(nameGroups, shapeGroups, meta, mode) {
  const mapDeclarations = (items) => items.map((item) => ({
    file: item.file,
    line: item.line,
    kind: item.kind,
    name: item.name,
    snippet: item.snippet,
    isReExport: item.isReExport
  }));
  return {
    root: meta.root,
    mode,
    fileSource: meta.fileSource,
    filesScanned: meta.filesScanned,
    declarationsScanned: meta.declarationsScanned,
    duplicateNameGroups: mode === "shape" ? [] : nameGroups.map(([name, items]) => ({
      name,
      count: items.length,
      declarations: mapDeclarations(items)
    })),
    duplicateShapeGroups: mode === "name" ? [] : shapeGroups.map(([shape, items]) => ({
      shape,
      count: items.length,
      declarations: mapDeclarations(items)
    })),
    errors: meta.errors && meta.errors.length > 0 ? meta.errors : void 0
  };
}
function renderMarkdown(nameGroups, shapeGroups, meta) {
  const lines = [];
  if (meta.duplicateCount > 0) {
    lines.push("# \u{1F50D} Duplicate Types Report");
    lines.push("");
    lines.push(
      `> **${meta.duplicateCount} duplicate group(s) found** across ${meta.filesScanned} files (${meta.declarationsScanned} declarations)`
    );
  } else {
    lines.push("# \u2705 Duplicate Types Report");
    lines.push("");
    lines.push(
      `> **No duplicates found** across ${meta.filesScanned} files (${meta.declarationsScanned} declarations)`
    );
  }
  lines.push("");
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
  if (meta.mode === "name" || meta.mode === "both") {
    lines.push("## Duplicate Type Names");
    lines.push("");
    if (nameGroups.length === 0) {
      lines.push("\u2705 No duplicate names found.");
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
  if (meta.mode === "shape" || meta.mode === "both") {
    lines.push("## Duplicate Type Shapes");
    lines.push("");
    if (shapeGroups.length === 0) {
      lines.push("\u2705 No duplicate shapes found.");
      lines.push("");
    } else {
      let shapeIndex = 0;
      for (const [, items] of shapeGroups) {
        shapeIndex++;
        const names = [...new Set(items.map((i) => i.name))];
        const namesBadge = names.map((n) => `\`${n}\``).join(", ");
        lines.push(
          `### Shape #${shapeIndex} \u2014 ${namesBadge} (${items.length} occurrences)`
        );
        lines.push("");
        lines.push("| Kind | Name | File | Line |");
        lines.push("| --- | --- | --- | --- |");
        for (const item of items) {
          lines.push(
            `| \`${item.kind}\` | \`${item.name}\` | \`${item.file}\` | ${item.line} |`
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
  lines.push("---");
  lines.push(
    "*Generated by [typehunt](https://github.com/cihanbir7/typehunt)*"
  );
  lines.push("");
  return lines.join("\n");
}

// src/scanner.ts
import { promises as fs } from "fs";
import path3 from "path";
import ts2 from "typescript";
async function getTypeFilesFromDirectory(rootDir, extraExclude) {
  const results = [];
  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path3.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) continue;
      const rel = toPosix(path3.relative(process.cwd(), fullPath));
      if (entry.isDirectory() && DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
      if (matchesExclude(rel, extraExclude)) continue;
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".d.ts")) {
        results.push(fullPath);
        continue;
      }
      const ext = path3.extname(entry.name);
      if (TYPE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return results;
}
function getTypeFilesFromTsConfig(tsconfigPath) {
  const absolutePath = path3.resolve(process.cwd(), tsconfigPath);
  const configDir = path3.dirname(absolutePath);
  const configFileText = ts2.sys.readFile(absolutePath);
  if (!configFileText) {
    throw new Error(`Cannot read tsconfig file: ${tsconfigPath}`);
  }
  const { config, error } = ts2.parseConfigFileTextToJson(
    absolutePath,
    configFileText
  );
  if (error) {
    const message = ts2.flattenDiagnosticMessageText(error.messageText, "\n");
    throw new Error(`Failed to parse ${tsconfigPath}: ${message}`);
  }
  const parsed = ts2.parseJsonConfigFileContent(
    config,
    ts2.sys,
    configDir,
    void 0,
    absolutePath
  );
  if (parsed.errors.length > 0) {
    const messages = parsed.errors.map((d) => ts2.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    console.error(`tsconfig warnings:
${messages}`);
  }
  return parsed.fileNames.filter((f) => {
    if (f.endsWith(".d.ts")) return true;
    const ext = path3.extname(f);
    return TYPE_EXTENSIONS.has(ext);
  });
}

// src/cli.ts
async function collectAllDeclarations(files, options) {
  const declarations = [];
  const errors = [];
  for (let offset = 0; offset < files.length; offset += FILE_READ_CONCURRENCY) {
    const batch = files.slice(offset, offset + FILE_READ_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const sourceText = await fs2.readFile(file, "utf8");
          return {
            ok: true,
            file,
            records: collectDeclarations(file, sourceText, options)
          };
        } catch (err) {
          return {
            ok: false,
            file: toPosix(path4.relative(process.cwd(), file)),
            error: err instanceof Error ? err.message : String(err)
          };
        }
      })
    );
    for (const result of results) {
      if (result.ok) {
        declarations.push(...result.records);
      } else {
        errors.push({ file: result.file, error: result.error });
      }
    }
  }
  return { declarations, errors };
}
async function writeOutputFile(outputFile, content, label) {
  const outputPath = path4.resolve(process.cwd(), outputFile);
  await fs2.mkdir(path4.dirname(outputPath), { recursive: true });
  await fs2.writeFile(outputPath, content, "utf8");
  console.error(
    `Saved ${label} report to ${toPosix(path4.relative(process.cwd(), outputPath))}`
  );
}
async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  let files;
  let fileSource;
  if (options.tsconfig) {
    files = getTypeFilesFromTsConfig(options.tsconfig);
    fileSource = `tsconfig (${options.tsconfig})`;
    if (options.exclude.length > 0) {
      files = files.filter((f) => {
        const rel = toPosix(path4.relative(process.cwd(), f));
        return !matchesExclude(rel, options.exclude);
      });
    }
  } else {
    const rootPath = path4.resolve(process.cwd(), options.root);
    const stat = await fs2.stat(rootPath).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(
        `Root path does not exist or is not a directory: ${options.root}`
      );
    }
    files = await getTypeFilesFromDirectory(rootPath, options.exclude);
    fileSource = `directory walk (${options.root})`;
  }
  if (files.length === 0) {
    if (options.format === "text") {
      console.log("No TypeScript files found to scan.");
    }
    return 0;
  }
  const { declarations, errors } = await collectAllDeclarations(files, {
    includeEnums: options.includeEnums
  });
  if (errors.length > 0 && options.format === "text") {
    console.error(`
\u26A0 Skipped ${errors.length} file(s) with read errors:`);
    for (const { file, error } of errors.slice(0, MAX_DISPLAYED_ERRORS)) {
      console.error(`  ${file}: ${error}`);
    }
    if (errors.length > MAX_DISPLAYED_ERRORS) {
      console.error(`  ... and ${errors.length - MAX_DISPLAYED_ERRORS} more`);
    }
  }
  const effectiveDeclarations = options.skipReExports ? declarations.filter((d) => !d.isReExport) : declarations;
  const nameGroups = filterDuplicateGroups(
    groupBy(effectiveDeclarations, (d) => d.name),
    options.minCount
  );
  const shapeGroups = filterDuplicateGroups(
    groupBy(effectiveDeclarations, (d) => d.normalizedShape),
    options.minCount
  );
  const duplicateCount = (options.mode === "name" || options.mode === "both" ? nameGroups.length : 0) + (options.mode === "shape" || options.mode === "both" ? shapeGroups.length : 0);
  const meta = {
    filesScanned: files.length,
    declarationsScanned: effectiveDeclarations.length,
    mode: options.mode,
    fileSource,
    duplicateCount
  };
  if (options.format === "json") {
    const payload = buildJsonPayload(
      nameGroups,
      shapeGroups,
      { ...meta, root: options.tsconfig ?? options.root, errors },
      options.mode
    );
    const renderedJson = `${JSON.stringify(payload, null, 2)}
`;
    if (options.outputFile) {
      await writeOutputFile(options.outputFile, renderedJson, "JSON");
    }
    process.stdout.write(renderedJson);
  } else if (options.format === "markdown") {
    const md = renderMarkdown(nameGroups, shapeGroups, meta);
    if (options.outputFile) {
      await writeOutputFile(options.outputFile, md, "Markdown");
    }
    process.stdout.write(md);
  } else {
    printTextReport(nameGroups, shapeGroups, meta);
    if (options.outputFile) {
      const payload = buildJsonPayload(
        nameGroups,
        shapeGroups,
        { ...meta, root: options.tsconfig ?? options.root, errors },
        options.mode
      );
      const renderedJson = `${JSON.stringify(payload, null, 2)}
`;
      await writeOutputFile(options.outputFile, renderedJson, "JSON");
    }
  }
  if (options.failOnDuplicates && duplicateCount > 0) {
    if (options.format === "text") {
      console.log(
        `
\u2717 Found ${duplicateCount} duplicate group(s). Exiting with code 1.`
      );
    }
    return 1;
  }
  return 0;
}
run().then((code) => {
  if (code !== 0) process.exit(code);
}).catch((error) => {
  console.error(
    `typehunt failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});

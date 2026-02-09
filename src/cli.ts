#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

import { collectDeclarations } from "./analyzer.js";
import { parseArgs, printHelp } from "./args.js";
import { FILE_READ_CONCURRENCY, MAX_DISPLAYED_ERRORS } from "./constants.js";
import {
  buildJsonPayload,
  printTextReport,
  renderMarkdown,
} from "./formatter.js";
import {
  getTypeFilesFromDirectory,
  getTypeFilesFromTsConfig,
} from "./scanner.js";
import type { DeclarationRecord, FileError } from "./types.js";
import {
  filterDuplicateGroups,
  groupBy,
  matchesExclude,
  toPosix,
} from "./utils.js";

// ---------------------------------------------------------------------------
// Parallel file reading
// ---------------------------------------------------------------------------

/**
 * Read and analyse files in parallel batches to avoid exhausting file
 * descriptors while still being significantly faster than sequential reads.
 */
async function collectAllDeclarations(
  files: string[],
  options: { includeEnums: boolean },
): Promise<{ declarations: DeclarationRecord[]; errors: FileError[] }> {
  const declarations: DeclarationRecord[] = [];
  const errors: FileError[] = [];

  for (let offset = 0; offset < files.length; offset += FILE_READ_CONCURRENCY) {
    const batch = files.slice(offset, offset + FILE_READ_CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const sourceText = await fs.readFile(file, "utf8");
          return {
            ok: true as const,
            file,
            records: collectDeclarations(file, sourceText, options),
          };
        } catch (err) {
          return {
            ok: false as const,
            file: toPosix(path.relative(process.cwd(), file)),
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
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

// ---------------------------------------------------------------------------
// Output writing helper
// ---------------------------------------------------------------------------

async function writeOutputFile(
  outputFile: string,
  content: string,
  label: string,
): Promise<void> {
  const outputPath = path.resolve(process.cwd(), outputFile);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, "utf8");
  console.error(
    `Saved ${label} report to ${toPosix(path.relative(process.cwd(), outputPath))}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return 0;
  }

  // ── File discovery ────────────────────────────────────────────────────
  let files: string[];
  let fileSource: string;

  if (options.tsconfig) {
    files = getTypeFilesFromTsConfig(options.tsconfig);
    fileSource = `tsconfig (${options.tsconfig})`;

    if (options.exclude.length > 0) {
      files = files.filter((f) => {
        const rel = toPosix(path.relative(process.cwd(), f));
        return !matchesExclude(rel, options.exclude);
      });
    }
  } else {
    const rootPath = path.resolve(process.cwd(), options.root);
    const stat = await fs.stat(rootPath).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new Error(
        `Root path does not exist or is not a directory: ${options.root}`,
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

  // ── Collect declarations (parallel batches) ───────────────────────────
  const { declarations, errors } = await collectAllDeclarations(files, {
    includeEnums: options.includeEnums,
  });

  if (errors.length > 0 && options.format === "text") {
    console.error(`\n⚠ Skipped ${errors.length} file(s) with read errors:`);
    for (const { file, error } of errors.slice(0, MAX_DISPLAYED_ERRORS)) {
      console.error(`  ${file}: ${error}`);
    }
    if (errors.length > MAX_DISPLAYED_ERRORS) {
      console.error(`  ... and ${errors.length - MAX_DISPLAYED_ERRORS} more`);
    }
  }

  // ── Filter re-exports ────────────────────────────────────────────────
  const effectiveDeclarations = options.skipReExports
    ? declarations.filter((d) => !d.isReExport)
    : declarations;

  // ── Group & filter ────────────────────────────────────────────────────
  const nameGroups = filterDuplicateGroups(
    groupBy(effectiveDeclarations, (d) => d.name),
    options.minCount,
  );
  const shapeGroups = filterDuplicateGroups(
    groupBy(effectiveDeclarations, (d) => d.normalizedShape),
    options.minCount,
  );

  // ── Compute duplicate count ───────────────────────────────────────────
  const duplicateCount =
    (options.mode === "name" || options.mode === "both"
      ? nameGroups.length
      : 0) +
    (options.mode === "shape" || options.mode === "both"
      ? shapeGroups.length
      : 0);

  const meta = {
    filesScanned: files.length,
    declarationsScanned: effectiveDeclarations.length,
    mode: options.mode,
    fileSource,
    duplicateCount,
  };

  // ── Output ────────────────────────────────────────────────────────────
  if (options.format === "json") {
    const payload = buildJsonPayload(
      nameGroups,
      shapeGroups,
      { ...meta, root: options.tsconfig ?? options.root, errors },
      options.mode,
    );
    const renderedJson = `${JSON.stringify(payload, null, 2)}\n`;

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
        options.mode,
      );
      const renderedJson = `${JSON.stringify(payload, null, 2)}\n`;
      await writeOutputFile(options.outputFile, renderedJson, "JSON");
    }
  }

  // ── Exit code for CI ──────────────────────────────────────────────────
  if (options.failOnDuplicates && duplicateCount > 0) {
    if (options.format === "text") {
      console.log(
        `\n✗ Found ${duplicateCount} duplicate group(s). Exiting with code 1.`,
      );
    }
    return 1;
  }

  return 0;
}

run()
  .then((code) => {
    if (code !== 0) process.exit(code);
  })
  .catch((error: unknown) => {
    console.error(
      `typehunt failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });

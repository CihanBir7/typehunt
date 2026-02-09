import { Dirent } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { DEFAULT_IGNORED_DIRS, TYPE_EXTENSIONS } from "./constants.js";
import { matchesExclude, toPosix } from "./utils.js";

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Walk a directory tree and collect TypeScript source file paths.
 * Used when `--tsconfig` is NOT provided.
 */
export async function getTypeFilesFromDirectory(
  rootDir: string,
  extraExclude: string[],
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isSymbolicLink()) continue;

      const rel = toPosix(path.relative(process.cwd(), fullPath));

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

      const ext = path.extname(entry.name);
      if (TYPE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

/**
 * Use `tsconfig.json` to resolve the file list.
 * This respects `include`, `exclude`, `files`, and `extends`.
 */
export function getTypeFilesFromTsConfig(tsconfigPath: string): string[] {
  const absolutePath = path.resolve(process.cwd(), tsconfigPath);
  const configDir = path.dirname(absolutePath);

  const configFileText = ts.sys.readFile(absolutePath);
  if (!configFileText) {
    throw new Error(`Cannot read tsconfig file: ${tsconfigPath}`);
  }

  const { config, error } = ts.parseConfigFileTextToJson(
    absolutePath,
    configFileText,
  );
  if (error) {
    const message = ts.flattenDiagnosticMessageText(error.messageText, "\n");
    throw new Error(`Failed to parse ${tsconfigPath}: ${message}`);
  }

  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    configDir,
    undefined,
    absolutePath,
  );

  if (parsed.errors.length > 0) {
    const messages = parsed.errors
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("\n");
    console.error(`tsconfig warnings:\n${messages}`);
  }

  return parsed.fileNames.filter((f) => {
    if (f.endsWith(".d.ts")) return true;
    const ext = path.extname(f);
    return TYPE_EXTENSIONS.has(ext);
  });
}

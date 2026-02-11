# TypeHunt

[![npm version](https://img.shields.io/npm/v/typehunt.svg)](https://www.npmjs.com/package/typehunt)
[![license](https://img.shields.io/npm/l/typehunt.svg)](https://github.com/CihanBir7/typehunt/blob/main/LICENSE)

Hunt down duplicate **TypeScript declarations** — `type`, `interface`, and `enum` — across your codebase.

TypeHunt scans your source files, extracts declarations via the TypeScript Compiler API, and reports duplicates by:

- **Name**: the same identifier declared in multiple files
- **Shape**: structurally identical declarations hiding behind different names

> **Node.js 18+** required

---

## Install

```bash
# Add to your project (recommended)
npm i -D typehunt

# Or install globally
npm i -g typehunt
```

---

## Quick Start

```bash
# Scan the src/ directory (default)
npx typehunt

# Use your tsconfig to determine which files to scan (respects include/exclude/extends)
npx typehunt --tsconfig tsconfig.json

# Output as JSON (great for tooling)
npx typehunt --json

# Generate a Markdown report (PR-friendly)
npx typehunt --md --output report.md

# Fail in CI when duplicates are found
npx typehunt --fail-on-duplicates
```

---

## How It Works

TypeHunt parses `.ts`, `.tsx`, `.mts`, and `.d.ts` files and extracts declarations. It then groups them in two ways:

### Name matching

Finds declarations with the **same identifier** declared in multiple files.

### Shape matching

Finds declarations that are **structurally identical** even if they have different names.

The comparison normalizes whitespace, strips comments, replaces the name with a placeholder, and normalizes `interface` ↔ `type` shape differences.

Example that will be detected as the same **shape**:

```ts
// src/models/user.ts
interface UserResponse {
  id: string;
  name: string;
  email: string;
}

// src/api/types.ts
type UserDTO = {
  id: string;
  name: string;
  email: string;
};
```

---

## Example Output

```
── Summary ──────────────────────────────────────────────
  Files scanned:          124
  Declarations found:     312
  Source:                 directory walk (src)
  Duplicate name groups:  3
  Duplicate shape groups: 5

── Duplicate type names ──────────────────────────────────

  User (3 occurrences)
    interface  src/models/user.ts:5
    interface  src/api/types.ts:12
    type       src/shared/types.ts:28

── Duplicate type shapes ─────────────────────────────────

  shape#1 — names: UserResponse, UserDTO (2 occurrences)
    interface  UserResponse              src/models/user.ts:5
    type       UserDTO                   src/api/types.ts:12
    shape:   type __NAME__ = { id: string; name: string; email: string; }
```

---

## CLI Options

```
Usage:
  npx typehunt [options]

Options:
  --root <path>                  Root directory to scan (default: src)
  --tsconfig <path>              Path to tsconfig.json — respects include/exclude
  --mode <name|shape|both>       Duplicate detection mode (default: both)
  --min <number>                 Minimum duplicates per group (default: 2)

  --exclude <token,...>          Exclude by matching tokens against relative paths (repeatable).
                                 Match rules: equals, prefix (token/...), or substring.

  --no-enums                     Skip enum declarations
  --include-reexports            Include re-exports (excluded by default)

  --format <text|json|markdown>  Output format (default: text)
  --json                         Shortcut for --format json
  --markdown, --md               Shortcut for --format markdown
  --output <path>                Save output to a file

  --fail-on-duplicates           Exit with code 1 when duplicates are found
  --help, -h                     Show this help
```

---

## Output Formats

### Text (default)

Readable output printed to the terminal.

### JSON

```bash
npx typehunt --json
```

Useful for programmatic consumption (dashboards, CI annotations, custom checks).

```json
{
  "filesScanned": 124,
  "declarationsScanned": 312,
  "duplicateNameGroups": [
    {
      "name": "User",
      "count": 3,
      "declarations": [
        {
          "file": "src/models/user.ts",
          "line": 5,
          "kind": "interface",
          "name": "User",
          "isReExport": false
        }
      ]
    }
  ]
}
```

### Markdown

```bash
npx typehunt --md --output report.md
```

Generates a formatted report with tables — perfect for PRs and internal docs.

---

## CI Integration

Use `--fail-on-duplicates` to make TypeHunt exit with code **1** when duplicates are detected:

```yaml
# GitHub Actions example
- name: Check for duplicate TypeScript declarations
  run: npx typehunt --fail-on-duplicates
```

---

## Excluding Files

The `--exclude` flag accepts comma-separated tokens (and is repeatable). A file is excluded if any token matches its relative path by **exact match**, **prefix**, or **substring**:

```bash
# Exclude generated code and vendor directories
npx typehunt --exclude generated,vendor

# Repeatable flag
npx typehunt --exclude generated --exclude __tests__
```

When using `--tsconfig`, the tsconfig's own `include`/`exclude` rules are applied first, then `--exclude` filters further.

---

## Re-exports

By default, re-exports like `export { Foo } from "./bar"` are excluded because they don't introduce new declarations and can add noise in "barrel export" codebases.

Use `--include-reexports` if you want to include them in analysis.

---

## License

[MIT](LICENSE)

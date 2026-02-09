# typehunt

Find duplicate `type`, `interface`, and `enum` definitions across your TypeScript codebase.

typehunt scans your source files, extracts every type declaration, and reports duplicates by **name** (same identifier declared in multiple files) and by **shape** (structurally identical types hiding behind different names).

## Install

```bash
npm install -g typehunt
```

Or run directly with npx:

```bash
npx typehunt
```

## Quick Start

```bash
# Scan the src/ directory (default)
npx typehunt

# Use your tsconfig to determine which files to scan
npx typehunt --tsconfig tsconfig.json

# Output as JSON
npx typehunt --json

# Fail in CI when duplicates are found
npx typehunt --fail-on-duplicates
```

## How It Works

typehunt uses the TypeScript compiler API to parse every `.ts`, `.tsx`, `.mts`, and `.d.ts` file and extract declarations. It then groups them in two ways:

### Name matching

Finds types with the **same identifier** declared in multiple files. For example, two files both exporting `interface User { ... }`.

### Shape matching

Finds types that are **structurally identical** even if they have different names. The comparison normalizes whitespace, strips comments, replaces the type name with a placeholder, and unifies `interface` / `type` syntax differences. This catches cases like:

```typescript
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

## CLI Options

```
Usage:
  npx typehunt [options]

Options:
  --root <path>                  Root directory to scan (default: src)
  --tsconfig <path>              Path to tsconfig.json — respects include/exclude
  --mode <name|shape|both>       Duplicate detection mode (default: both)
  --min <number>                 Minimum duplicates per group (default: 2)
  --exclude <token,...>          Exclude paths matching the given tokens (repeatable)
  --no-enums                     Skip enum declarations
  --include-reexports            Include re-exports (excluded by default)
  --format <text|json|markdown>  Output format (default: text)
  --json                         Shortcut for --format json
  --markdown, --md               Shortcut for --format markdown
  --output <path>                Save output to a file
  --fail-on-duplicates           Exit with code 1 when duplicates are found
  --help, -h                     Show this help
```

## Output Formats

### Text (default)

Human-readable output printed to the terminal.

### JSON

```bash
npx typehunt --json
```

Structured output for programmatic consumption. Includes full metadata, all duplicate groups, and declaration snippets.

### Markdown

```bash
npx typehunt --md --output report.md
```

A formatted report with tables — useful for pasting into PRs or documentation.

## CI Integration

Use `--fail-on-duplicates` to make typehunt exit with code 1 when duplicates are detected:

```yaml
# GitHub Actions example
- name: Check for duplicate types
  run: npx typehunt --fail-on-duplicates
```

## Excluding Files

The `--exclude` flag accepts comma-separated tokens. A file is excluded if any token matches its relative path by exact match, prefix, or substring:

```bash
# Exclude generated code and vendor directories
npx typehunt --exclude generated,vendor

# Exclude multiple patterns (flag is repeatable)
npx typehunt --exclude generated --exclude __tests__
```

When using `--tsconfig`, the tsconfig's own `include`/`exclude` rules are applied first, then `--exclude` filters further.

## Re-exports

By default, re-exports like `export { Foo } from "./bar"` are excluded from the analysis since they don't introduce new type definitions. Use `--include-reexports` to include them.

## License

[MIT](LICENSE)

// ---------------------------------------------------------------------------
// Shared type definitions
// ---------------------------------------------------------------------------

export const MODES = ["name", "shape", "both"] as const;
export type Mode = (typeof MODES)[number];

export const OUTPUT_FORMATS = ["text", "json", "markdown"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const DECLARATION_KINDS = [
  "interface",
  "type",
  "enum",
  "reexport",
] as const;
export type DeclarationKind = (typeof DECLARATION_KINDS)[number];

export interface DeclarationRecord {
  name: string;
  kind: DeclarationKind;
  file: string;
  line: number;
  snippet: string;
  normalizedShape: string;
  isReExport: boolean;
  propertyCount: number;
  propertyNames: string[];
}

export interface CliOptions {
  root: string;
  mode: Mode;
  minCount: number;
  format: OutputFormat;
  outputFile: string | null;
  failOnDuplicates: boolean;
  tsconfig: string | null;
  exclude: string[];
  includeEnums: boolean;
  skipReExports: boolean;
  help: boolean;
}

export interface FileError {
  file: string;
  error: string;
}

export interface ReportPayload {
  root: string;
  mode: Mode;
  fileSource: string;
  filesScanned: number;
  declarationsScanned: number;
  duplicateNameGroups: DuplicateGroup[];
  duplicateShapeGroups: DuplicateGroup[];
  errors?: FileError[] | undefined;
}

export interface DuplicateGroup {
  name?: string;
  shape?: string;
  count: number;
  declarations: DuplicateDeclaration[];
}

export interface DuplicateDeclaration {
  file: string;
  line: number;
  kind: DeclarationKind;
  name: string;
  snippet: string;
  isReExport: boolean;
}

export interface ReportMeta {
  filesScanned: number;
  declarationsScanned: number;
  mode: Mode;
  fileSource: string;
  duplicateCount: number;
}

# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [0.1.2]
### Fixed
- Write text output to file in text mode instead of JSON.
- Avoid printing full JSON/Markdown to stdout when `--output` is used.

### Added
- Text report renderer reused for stdout and file output.
- Tests for text report rendering.

### Changed
- Markdown footer link updated to the current repository owner.

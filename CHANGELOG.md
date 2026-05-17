# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [1.1.0] - 2026-05-17

### Added

- Added a local `stdio` MCP server implementation for the `claude-standard-dev-team` agent registry.
- Added `run_governed_workflow` and `run_full_workflow` for structured multi-agent execution.
- Added smoke tests and full integration tests for local validation.
- Added sample MCP configuration files for generic clients and Claude Desktop.
- Added `MIT` license.

### Changed

- Renamed the project to `FlowSpec MCP`.
- Reworked the README for GitHub publishing with a PRD-first positioning.
- Standardized sample configuration names to `flowspec-mcp`.
- Removed machine-specific paths and user-identifying information from publishable documentation.

### Verified

- Verified syntax checks with `npm test`.
- Verified full workflow integration with `npm run test:integration`.

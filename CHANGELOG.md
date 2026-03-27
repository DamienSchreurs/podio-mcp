# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.2] — 2026-03-27

### Fixed
- `update_item` no longer crashes with `"Cannot read properties of undefined (reading 'revision')"` when called with only `tags` and no `fields`. Podio returns an empty body for tag-only updates; the handler now uses optional chaining and falls back to `"N/A"` for the revision number.

---

## [1.1.1] — 2026-03-27

### Fixed
- Date field validation in `convertFieldValue()` now throws a clear error immediately when the time component (`HH:MM:SS`) is missing, instead of letting the invalid value reach the Podio API silently.
- `ManageTaskSchema` regex tightened: `due_date` now requires `"YYYY-MM-DD HH:MM:SS"` format. Previously the regex accepted date-only strings which the API would reject.
- `list_items` handler now detects string values in category filters and returns an actionable error pointing to `get_app_structure` for the correct option IDs, instead of passing the invalid value to the API.
- `update_item` `fields` parameter changed from required to optional, enabling tag-only updates without needing to include a dummy field change.

### Documentation
- **Date format**: All tool descriptions and examples updated to `"YYYY-MM-DD HH:MM:SS"`. Time component is required — date-only and ISO 8601 T-separator formats are not accepted by the Podio API.
- **Category filtering**: Documented that `list_items` category filters require integer option IDs in an array (e.g. `{"deal-stage": [1, 2]}`), not string labels. `get_app_structure` output now notes that option IDs are for use in `list_items` filters.
- **Required field auto-fill**: `create_item` now documents that Podio may auto-fill required text fields from linked relationship values when omitted. Always provide required fields explicitly to avoid unpredictable behaviour.
- **No delete_item**: Documented in README Limitations section. Workaround: prefix item titles with `DELETED-` for manual cleanup in the Podio UI.
- Added Troubleshooting section to README covering the three most common error patterns.

---

## [1.1.0] — 2026-03-27

### Added
- `dotenv` integration: credentials are now loaded from a `.env` file at startup using an absolute path derived from `import.meta.url`. The `.env` file no longer needs to be duplicated inside `claude_desktop_config.json`.
- `dotenv.config({ quiet: true })` suppresses dotenv v17 stdout output, which was corrupting the MCP stdio JSON-RPC channel.

### Security
- Input validation hardened across all tools (field values, query lengths, pagination limits).
- Request timeout set to 30 seconds per API call via `AbortController` to prevent hung connections.
- Error messages from the Podio API are filtered before being returned to the client — raw response bodies are never exposed.
- `.env` added to `.gitignore` to prevent accidental credential commits.

### Changed
- `claude_desktop_config.json` no longer requires an `env` block — credentials are read exclusively from `.env`.

---

## [1.0.0] — 2026-03-27 (initial fork baseline)

Initial release. MCP server with 11 tools covering Podio items, apps, workspaces, tasks, comments, notifications, and search.

---

## Validated Behaviours (77 tests, 93% pass rate — 2026-03-27)

| Behaviour | Detail |
|-----------|--------|
| Date format | `"YYYY-MM-DD HH:MM:SS"` required. `"YYYY-MM-DD"` fails. `"YYYY-MM-DDT..."` fails. |
| Category filters | Integer option IDs in array required (e.g. `[1, 2]`). String labels fail silently. |
| Required field auto-fill | Missing required text fields may auto-fill from linked relationship values. |
| No item deletion | `delete_item` is not implemented. Use Podio UI or prefix title with `DELETED-`. |
| Tag-only updates | `fields` is optional in `update_item` — tag-only updates are supported from v1.1.2. |
| Request timeout | 30 seconds per API request (not cumulative across a tool call). |

# Changelog

## [Unreleased]

### Fixed
- Date field validation in `convertFieldValue()` now throws a clear error immediately when the time component is missing, instead of letting the invalid value reach the Podio API.
- `ManageTaskSchema` regex tightened: `due_date` now requires `"YYYY-MM-DD HH:MM:SS"` format. Previously the regex accepted date-only strings which the API would reject.
- `list_items` handler now detects string values in category filters and returns an actionable error pointing to `get_app_structure` for option IDs, instead of passing the invalid value to the API.
- `update_item` `fields` parameter is now optional, enabling tag-only updates without needing to include a dummy field change.

### Documentation
- **Date format**: All examples updated to `"YYYY-MM-DD HH:MM:SS"`. Time component is required — date-only and ISO 8601 T-separator formats are not accepted by the Podio API.
- **Category filtering**: Documented that `list_items` category filters require integer option IDs in an array (e.g. `{"deal-stage": [1, 2]}`), not string labels. `get_app_structure` output now notes that option IDs are for use in `list_items` filters.
- **Required field auto-fill**: `create_item` now documents that Podio may auto-fill required text fields from linked relationship values when omitted. Always provide required fields explicitly.
- **No delete_item**: Documented in README Limitations section. Workaround: prefix items with `DELETED-` for manual cleanup.
- Added Troubleshooting section to README covering the three most common error patterns.

## Known Behaviours (validated by testing — 77 tests, 93% pass rate, 2026-03-27)

| Behaviour | Detail |
|-----------|--------|
| Date format | `"YYYY-MM-DD HH:MM:SS"` required. `"YYYY-MM-DD"` fails. `"YYYY-MM-DDT..."` fails. |
| Category filters | Integer option IDs in array required. String labels fail. |
| Required field auto-fill | Missing required text fields may auto-fill from linked relationship values. |
| No item deletion | `delete_item` is not implemented. Use Podio UI for deletion. |
| Tag-only updates | `fields` is now optional in `update_item` — tag-only updates are supported. |
| Request timeout | 30-second timeout per API request (not cumulative across a tool call). |

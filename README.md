# Podio MCP Server

An MCP (Model Context Protocol) server that gives AI agents access to the Podio API. Designed around what users want to accomplish, not around raw API endpoints.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` and fill in your Podio API credentials:

```bash
cp .env.example .env
```

You need a Podio API key from https://podio.com/settings/api. Set:

- `PODIO_CLIENT_ID` — your Podio API client ID
- `PODIO_CLIENT_SECRET` — your Podio API client secret
- `PODIO_USERNAME` — your Podio account email
- `PODIO_PASSWORD` — your Podio account password

### 3. Build

```bash
npm run build
```

### 4. Configure your MCP client

Add this to your MCP client configuration (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "podio": {
      "command": "node",
      "args": ["/absolute/path/to/podio-mcp/dist/index.js"]
    }
  }
}
```

Credentials are loaded automatically from the `.env` file at startup — no need to duplicate them in the client config.

## Tools (10 total)

| Tool | Purpose |
|------|---------|
| `search_podio` | Search across items, apps, and workspaces |
| `get_workspace_overview` | Get apps, members, and activity for a workspace |
| `list_items` | List and filter items in an app (paginated) |
| `get_item_detail` | Get full item details with fields, comments, tasks |
| `create_item` | Create a new item with simple key-value fields |
| `update_item` | Update specific fields on an item |
| `add_comment` | Add a comment to an item |
| `manage_task` | Create, complete, or update tasks |
| `get_notifications` | Get recent notifications |
| `get_app_structure` | Get field definitions for an app |

## Design principles

- **Goal-oriented tools**: Each tool maps to what a user wants to do, not to a single API endpoint. `get_workspace_overview` orchestrates 4 API calls internally.
- **Simple field values**: `create_item` and `update_item` accept plain key-value objects. The server maps them to Podio's field format.
- **Human-readable responses**: All responses are formatted as readable text, never raw JSON. Large responses are truncated with a warning.
- **Actionable errors**: Wrong field name? You get the list of valid fields. App not found? You get suggestions for how to find it.
- **Always paginated**: `list_items` caps at 30 per page with offset-based pagination.

## Typical workflow

1. `search_podio` or `get_workspace_overview` to find the right app
2. `get_app_structure` to learn the fields
3. `list_items` / `get_item_detail` to read data
4. `create_item` / `update_item` / `add_comment` to write data

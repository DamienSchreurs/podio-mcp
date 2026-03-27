#!/usr/bin/env node

/**
 * Podio MCP Server — an MCP server for AI agents to interact with the Podio API.
 *
 * Designed around what users want to accomplish, not around raw Podio endpoints.
 * Consolidates multi-step operations into single high-level tools.
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env"), quiet: true });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PodioClient, PodioApiError } from "./podio-client.js";
import { tools } from "./tools.js";
import { z } from "zod";

async function main() {
  const server = new McpServer({
    name: "podio-mcp-server",
    version: "1.1.2",
  });

  // Initialize Podio client (validates env vars on construction)
  let client: PodioClient;
  try {
    client = new PodioClient();
  } catch (err: any) {
    console.error(`Failed to initialize Podio client: ${err.message}`);
    process.exit(1);
  }

  // Register all tools
  for (const tool of tools) {
    // Convert zod schema to the shape expected by McpServer.tool()
    const shape = (tool.schema as z.ZodObject<any>).shape;
    server.tool(
      tool.name,
      tool.description,
      shape,
      async (params: any) => {
        try {
          const text = await tool.handler(client, params);
          return { content: [{ type: "text" as const, text }] };
        } catch (err: any) {
          const message = formatError(err);
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
          };
        }
      }
    );
  }

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function formatError(err: any): string {
  if (err instanceof PodioApiError) {
    switch (err.statusCode) {
      case 400:
        return `Bad request: ${err.detail}\n\nCheck your parameters and try again. Use get_app_structure to verify field names and types.`;
      case 401:
        return `Authentication failed: ${err.detail}\n\nCheck your PODIO_CLIENT_ID, PODIO_CLIENT_SECRET, PODIO_USERNAME, and PODIO_PASSWORD environment variables.`;
      case 403:
        return `Permission denied: ${err.detail}\n\nYou don't have access to this resource. Check your Podio permissions.`;
      case 404:
        return `Not found: ${err.detail}\n\nThe requested resource doesn't exist. Use search_podio to find the correct ID.`;
      case 409:
        return `Conflict: ${err.detail}\n\nThe item was modified by someone else. Refresh and try again.`;
      case 420:
        return `Rate limited: ${err.detail}\n\nToo many requests. Wait a moment and retry.`;
      case 429:
        return `Rate limited: ${err.detail}\n\nToo many requests. Wait a moment and retry.`;
      default:
        return `Podio API error (${err.statusCode}): ${err.detail}`;
    }
  }

  return `Error: ${err.message || String(err)}`;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

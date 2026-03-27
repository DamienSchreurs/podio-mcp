/**
 * MCP tool definitions — goal-oriented tools for Podio, designed for AI agents.
 */
import { z } from "zod";
import { PodioClient, PodioApiError } from "./podio-client.js";
import {
  formatSearchResults,
  formatWorkspaceOverview,
  formatWorkspaceList,
  formatItemSummary,
  formatItemDetail,
  formatAppStructure,
  formatNotifications,
  formatTask,
  formatFieldValue,
  paginationInfo,
  truncateResponse,
} from "./formatters.js";

// ---- Schemas ----

const SearchSchema = z.object({
  query: z.string().min(1).max(500).describe("The search text to look for across Podio"),
  ref_type: z
    .enum(["item", "task", "app", "status", "file", "profile"])
    .optional()
    .describe("Limit search to a specific object type"),
  space_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Limit search to a specific workspace (space) ID"),
  limit: z
    .number()
    .min(1)
    .max(20)
    .default(10)
    .describe("Max results to return (1-20, default 10)"),
});

const ListWorkspacesSchema = z.object({
  org_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional organization ID to list workspaces for. Omit to list all."),
});

const WorkspaceOverviewSchema = z.object({
  space_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Workspace/space ID. Provide this OR space_name."),
  space_name: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "Workspace name to search for. The server will find the matching workspace. Provide this OR space_id."
    ),
});

const ListItemsSchema = z.object({
  app_id: z.number().int().positive().describe("The Podio app ID to list items from"),
  filters: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Filter items by field values. Keys are field external_ids, values depend on field type. Use get_app_structure first to see available fields. Category fields must use integer option IDs in an array (not string labels): {"deal-stage": [1, 2]}. Use get_app_structure to find option IDs.'
    ),
  sort_by: z
    .string()
    .max(100)
    .optional()
    .describe("Field external_id to sort by, or 'created_on', 'last_edit_on'"),
  sort_desc: z
    .boolean()
    .default(true)
    .describe("Sort descending (newest first). Default true."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Pagination offset (default 0). Use with limit for paging."),
  limit: z
    .number()
    .min(1)
    .max(30)
    .default(30)
    .describe("Items per page (1-30, default 30)"),
});

const GetItemDetailSchema = z.object({
  item_id: z.number().int().positive().describe("The Podio item ID to retrieve"),
});

const CreateItemSchema = z.object({
  app_id: z.number().int().positive().describe("The Podio app ID to create the item in"),
  fields: z
    .record(z.string(), z.any())
    .describe(
      'Key-value pairs of field values. Keys should be field external_ids (use get_app_structure to discover them). Values depend on field type: text fields take strings, category fields take option IDs or label strings, date fields take "YYYY-MM-DD HH:MM:SS" (time is REQUIRED — use 00:00:00 for midnight), relationship fields take item IDs (number or array of numbers), contact fields take profile IDs.'
    ),
  tags: z
    .array(z.string().min(1).max(100))
    .max(50)
    .optional()
    .describe("Tags to add to the item"),
});

const UpdateItemSchema = z.object({
  item_id: z.number().int().positive().describe("The Podio item ID to update"),
  fields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      "Key-value pairs of fields to update. Optional — omit or pass {} if only updating tags. Same format as create_item."
    ),
  tags: z
    .array(z.string().min(1).max(100))
    .max(50)
    .optional()
    .describe("Replace all tags on the item (omit to leave tags unchanged)"),
});

const AddCommentSchema = z.object({
  item_id: z.number().int().positive().describe("The Podio item ID to comment on"),
  text: z.string().min(1).max(10000).describe("The comment text"),
});

const ManageTaskSchema = z.object({
  action: z
    .enum(["create", "complete", "update"])
    .describe("What to do: create a new task, complete an existing task, or update a task"),
  task_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Required for 'complete' and 'update' actions. The task ID."),
  text: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("Task text/title. Required for 'create'."),
  description: z.string().max(5000).optional().describe("Task description"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/)
    .optional()
    .describe('Due date as "YYYY-MM-DD HH:MM:SS" — time component is required (use 00:00:00 for midnight). T-separator and date-only formats are not accepted.'),
  responsible: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("User/contact ID to assign the task to"),
  ref_type: z
    .enum(["item", "task", "app", "space", "org", "profile"])
    .optional()
    .describe("Reference type to link to, e.g. 'item'"),
  ref_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Reference ID to link to, e.g. an item_id"),
});

const GetNotificationsSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max notification groups to return (1-50, default 20)"),
  viewed: z
    .boolean()
    .optional()
    .describe("Filter: true=viewed only, false=unviewed only, omit=all"),
});

const GetAppStructureSchema = z.object({
  app_id: z.number().int().positive().describe("The Podio app ID to get field definitions for"),
});

// ---- Tool definitions ----

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType;
  handler: (client: PodioClient, params: any) => Promise<string>;
}

export const tools: ToolDef[] = [
  {
    name: "search_podio",
    description: `Search across items, apps, and workspaces in Podio.
Use this when the user wants to find something but doesn't know the exact ID or location.
Returns concise summaries of matching objects.

Parameters:
- query (required): Search text
- ref_type (optional): Limit to "item", "task", "app", "status", "file", or "profile"
- space_id (optional): Limit to a specific workspace ID
- limit (optional): 1-20 results, default 10

Response: A formatted list of search results with type, title, ID, app, workspace, and link for each result.`,
    schema: SearchSchema,
    handler: async (client, params) => {
      const body: any = { query: params.query, limit: params.limit };
      if (params.ref_type) body.ref_type = params.ref_type;
      if (params.search_fields) body.search_fields = params.search_fields;

      let results: any[];
      if (params.space_id) {
        results = await client.post(`/search/space/${params.space_id}/`, body);
      } else {
        results = await client.post("/search/", body);
      }

      return formatSearchResults(results);
    },
  },

  {
    name: "list_workspaces",
    description: `List all workspaces (spaces) the user has access to, grouped by organization.
Use this when the user wants to see all their workspaces, or to discover workspace IDs.

Parameters:
- org_id (optional): Limit to a specific organization ID. Omit to list all.

Response: All workspaces grouped by organization, with workspace name, ID, privacy, and URL.`,
    schema: ListWorkspacesSchema,
    handler: async (client, params) => {
      let orgs: any[];
      if (params.org_id) {
        // Fetch just the one org's spaces
        const spaces = await client.get(`/org/${params.org_id}/space/`);
        orgs = [{ org_id: params.org_id, name: `Organization #${params.org_id}`, spaces }];
      } else {
        orgs = await client.get("/org/");
        // Fetch spaces for each org in parallel
        const spaceLists = await Promise.all(
          orgs.map((org: any) => client.get(`/org/${org.org_id}/space/`).catch(() => []))
        );
        for (let i = 0; i < orgs.length; i++) {
          orgs[i].spaces = spaceLists[i];
        }
      }
      return formatWorkspaceList(orgs);
    },
  },

  {
    name: "get_workspace_overview",
    description: `Get a comprehensive overview of a Podio workspace including its apps, member count, and recent activity.
Use this when the user asks about a workspace/space — what's in it, who's in it, what's happening.
Provide either space_id or space_name (the server will search for matching workspaces by name).

Parameters:
- space_id (optional): Workspace ID if known
- space_name (optional): Workspace name to search for

Response: Workspace name, privacy, URL, member count, list of apps with IDs, and last 10 activity stream events.`,
    schema: WorkspaceOverviewSchema,
    handler: async (client, params) => {
      let spaceId = params.space_id;

      if (!spaceId && params.space_name) {
        // Search for workspace by name using the global search
        const searchResults = await client.post("/search/", {
          query: params.space_name,
          limit: 5,
        });
        // Also try listing orgs and their spaces
        const orgs: any[] = await client.get("/org/");
        let found = false;
        for (const org of orgs) {
          const spaces: any[] = await client.get(
            `/org/${org.org_id}/space/`
          );
          const match = spaces.find(
            (s: any) =>
              s.name?.toLowerCase() === params.space_name!.toLowerCase() ||
              s.name?.toLowerCase().includes(params.space_name!.toLowerCase())
          );
          if (match) {
            spaceId = match.space_id;
            found = true;
            break;
          }
        }
        if (!found) {
          // List all available workspaces for the user
          const allSpaces: string[] = [];
          for (const org of orgs) {
            const spaces: any[] = await client.get(
              `/org/${org.org_id}/space/`
            );
            for (const s of spaces) {
              allSpaces.push(`- ${s.name} (ID: ${s.space_id}) in org "${org.name}"`);
            }
          }
          return `Workspace "${params.space_name}" not found. Available workspaces:\n${allSpaces.join("\n") || "(none)"}`;
        }
      }

      if (!spaceId) {
        return 'Please provide either space_id or space_name.';
      }

      // Fetch space details, apps, members, and stream in parallel
      const [space, apps, members, stream] = await Promise.all([
        client.get(`/space/${spaceId}`),
        client.get(`/app/space/${spaceId}/`),
        client.get(`/space/${spaceId}/member/`).catch(() => []),
        client.get(`/stream/space/${spaceId}/`, { limit: 10 }).catch(() => []),
      ]);

      return formatWorkspaceOverview(space, apps, members, stream);
    },
  },

  {
    name: "list_items",
    description: `List items in a Podio app with optional filtering, sorting, and pagination.
Use this to browse items in an app, search with filters, or paginate through results.
Always returns max 30 items per page. Use offset to paginate.
Tip: Use get_app_structure first to discover available fields and their external_ids for filtering/sorting.
Tip: Category filters require integer option IDs in an array — use get_app_structure to find them. Example: {"deal-stage": [1, 2]}, NOT {"deal-stage": "Signed"}.

Parameters:
- app_id (required): The Podio app ID
- filters (optional): Object mapping field external_ids to filter values
- sort_by (optional): Field external_id or "created_on"/"last_edit_on"
- sort_desc (optional): Sort descending, default true
- offset (optional): Pagination offset, default 0
- limit (optional): Items per page, 1-30, default 30

Response: Paginated list of items with their key field values summarized as readable text. Includes "showing X of Y" count.`,
    schema: ListItemsSchema,
    handler: async (client, params) => {
      const body: any = {
        sort_desc: params.sort_desc,
        limit: params.limit,
        offset: params.offset,
      };
      if (params.sort_by) body.sort_by = params.sort_by;
      if (params.filters) {
        for (const [key, val] of Object.entries(params.filters)) {
          if (typeof val === "string") {
            return (
              `Filter error for field "${key}": category fields require integer option IDs in an array, not a string label.\n` +
              `Example: {"${key}": [1, 2]}\n` +
              `Use get_app_structure to find the correct option IDs.`
            );
          }
        }
        body.filters = params.filters;
      }

      let result: any;
      try {
        result = await client.post(`/item/app/${params.app_id}/filter/`, body);
      } catch (err) {
        if (err instanceof PodioApiError && err.statusCode === 404) {
          return `App #${params.app_id} not found. Use search_podio or get_workspace_overview to find the correct app ID.`;
        }
        throw err;
      }

      const total = result.total || result.filtered || 0;
      const items: any[] = result.items || [];

      if (!items.length) {
        return `No items found in app #${params.app_id} with the given filters.`;
      }

      const lines: string[] = [];
      lines.push(paginationInfo(params.offset, params.limit, total));
      lines.push("");

      for (const item of items) {
        lines.push(formatItemSummary(item));
        lines.push("");
      }

      if (params.offset + params.limit < total) {
        lines.push(
          `→ To see more, use offset=${params.offset + params.limit}`
        );
      }

      return truncateResponse(lines.join("\n"));
    },
  },

  {
    name: "get_item_detail",
    description: `Get full details of a single Podio item including all fields, comments, and tasks.
Use this when the user wants to see everything about a specific item.

Parameters:
- item_id (required): The Podio item ID

Response: Formatted item with title, app, all field values as readable text, comments (up to 10), and linked tasks.`,
    schema: GetItemDetailSchema,
    handler: async (client, params) => {
      let item: any;
      try {
        item = await client.get(`/item/${params.item_id}`);
      } catch (err) {
        if (err instanceof PodioApiError && err.statusCode === 404) {
          return `Item #${params.item_id} not found. Check the item ID and try again.`;
        }
        throw err;
      }
      return formatItemDetail(item);
    },
  },

  {
    name: "create_item",
    description: `Create a new item in a Podio app.
Use get_app_structure first to discover the available fields and their external_ids.
Field values are passed as a simple key-value object — the server handles Podio's field format internally.

Parameters:
- app_id (required): The app to create the item in
- fields (required): Object mapping field external_ids to values. Examples:
  - Text: {"title": "My item"}
  - Category: {"status": "Active"} or {"status": 1} (option ID)
  - Date: {"deadline": "2026-04-15 00:00:00"} (time is REQUIRED — use 00:00:00 for midnight)
  - Relationship: {"project": 12345} or {"project": [12345, 67890]}
  - Contact: {"assignee": 98765} (profile ID)
  - Number: {"amount": 42.5}
  - Money: {"price": {"value": "100.00", "currency": "USD"}}
- tags (optional): Array of tag strings

Note: Podio may auto-fill required text fields from linked relationship values if omitted. Always provide required fields explicitly to avoid unexpected values.

Response: Confirmation with the new item ID and title.`,
    schema: CreateItemSchema,
    handler: async (client, params) => {
      // First get the app structure to map field names properly
      let app: any;
      try {
        app = await client.get(`/app/${params.app_id}`);
      } catch (err) {
        if (err instanceof PodioApiError && err.statusCode === 404) {
          return `App #${params.app_id} not found. Use search_podio or get_workspace_overview to find the correct app ID.`;
        }
        throw err;
      }

      const fieldMap = buildFieldMap(app.fields || []);
      let mappedFields: Record<string, any>;
      try {
        mappedFields = mapFieldValues(params.fields, fieldMap);
      } catch (err: any) {
        const validFields = (app.fields || [])
          .map((f: any) => `"${f.external_id}" (${f.type}, label: "${f.config?.label || f.label || ""}")`)
          .join("\n  ");
        return `Field mapping error: ${err.message}\n\nValid fields for this app:\n  ${validFields}`;
      }

      const body: any = { fields: mappedFields };
      if (params.tags?.length) body.tags = params.tags;

      const result = await client.post(`/item/app/${params.app_id}/`, body);
      return `Item created successfully.\nItem ID: ${result.item_id}\nTitle: ${result.title || "(untitled)"}`;
    },
  },

  {
    name: "update_item",
    description: `Update specific fields on an existing Podio item.
Only include fields you want to change — other fields remain untouched.
Use get_app_structure to discover valid field external_ids.

Parameters:
- item_id (required): The item to update
- fields (optional): Object mapping field external_ids to new values (same format as create_item). Omit or pass {} for tag-only updates.
  - Date fields require "YYYY-MM-DD HH:MM:SS" format (time is REQUIRED — use 00:00:00 for midnight)
- tags (optional): Replace all tags on the item

Response: Confirmation with the updated revision number.`,
    schema: UpdateItemSchema,
    handler: async (client, params) => {
      // Get the item to find its app, then get app structure
      let item: any;
      try {
        item = await client.get(`/item/${params.item_id}`);
      } catch (err) {
        if (err instanceof PodioApiError && err.statusCode === 404) {
          return `Item #${params.item_id} not found. Check the item ID and try again.`;
        }
        throw err;
      }

      const body: any = {};

      if (params.fields && Object.keys(params.fields).length > 0) {
        const appId = item.app?.app_id;
        if (!appId) {
          return `Could not determine the app for item #${params.item_id}.`;
        }

        const app = await client.get(`/app/${appId}`);
        const fieldMap = buildFieldMap(app.fields || []);

        try {
          body.fields = mapFieldValues(params.fields, fieldMap);
        } catch (err: any) {
          const validFields = (app.fields || [])
            .map((f: any) => `"${f.external_id}" (${f.type}, label: "${f.config?.label || f.label || ""}")`)
            .join("\n  ");
          return `Field mapping error: ${err.message}\n\nValid fields for this app:\n  ${validFields}`;
        }
      }

      if (params.tags !== undefined) body.tags = params.tags;

      const result = await client.put(`/item/${params.item_id}`, body);
      const revision = result?.revision ?? "N/A";
      const title = result?.title || item.title || "(untitled)";
      return `Item #${params.item_id} updated successfully.\nRevision: ${revision}\nTitle: ${title}`;
    },
  },

  {
    name: "add_comment",
    description: `Add a comment to a Podio item.
Use this when the user wants to post a comment or note on an item.

Parameters:
- item_id (required): The item to comment on
- text (required): The comment text

Response: Confirmation with the comment ID.`,
    schema: AddCommentSchema,
    handler: async (client, params) => {
      const result = await client.post(`/comment/item/${params.item_id}/`, {
        value: params.text,
      });
      return `Comment added successfully.\nComment ID: ${result.comment_id}`;
    },
  },

  {
    name: "manage_task",
    description: `Create, complete, or update a task in Podio. Tasks can be standalone or linked to items.

Parameters:
- action (required): "create", "complete", or "update"
- task_id: Required for "complete" and "update" — the task ID
- text: Task title (required for "create")
- description: Task description
- due_date: Due date as "YYYY-MM-DD HH:MM:SS" — time is required (e.g. "2026-04-15 00:00:00")
- responsible: User/contact ID to assign to
- ref_type: Link type (e.g., "item") — use with ref_id to link the task
- ref_id: ID of the object to link to (e.g., an item_id)

Response: For create — new task details. For complete — confirmation. For update — updated task details.`,
    schema: ManageTaskSchema,
    handler: async (client, params) => {
      switch (params.action) {
        case "create": {
          if (!params.text) return "Error: 'text' is required when creating a task.";
          const body: any = { text: params.text };
          if (params.description) body.description = params.description;
          if (params.due_date) body.due_date = params.due_date;
          if (params.responsible) body.responsible = params.responsible;

          let path = "/task/";
          if (params.ref_type && params.ref_id) {
            body.ref_type = params.ref_type;
            body.ref_id = params.ref_id;
          }

          const task = await client.post(path, body);
          return `Task created successfully.\n${formatTask(task)}`;
        }
        case "complete": {
          if (!params.task_id)
            return "Error: 'task_id' is required to complete a task.";
          await client.post(`/task/${params.task_id}/complete`);
          return `Task #${params.task_id} marked as completed.`;
        }
        case "update": {
          if (!params.task_id)
            return "Error: 'task_id' is required to update a task.";
          const body: any = {};
          if (params.text) body.text = params.text;
          if (params.description) body.description = params.description;
          if (params.due_date) body.due_date = params.due_date;
          if (params.responsible !== undefined) body.responsible = params.responsible;
          await client.put(`/task/${params.task_id}`, body);
          const updated = await client.get(`/task/${params.task_id}`);
          return `Task updated.\n${formatTask(updated)}`;
        }
        default:
          return `Unknown action "${params.action}". Use "create", "complete", or "update".`;
      }
    },
  },

  {
    name: "get_notifications",
    description: `Get recent notifications for the authenticated Podio user.
Use this when the user asks "what's new", "any updates", or wants to see their notification inbox.

Parameters:
- limit (optional): 1-50 notifications, default 20
- viewed (optional): true=viewed only, false=unviewed only, omit=all

Response: Grouped notifications with context, author, type, and timestamp.`,
    schema: GetNotificationsSchema,
    handler: async (client, params) => {
      const query: any = { limit: params.limit };
      if (params.viewed !== undefined) query.viewed = params.viewed;
      const result = await client.get("/notification/", query);
      return formatNotifications(result);
    },
  },

  {
    name: "get_app_structure",
    description: `Get the field definitions for a Podio app.
IMPORTANT: Always call this before create_item or update_item to discover the correct field external_ids, types, and available options.

Parameters:
- app_id (required): The Podio app ID

Response: App name, description, and a list of all fields with their external_id, type, required status, and options (for category fields) or referenced apps (for relationship fields). The integer option IDs shown for category fields are the values required when filtering with list_items.`,
    schema: GetAppStructureSchema,
    handler: async (client, params) => {
      let app: any;
      try {
        app = await client.get(`/app/${params.app_id}`);
      } catch (err) {
        if (err instanceof PodioApiError && err.statusCode === 404) {
          return `App #${params.app_id} not found. Use search_podio or get_workspace_overview to find valid app IDs.`;
        }
        throw err;
      }
      return formatAppStructure(app);
    },
  },
];

// ---- Field mapping helpers ----

interface FieldInfo {
  field_id: number;
  external_id: string;
  type: string;
  config: any;
}

/**
 * Builds a lookup map keyed by exact external_id (primary) and by normalised label
 * (secondary, only when no exact match exists). Callers should always prefer the
 * primary key; the label fallback is convenience-only and is clearly documented.
 */
function buildFieldMap(fields: any[]): Map<string, FieldInfo> {
  const map = new Map<string, FieldInfo>();
  for (const f of fields) {
    const key = f.external_id || String(f.field_id);
    const info: FieldInfo = {
      field_id: f.field_id,
      external_id: f.external_id,
      type: f.type,
      config: f.config,
    };
    // Primary: exact external_id (always added)
    map.set(key, info);
    // Secondary: normalised label ("My Field" → "my-field"), only when it would not
    // shadow an existing primary key so we never silently replace a canonical entry.
    const label = (f.config?.label || f.label || "").toLowerCase().replace(/\s+/g, "-");
    if (label && label !== key && !map.has(label)) {
      map.set(label, info);
    }
  }
  return map;
}

function mapFieldValues(
  input: Record<string, any>,
  fieldMap: Map<string, FieldInfo>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(input)) {
    // 1. Exact match on external_id (preferred)
    // 2. Normalised label fallback (spaces → hyphens, lowercased)
    const normalised = key.toLowerCase().replace(/\s+/g, "-");
    const fieldInfo = fieldMap.get(key) ?? (key !== normalised ? fieldMap.get(normalised) : undefined);
    if (!fieldInfo) {
      const validKeys = [...new Set([...fieldMap.values()].map((f) => f.external_id))].filter(Boolean);
      throw new Error(
        `Unknown field "${key}". Valid external_ids: ${validKeys.join(", ")}`
      );
    }

    const fieldKey = fieldInfo.external_id || String(fieldInfo.field_id);
    result[fieldKey] = convertFieldValue(value, fieldInfo);
  }

  return result;
}

function convertFieldValue(value: any, field: FieldInfo): any {
  switch (field.type) {
    case "text":
    case "number":
    case "progress":
    case "duration":
    case "calculation":
      return value;

    case "category": {
      // Accept option text, option ID, or array
      if (Array.isArray(value)) {
        return value.map((v) => resolveCategory(v, field));
      }
      return resolveCategory(value, field);
    }

    case "date": {
      if (typeof value === "string") {
        if (!/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(value)) {
          throw new Error(
            `Date field requires "YYYY-MM-DD HH:MM:SS" format (time is required). ` +
            `Use 00:00:00 for midnight. Got: "${value}"`
          );
        }
        return { start: value };
      }
      // Already an object with start/end
      return value;
    }

    case "money": {
      if (typeof value === "object" && value.value !== undefined) {
        return value; // {value, currency}
      }
      // Assume USD if just a number
      return { value: String(value), currency: "USD" };
    }

    case "app": {
      // Relationship: accept item ID or array of item IDs
      if (Array.isArray(value)) {
        return value.map((v) => (typeof v === "number" ? { value: v } : v));
      }
      return typeof value === "number" ? [{ value: value }] : value;
    }

    case "contact": {
      if (Array.isArray(value)) {
        return value.map((v) => (typeof v === "number" ? { value: v } : v));
      }
      return typeof value === "number" ? [{ value: value }] : value;
    }

    case "embed": {
      if (typeof value === "string") {
        return { url: value };
      }
      return value;
    }

    case "image":
    case "file": {
      if (Array.isArray(value)) return value;
      return [value];
    }

    case "location": {
      if (typeof value === "string") {
        return value;
      }
      return value;
    }

    case "phone":
    case "email": {
      if (typeof value === "string") {
        return [{ type: "other", value: value }];
      }
      return value;
    }

    default:
      return value;
  }
}

function resolveCategory(value: any, field: FieldInfo): any {
  if (typeof value === "number") return value;

  // Try to match by option text
  const options = field.config?.settings?.options || [];
  if (typeof value === "string") {
    const match = options.find(
      (o: any) => o.text?.toLowerCase() === value.toLowerCase()
    );
    if (match) return match.id;
  }

  // Return as-is and let Podio handle it
  return value;
}

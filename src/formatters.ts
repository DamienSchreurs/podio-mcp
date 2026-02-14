/**
 * Transform raw Podio API responses into concise, human-readable text.
 * Never return raw JSON — always format for an AI agent to consume.
 */

const MAX_RESPONSE_CHARS = 12000;

// --- Field value formatting ---

export function formatFieldValue(field: any): string {
  const type: string = field.type;
  const values: any[] = field.values || [];
  if (!values.length) return "(empty)";

  switch (type) {
    case "text":
      return values[0]?.value || "(empty)";
    case "number":
      return String(values[0]?.value ?? "(empty)");
    case "money":
      return values[0] ? `${values[0].currency} ${values[0].value}` : "(empty)";
    case "date": {
      const d = values[0];
      if (!d) return "(empty)";
      let result = d.start || d.start_date || "";
      if (d.start_time) result += ` ${d.start_time}`;
      if (d.end || d.end_date) result += ` → ${d.end || d.end_date}`;
      if (d.end_time) result += ` ${d.end_time}`;
      return result || "(empty)";
    }
    case "app": // relationship
      return values
        .map((v: any) => v.value?.title || `Item #${v.value?.item_id}`)
        .join(", ");
    case "contact":
      return values
        .map((v: any) => {
          const c = v.value;
          return c?.name || c?.mail?.[0] || `Contact #${c?.profile_id}`;
        })
        .join(", ");
    case "category":
      return values.map((v: any) => v.value?.text || v.value?.id).join(", ");
    case "embed":
      return values
        .map((v: any) => v.embed?.url || v.embed?.title || "(link)")
        .join(", ");
    case "image":
    case "file":
      return values
        .map((v: any) => v.value?.name || `File #${v.value?.file_id}`)
        .join(", ");
    case "calculation":
      return String(values[0]?.value ?? "(empty)");
    case "progress":
      return `${values[0]?.value ?? 0}%`;
    case "duration":
      return `${values[0]?.value ?? 0} seconds`;
    case "location":
      return values
        .map(
          (v: any) =>
            v.value || [v.street_address, v.city, v.state, v.country].filter(Boolean).join(", ")
        )
        .join("; ");
    case "phone":
      return values.map((v: any) => `${v.type || "phone"}: ${v.value}`).join(", ");
    case "email":
      return values.map((v: any) => `${v.type || "email"}: ${v.value}`).join(", ");
    default:
      // Fallback: try common shapes
      if (values[0]?.value !== undefined) {
        if (typeof values[0].value === "object") {
          return values[0].value.title || values[0].value.text || JSON.stringify(values[0].value);
        }
        return String(values[0].value);
      }
      return JSON.stringify(values).slice(0, 200);
  }
}

// --- Item formatting ---

export function formatItemSummary(item: any): string {
  const lines: string[] = [];
  lines.push(`**${item.title || "Untitled"}** (ID: ${item.item_id})`);
  if (item.app) {
    lines.push(`  App: ${item.app.config?.name || item.app.name || item.app.app_id}`);
  }
  if (item.link) lines.push(`  Link: ${item.link}`);

  if (item.fields?.length) {
    for (const f of item.fields.slice(0, 8)) {
      const label = f.label || f.config?.label || f.external_id || "field";
      const val = formatFieldValue(f);
      lines.push(`  ${label}: ${val}`);
    }
    if (item.fields.length > 8) {
      lines.push(`  ... and ${item.fields.length - 8} more fields`);
    }
  }
  return lines.join("\n");
}

export function formatItemDetail(item: any): string {
  const lines: string[] = [];
  lines.push(`# ${item.title || "Untitled"} (Item #${item.item_id})`);
  if (item.app) {
    lines.push(`App: ${item.app.config?.name || item.app.name || item.app.app_id}`);
  }
  if (item.link) lines.push(`Link: ${item.link}`);

  const createdBy = item.created_by?.name || "unknown";
  lines.push(`Created by: ${createdBy} on ${item.created_on || "unknown"}`);

  if (item.tags?.length) {
    lines.push(`Tags: ${item.tags.join(", ")}`);
  }

  lines.push("");
  lines.push("## Fields");
  if (item.fields?.length) {
    for (const f of item.fields) {
      const label = f.label || f.config?.label || f.external_id || "field";
      const val = formatFieldValue(f);
      lines.push(`- **${label}**: ${val}`);
    }
  } else {
    lines.push("(no fields)");
  }

  if (item.comments?.length) {
    lines.push("");
    lines.push(`## Comments (${item.comments.length})`);
    const shown = item.comments.slice(0, 10);
    for (const c of shown) {
      const author = c.created_by?.name || "unknown";
      const date = c.created_on || "";
      const text = (c.value || "").slice(0, 300);
      lines.push(`- **${author}** (${date}): ${text}`);
    }
    if (item.comments.length > 10) {
      lines.push(`  ... and ${item.comments.length - 10} more comments`);
    }
  }

  if (item.tasks?.length) {
    lines.push("");
    lines.push(`## Tasks (${item.tasks.length})`);
    for (const t of item.tasks.slice(0, 5)) {
      const status = t.status === "completed" ? "✓" : "○";
      lines.push(`- ${status} ${t.text} (assigned to: ${t.responsible?.name || "unassigned"})`);
    }
  }

  return truncateResponse(lines.join("\n"));
}

// --- App structure formatting ---

export function formatAppStructure(app: any): string {
  const lines: string[] = [];
  const name = app.config?.name || app.name || "Unknown App";
  lines.push(`# ${name} (App #${app.app_id})`);
  if (app.config?.description) lines.push(app.config.description);
  if (app.config?.item_name) lines.push(`Item name: ${app.config.item_name}`);

  lines.push("");
  lines.push("## Fields");

  if (app.fields?.length) {
    for (const f of app.fields) {
      const label = f.config?.label || f.label || f.external_id;
      const required = f.config?.required ? " (required)" : "";
      const externalId = f.external_id ? ` [external_id: "${f.external_id}"]` : "";
      lines.push(`- **${label}**${required}: type=${f.type}${externalId}`);

      // Show category options, relationship targets, etc.
      if (f.config?.settings) {
        const s = f.config.settings;
        if (s.options?.length) {
          const opts = s.options.slice(0, 15).map((o: any) => o.text).join(", ");
          lines.push(`  Options: ${opts}`);
          if (s.options.length > 15) lines.push(`  ... and ${s.options.length - 15} more`);
        }
        if (s.referenced_apps?.length) {
          const refs = s.referenced_apps.map((r: any) => r.app?.name || `App #${r.app_id}`).join(", ");
          lines.push(`  References: ${refs}`);
        }
        if (s.multiple !== undefined) {
          lines.push(`  Multiple: ${s.multiple}`);
        }
      }
    }
  } else {
    lines.push("(no fields defined)");
  }

  return lines.join("\n");
}

// --- Search result formatting ---

export function formatSearchResults(results: any[], total?: number): string {
  if (!results?.length) return "No results found.";

  const lines: string[] = [];
  if (total !== undefined) {
    lines.push(`Showing ${results.length} of ${total} results\n`);
  } else {
    lines.push(`Found ${results.length} results\n`);
  }

  for (const r of results) {
    const type = r.type || "unknown";
    const title = r.title || "Untitled";
    lines.push(`- [${type}] **${title}** (ID: ${r.id})`);
    if (r.app?.name) lines.push(`  App: ${r.app.name}`);
    if (r.space?.name) lines.push(`  Workspace: ${r.space.name}`);
    if (r.link) lines.push(`  Link: ${r.link}`);
    if (r.created_by?.name) lines.push(`  By: ${r.created_by.name} on ${r.created_on || ""}`);
  }

  return truncateResponse(lines.join("\n"));
}

// --- Workspace overview formatting ---

export function formatWorkspaceOverview(
  space: any,
  apps: any[],
  members: any[],
  stream: any[]
): string {
  const lines: string[] = [];
  lines.push(`# Workspace: ${space.name} (ID: ${space.space_id})`);
  lines.push(`Privacy: ${space.privacy || "unknown"}`);
  lines.push(`URL: ${space.url || "N/A"}`);
  lines.push(`Members: ${members.length}`);
  lines.push(`Your role: ${space.role || "unknown"}`);

  lines.push("");
  lines.push("## Apps");
  if (apps.length) {
    for (const a of apps) {
      const name = a.config?.name || a.name || "Unnamed";
      lines.push(`- **${name}** (ID: ${a.app_id}) — status: ${a.status || "active"}`);
    }
  } else {
    lines.push("(no apps)");
  }

  lines.push("");
  lines.push(`## Recent Activity (last ${Math.min(stream.length, 10)} events)`);
  if (stream.length) {
    for (const s of stream.slice(0, 10)) {
      const who = s.created_by?.name || "someone";
      const what = s.type || "activity";
      const title = s.title || "";
      const when = s.created_on || s.last_update_on || "";
      lines.push(`- ${who} — ${what}: ${title} (${when})`);
    }
    if (stream.length > 10) lines.push(`  ... and ${stream.length - 10} more`);
  } else {
    lines.push("(no recent activity)");
  }

  return truncateResponse(lines.join("\n"));
}

// --- Workspace list formatting ---

export function formatWorkspaceList(orgs: any[]): string {
  if (!orgs.length) return "No organizations or workspaces found.";

  const lines: string[] = [];
  let totalSpaces = 0;

  for (const org of orgs) {
    lines.push(`## ${org.name} (Org #${org.org_id})`);
    const spaces: any[] = org.spaces || [];
    if (spaces.length) {
      for (const s of spaces) {
        lines.push(`- **${s.name}** (ID: ${s.space_id}) — ${s.privacy || "unknown"} — ${s.url || ""}`);
        totalSpaces++;
      }
    } else {
      lines.push("(no workspaces)");
    }
    lines.push("");
  }

  const header = `Found ${totalSpaces} workspace${totalSpaces !== 1 ? "s" : ""} across ${orgs.length} organization${orgs.length !== 1 ? "s" : ""}\n\n`;
  return truncateResponse(header + lines.join("\n"));
}

// --- Notification formatting ---

export function formatNotifications(groups: any[]): string {
  if (!groups?.length) return "No notifications.";

  const lines: string[] = [];
  lines.push(`Showing ${groups.length} notification groups\n`);

  for (const g of groups.slice(0, 15)) {
    const ctx = g.context;
    const title = ctx?.data?.title || ctx?.title || "Notification";
    const type = ctx?.ref?.type || "unknown";
    lines.push(`**${title}** [${type}]`);

    if (g.notifications?.length) {
      for (const n of g.notifications.slice(0, 3)) {
        const who = n.created_by?.name || "someone";
        const text = n.text || n.type || "notification";
        const when = n.created_on || "";
        lines.push(`  - ${who}: ${text} (${when})`);
      }
      if (g.notifications.length > 3) {
        lines.push(`  ... and ${g.notifications.length - 3} more in this group`);
      }
    }
    lines.push("");
  }

  if (groups.length > 15) {
    lines.push(`... and ${groups.length - 15} more notification groups`);
  }

  return truncateResponse(lines.join("\n"));
}

// --- Task formatting ---

export function formatTask(task: any): string {
  const lines: string[] = [];
  const status = task.status === "completed" ? "✓ Completed" : "○ Active";
  lines.push(`**${task.text || "Untitled task"}** (ID: ${task.task_id})`);
  lines.push(`Status: ${status}`);
  if (task.description) lines.push(`Description: ${task.description}`);
  if (task.responsible?.name) lines.push(`Assigned to: ${task.responsible.name}`);
  if (task.due_on) lines.push(`Due: ${task.due_on}`);
  if (task.link) lines.push(`Link: ${task.link}`);
  if (task.ref?.type) lines.push(`Linked to: ${task.ref.type} #${task.ref.id}`);
  return lines.join("\n");
}

// --- Helpers ---

export function truncateResponse(text: string): string {
  if (text.length > MAX_RESPONSE_CHARS) {
    return (
      text.slice(0, MAX_RESPONSE_CHARS) +
      `\n\n⚠️ Response truncated (${text.length} chars). Use more specific queries or pagination to see remaining data.`
    );
  }
  return text;
}

export function paginationInfo(offset: number, limit: number, total: number): string {
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  return `Showing ${start}–${end} of ${total}`;
}

#!/usr/bin/env node
/**
 * ChatDesq MCP server: lets AI assistants (Claude, Cursor, ...) work with a ChatDesq workspace
 * through the public REST API (https://api.chatdesq.com/v1).
 *
 * Auth: set CHATDESQ_API_KEY (an sk_live_... key from ChatDesq > Settings > API keys).
 * Deliberately left out of v1: bulk broadcasts, sequence enrolment, deletes and key rotation,
 * so an assistant cannot mass-message customers or destroy data by mistake.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.CHATDESQ_API_BASE ?? "https://api.chatdesq.com/v1";
const KEY = process.env.CHATDESQ_API_KEY;

type Query = Record<string, string | number | undefined>;

async function api(method: string, path: string, opts: { query?: Query; body?: unknown } = {}) {
  if (!KEY) throw new Error("CHATDESQ_API_KEY is not set. Create a key in ChatDesq > Settings > API keys.");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "User-Agent": "chatdesq-mcp/0.1.0" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ChatDesq API ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text;
}

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: String(e instanceof Error ? e.message : e) }], isError: true });

function tool<S extends z.ZodRawShape>(
  server: McpServer, name: string, description: string, shape: S,
  run: (args: z.infer<z.ZodObject<S>>) => Promise<string>, readOnly = true,
) {
  const handler = async (args: z.infer<z.ZodObject<S>>) => { try { return ok(await run(args)); } catch (e) { return fail(e); } };
  server.registerTool(
    name,
    { description, inputSchema: shape, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: !readOnly } },
    handler as any,
  );
}

const page = { page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() };
const uuid = z.string().uuid();

const server = new McpServer({ name: "chatdesq", version: "0.1.0" });

// ---- read ----
tool(server, "list_whatsapp_numbers", "List the WhatsApp Business numbers connected to the ChatDesq workspace (ids are needed to send from a specific number).",
  {}, () => api("GET", "/whatsapp-accounts"));
tool(server, "list_contacts", "Search contacts by name/phone/email, tag (comma-separated) or segment.",
  { search: z.string().max(255).optional(), tags: z.string().max(1000).optional(), segmentId: uuid.optional(), ...page },
  (a) => api("GET", "/contacts", { query: a }));
tool(server, "get_contact", "Get one contact with its custom fields and tags.",
  { id: uuid }, (a) => api("GET", `/contacts/${a.id}`));
tool(server, "list_tags", "List contact tags.", {}, () => api("GET", "/tags"));
tool(server, "list_templates", "List WhatsApp message templates and their Meta approval status and category (marketing / utility / authentication).",
  {}, () => api("GET", "/templates"));
tool(server, "list_conversations", "List inbox conversations, optionally filtered by status, channel or search text.",
  { status: z.enum(["all", "open", "pending", "resolved"]).optional(), channel: z.enum(["all", "whatsapp", "instagram", "facebook"]).optional(),
    search: z.string().max(255).optional(), ...page },
  (a) => api("GET", "/conversations", { query: a }));
tool(server, "get_conversation_messages", "Read the messages of one conversation.",
  { id: uuid, ...page }, (a) => api("GET", `/conversations/${a.id}/messages`, { query: { page: a.page, limit: a.limit } }));
tool(server, "get_message_status", "Get a sent message and its delivery status (sent / delivered / read / failed).",
  { id: z.string().min(1) }, (a) => api("GET", `/messages/${encodeURIComponent(a.id)}`));
tool(server, "list_broadcasts", "List broadcast campaigns with their status and counts.", {}, () => api("GET", "/broadcasts"));
tool(server, "list_pipelines", "List CRM pipelines and their stages.", {}, () => api("GET", "/pipelines"));
tool(server, "list_deals", "List CRM deals, optionally for one pipeline.",
  { pipelineId: uuid.optional() }, (a) => api("GET", "/deals", { query: a }));

// ---- write (single records only) ----
tool(server, "send_text_message",
  "Send one free-form WhatsApp text to one number. Only works inside the 24-hour customer service window; outside it, use send_template_message. Never use it for bulk or unsolicited messages.",
  { to: z.string().min(5).max(30).describe("Recipient phone in international format, e.g. 919876543210"),
    text: z.string().min(1).max(4096), from: z.string().max(64).optional().describe("Sending number id; default number if omitted") },
  (a) => api("POST", "/messages", { body: { to: a.to, from: a.from, type: "text", text: a.text } }), false);
tool(server, "send_template_message",
  "Send one approved WhatsApp template to one number that has opted in. Use list_templates to find the template name and its variables.",
  { to: z.string().min(5).max(30), name: z.string().min(1).max(512).describe("Approved template name"),
    language: z.string().min(2).max(16).optional().describe("Template language code, e.g. en or hi"),
    parameters: z.array(z.string().max(5000)).max(50).optional().describe("Body variables {{1}}, {{2}}, ... in order"),
    from: z.string().max(64).optional() },
  (a) => api("POST", "/messages", { body: { to: a.to, from: a.from, type: "template",
    template: { name: a.name, language: a.language, parameters: a.parameters } } }), false);
tool(server, "create_contact", "Create a contact.",
  { name: z.string().max(255).optional(), phone: z.string().max(30).optional(), email: z.string().max(255).optional(),
    customFields: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])).optional() },
  (a) => api("POST", "/contacts", { body: a }), false);
tool(server, "update_contact", "Update a contact's name, email, phone or custom fields.",
  { id: uuid, name: z.string().max(255).optional(), phone: z.string().max(30).optional(), email: z.string().max(255).optional(),
    customFields: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])).optional() },
  ({ id, ...body }) => api("PATCH", `/contacts/${id}`, { body }), false);
tool(server, "tag_contact", "Add or remove tags on a contact. Pass tag ids from list_tags.",
  { id: uuid, add: z.array(uuid).max(50).optional(), remove: z.array(uuid).max(50).optional() },
  ({ id, ...body }) => api("POST", `/contacts/${id}/tags`, { body }), false);
tool(server, "create_deal", "Create a CRM deal for a contact. valueMinor is in the smallest currency unit (paise for INR).",
  { contactId: uuid, title: z.string().min(1).max(255), pipelineId: uuid.optional(), stageId: uuid.optional(),
    valueMinor: z.number().int().min(0).optional(), currency: z.string().length(3).optional(), notes: z.string().max(5000).optional() },
  (a) => api("POST", "/deals", { body: a }), false);

await server.connect(new StdioServerTransport());

# ChatDesq MCP Server

Connect Claude, Cursor and other AI assistants to your [ChatDesq](https://chatdesq.com) workspace. ChatDesq is a
WhatsApp Business API platform for Indian D2C brands, with a ₹0 platform fee: you pay only per message.

With this server, an assistant can look up contacts, read inbox conversations, check template approval and message
delivery status, manage CRM deals, and send single WhatsApp messages. Everything runs through the
[ChatDesq public API](https://api.chatdesq.com/v1/openapi.json).

## Tools

| Tool | What it does | Changes data |
|---|---|---|
| `list_whatsapp_numbers` | Connected WhatsApp Business numbers | No |
| `list_contacts`, `get_contact` | Search contacts by name, phone, email, tag or segment | No |
| `list_tags` | Contact tags | No |
| `list_templates` | Message templates with Meta approval status and category | No |
| `list_conversations`, `get_conversation_messages` | Inbox conversations and their messages | No |
| `get_message_status` | Delivery status of a sent message | No |
| `list_broadcasts` | Broadcast campaigns and their counts | No |
| `list_pipelines`, `list_deals` | CRM pipelines, stages and deals | No |
| `send_text_message` | One free-form text, inside the 24-hour service window | Yes |
| `send_template_message` | One approved template to one opted-in number | Yes |
| `create_contact`, `update_contact`, `tag_contact` | Contact records and tags | Yes |
| `create_deal` | A CRM deal for a contact | Yes |

**Left out on purpose:** bulk broadcasts, drip enrolment, deletes and API-key rotation. An assistant can't
mass-message your customers or delete data through this server. For those tasks, use the ChatDesq app.

## Setup

1. In ChatDesq, open **Settings > API keys** and create a key. Give it only the scopes you need; a read-only key is
   enough for the lookup tools.
2. Add the server to your MCP client.

**Claude Desktop** (`claude_desktop_config.json`) or **Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "chatdesq": {
      "command": "npx",
      "args": ["-y", "@chatdesq/mcp-server"],
      "env": { "CHATDESQ_API_KEY": "sk_live_..." }
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add chatdesq --env CHATDESQ_API_KEY=sk_live_... -- npx -y @chatdesq/mcp-server
```

Optional: set `CHATDESQ_API_BASE` to use a different API base URL (default `https://api.chatdesq.com/v1`).

## Example prompts

- "Which of my WhatsApp templates are still pending approval, and which are marketing vs utility?"
- "Find the contact with phone 9198xxxxxxx, add the tag 'vip' and create a deal worth ₹25,000."
- "Summarise today's open conversations and draft replies; don't send anything."
- "Did message wamid.XXXX get delivered?"

## Good practice

- Send messages only to people who have opted in to hear from you, and respect opt-outs. WhatsApp's Business
  Messaging Policy applies to everything you send.
- Free-form text works only within 24 hours of the customer's last message. Outside that window, use an approved
  template.
- Keep your API key secret. Don't commit it, and rotate it in ChatDesq if it leaks.

## Links

- ChatDesq: [chatdesq.com](https://chatdesq.com)
- Pricing (₹0 platform fee, pay per message): [chatdesq.com/pricing](https://chatdesq.com/pricing)
- WhatsApp API cost calculator: [chatdesq.com/tools/whatsapp-cost-calculator](https://chatdesq.com/tools/whatsapp-cost-calculator)
- Support: hello@chatdesq.com

ChatDesq is built by Apporio Infolabs Pvt Ltd (Noida, India). MIT licensed.

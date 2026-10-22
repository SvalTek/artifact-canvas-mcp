---
name: artifact-canvas
description: Create or revise a visual, interactive, or long-form artifact on the local canvas when a user would benefit from opening and exploring a separate page.
---

# Artifact Canvas

Use the `artifact-canvas` MCP tools when an artifact should be presented as a
separate local page rather than only inline in chat.

- Use `artifact_create` for a new artifact and `artifact_update` to revise an
  existing one. Keep the artifact ID from the tool result available for later
  updates.
- Use `artifact_edit` for a targeted content change when you can provide an
  exact substring that occurs once. Supply it as `oldText` and the replacement
  as `newText`; the title, artifact type, and language are preserved. Use
  `artifact_update` when replacing the content as a whole or changing metadata.
- Return the clickable URL from the tool result so the user can open it in the
  VS Code built-in browser or another browser.
- The local page starts with the MCP stdio process. Do not ask the user to start
  it separately.
- Artifact content defaults to Markdown. Use `type: "text"` for literal text,
  `type: "code"` for source code (optionally set `language`), and `type: "html"`
  for self-contained interactive HTML. HTML runs in a sandbox with network
  access disabled; do not rely on remote assets or services.
- Markdown fenced code blocks and `code` artifacts support syntax highlighting
  when given a language recognized by the bundled highlight.js common build. Set
  a useful language identifier (for example, `typescript`, `python`, or `json`)
  when creating code artifacts. Unknown or omitted languages render as escaped
  plain code.
- The canvas has a text-only dark/light mode toggle in the top bar and remembers
  the selection in browser local storage.
- Use `artifact_list` when you need to find an existing canvas artifact and
  `artifact_delete` only when the user asks to remove one.
- Use `get_logs` to inspect recent server errors when an MCP operation fails or
  the canvas does not behave as expected. It returns a bounded in-memory log for
  the current MCP process.

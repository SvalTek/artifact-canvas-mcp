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

## Interactive documents

Use `type: "interactive"` for a declarative A2UI document. It occupies the full
pane beside the sidebar, with no outer card, title, padding or width constraint.
Build the layout and any visible title in the component tree itself.

1. Read `artifact-canvas://catalog` for the available catalog, or read the
   resource template `artifact-canvas://catalog/search{?query}` with a query
   such as `artifact-canvas://catalog/search?query=date%20input`.
2. Read the matching `artifact-canvas://catalog/components/{name}` or
   `artifact-canvas://catalog/functions/{name}` resources for the actual
   schemas. These resources describe the exact registered catalog, including
   local logic.
3. Call `artifact_create` with `type: "interactive"` and structured `content`:
   `{ "components": [...], "data": {...} }`. JSON text is also accepted. Every
   component has `id` and `component`; properties go directly beside them.
   Include `id: "root"` and reference children by ID. All nodes must be
   reachable.
4. Return the clickable artifact link before waiting so the user can open it.
   Creating a document does not require waiting: many documents only display
   data.
5. Call `wait_for_event` only when an agent response is needed. Supply the
   artifact `id`, optionally an event `name` and `timeoutMs`. It waits
   exclusively for an explicitly configured `action.event`. Local edits,
   sliders, tabs, selections and `action.functionCall` never complete the wait.
6. Events are queued before and during waits. Start with the `eventCursor`
   returned by creation/update, and pass the returned `cursor` as `after` on
   subsequent waits. `timeoutMs: 0` polls; omitting it waits until an event or
   cancellation (the host may impose a request timeout). Timeout is a normal
   result, not failure. A name-filtered timeout cursor advances past events that
   did not match.
7. Use `artifact_ui_update` for incremental changes. `components` upserts full
   node definitions by ID; `removeComponents` removes nodes (update parents
   too). `dataUpdates` writes JSON Pointer paths; omit `value` to delete a path.
   Omitted fields preserve local input. `expectedRevision` optionally prevents
   stale writes. `artifact_update` or `artifact_edit` performs a full reset for
   this type.
8. `artifact_read` returns the stored specification, revision and event cursor.
   It does not inspect unsent local browser edits. Read submitted values from
   the event's resolved `context`. Artifacts/events remain in memory until
   server exit.

Bindings such as `{ "path": "/name" }` update the local data model. To send a
response, configure a Button's `action.event`, naming the event and selecting
the data to return through its context. It is the event configuration that makes
the button submit, not its label or visual variant.

Example `artifact_create` arguments:

```json
{
  "title": "Your preference",
  "type": "interactive",
  "content": {
    "components": [
      { "id": "root", "component": "Column", "children": ["name", "send"] },
      {
        "id": "name",
        "component": "TextField",
        "label": "Name",
        "value": { "path": "/name" }
      },
      {
        "id": "send",
        "component": "Button",
        "child": "sendLabel",
        "action": {
          "event": {
            "name": "answer",
            "context": { "name": { "path": "/name" } }
          }
        }
      },
      { "id": "sendLabel", "component": "Text", "text": "Send response" }
    ],
    "data": { "name": "" }
  }
}
```

Then `wait_for_event({"id":"<returned id>","name":"answer","after":0})`. For a
local counter, the registered `increment` function accepts
`{"target":"/count","amount":1}` in `action.functionCall.args`; it emits no
event. The complete local-counter/form example is bundled at
`examples/interactive.json`.

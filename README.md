# Artifact Canvas MCP

A local, live canvas for artifacts created by an MCP client. Fresh serves the
SSR page and an SSE stream; the MCP endpoint shares in-memory state with that
page.

## Run

Install [Deno](https://deno.com/) and extract this project. **Use stdio when
your MCP client supports it.** For a compatible client's stdio server command,
use:

```sh
deno run -A /path/to/artifact-canvas-mcp/main.ts
```

Replace `/path/to/artifact-canvas-mcp` with the directory where you extracted
this project. On Windows, use a path such as
`C:/path/to/artifact-canvas-mcp/main.ts`. `main.ts` starts both the MCP stdio
server and the local canvas web server in the same process. The canvas asks the
operating system for an available port by default, so separate stdio server
processes can run separate canvases. Artifact tools return links using the
actual port. Set the `PORT` environment variable to request a specific port.

## HTTP fallback

Use HTTP only when the MCP client cannot support stdio. The client cannot start
this HTTP server for you: start it separately and keep it running in the
background before connecting the client. The server exposes its MCP endpoint at
`/mcp`. Start it as a persistent local process with a fixed port, for example:

```sh
PORT=8000 deno run -A /path/to/artifact-canvas-mcp/main.ts
```

Configure the HTTP client to connect to `http://127.0.0.1:8000/mcp`. On
PowerShell, set the port before starting the process:

```powershell
$env:PORT = "8000"
deno run -A C:/path/to/artifact-canvas-mcp/main.ts
```

## Tools

- `artifact_create` creates an artifact and returns a clickable local link.
  `type` is optional and defaults to `markdown`.
- `artifact_update` replaces an artifact's title and content; omitting `type`
  preserves its existing type.
- `artifact_edit` replaces one exact, unique substring in an artifact's content
  using `oldText` and `newText`. The match must occur exactly once. It preserves
  the artifact's title, type, and language, and updates the canvas immediately.
- `artifact_list` lists current artifacts and their types.
- `artifact_delete` removes an artifact.
- `get_logs` returns recent in-memory log entries, optionally filtered by level
  and limited to the latest entries. The buffer keeps up to 500 entries for the
  lifetime of the MCP process.

## Agent guidance

The server includes initialization instructions that direct agents to read the
`artifact-canvas://skill` resource before using the artifact tools. The resource
serves the bundled `.agents/skills/artifact-canvas/SKILL.md` as Markdown, so the
tool guidance and project skill share one source.

Supported artifact types:

- `markdown`: rendered Markdown with headings, links, tables, fenced code, and
  task lists. Fenced blocks with a recognized language use syntax highlighting;
  unrecognized or unlabeled blocks remain safely escaped plain code. Raw
  embedded HTML is disabled.
- `text`: literal text with whitespace preserved.
- `code`: code in a scrollable, syntax-highlighted block. Pass a recognized
  `language` identifier to enable highlighting; otherwise code is shown safely
  without highlighting.
- `html`: self-contained HTML with inline styles and scripts in a sandboxed
  iframe. Scripts have no network access and cannot read the canvas page.
- `interactive`: an A2UI component tree rendered across the full pane beside the
  sidebar, without the outer document title/card or width constraint. Uses the
  official Lit renderer inside the existing Preact canvas; React is not
  required. Supply structured `{components, data}` content to `artifact_create`,
  or its JSON string representation to the tools or HTTP API. Components and
  functions are validated against the same registered catalog used by the
  renderer.

## Interactive workflow

`artifact-canvas://catalog` lists supported components and functions. The MCP
resource template `artifact-canvas://catalog/search{?query}` searches their
names, descriptions and schemas in code and returns matching resource URIs. Read
`artifact-canvas://catalog/components/{name}` or
`artifact-canvas://catalog/functions/{name}` for the schema and referenced
types. The catalog includes the 18 basic components, standard functions, and a
local `increment` function for counters. Dependencies are pinned to A2UI 0.14.0,
using the v0.9 protocol API. See `examples/interactive.json` for a working
form/counter.

Create an interactive artifact, return its link, then call
`wait_for_event({id, after, name?, timeoutMs?})` only when a response is needed.
It waits exclusively for a configured `action.event`. Bound controls and local
`action.functionCall` actions run in the browser and never complete the wait.
The event contains its name, source component/surface, timestamp, resolved
context, and cursor. Pass the last cursor as `after` to avoid repeats. Events
arriving before the wait are retained, up to 500 per artifact. An expired cursor
is reported rather than silently dropping input. A timeout returns
`{status:"timeout",cursor}`; zero polls and omitting it waits until an event or
MCP cancellation. Client request timeouts may still apply. Name-filtered timeout
cursors skip nonmatching events.

`artifact_ui_update({id, components?, removeComponents?, dataUpdates?, expectedRevision?})`
upserts complete node definitions by ID, removes named nodes, and writes
specific JSON Pointer data paths. Omitted `value` deletes a data path. This
preserves untouched local input; update parent references when removing
children. The browser replays revisioned updates and keeps mounted documents
alive across sidebar switches. SSE reconnects resync the artifact list; if more
than 100 revisions were missed the interface resets to its stored snapshot with
a visible notice. `artifact_update`/`artifact_edit` intentionally replace/reset
the whole interface.

`artifact_read` returns stored content, revision and current event cursor. It
does not read unsent browser edits: submitted values are available in event
context. Server-action events are posted through a same-origin JSON endpoint and
checked against the source component's declared event. The stdio and HTTP MCP
transports share one registration implementation. All state remains in memory.

The page updates as tools change artifacts. Its top bar offers a text-only
dark/light mode toggle; the choice is saved in browser local storage. State
lives in memory and is cleared when the MCP process exits. For local
development, run `deno task start` separately to serve the page without MCP.

## Development

Fresh project setup follows https://fresh.deno.dev/docs/getting-started

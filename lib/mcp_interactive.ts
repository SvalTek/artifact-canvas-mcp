import {
  McpServer,
  ResourceTemplate,
} from "npm:@modelcontextprotocol/server@2.3.0";
import * as z from "npm:zod@4.6.5/v4";
import { getArtifact, updateInteractive } from "./artifacts.ts";
import { canvasCatalog, type UIComponent } from "./a2ui.ts";
import { catalogEntry, catalogIndex, searchCatalog } from "./catalog.ts";
import { eventCursor, waitForEvent } from "./ui_events.ts";
import { captureToolError } from "./logs.ts";

export const interactiveSpecSchema = z.object({
  components: z.array(z.record(z.string(), z.unknown())).min(1).max(300),
  data: z.record(z.string(), z.unknown()),
});
export function resourceJson(uri: URL, value: unknown) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2),
    }],
  };
}
function result(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function registerInteractive(server: McpServer, baseUrl: () => string) {
  server.registerResource(
    "interactive-catalog",
    "artifact-canvas://catalog",
    {
      description:
        "Available interactive components and functions. Search with artifact-canvas://catalog/search?query=...; read the returned entry URIs for schemas.",
      mimeType: "application/json",
    },
    (uri) =>
      resourceJson(uri, {
        catalogId: canvasCatalog.id,
        entries: catalogIndex(),
      }),
  );
  server.registerResource(
    "interactive-catalog-search",
    new ResourceTemplate(
      "artifact-canvas://catalog/search{?query}",
      { list: undefined },
    ),
    {
      description:
        "Search the interactive UI catalog by query: component names, purpose, form controls, layout, local logic or submission. Returns matching entry resource URIs.",
      mimeType: "application/json",
    },
    (uri) =>
      resourceJson(uri, searchCatalog(uri.searchParams.get("query") ?? "")),
  );
  server.registerResource(
    "interactive-catalog-entry",
    new ResourceTemplate(
      "artifact-canvas://catalog/{kind}/{name}",
      {
        list: undefined,
        complete: {
          kind: (value) =>
            ["components", "functions"].filter((kind) =>
              kind.startsWith(value)
            ),
          name: (value) =>
            catalogIndex().map((entry) => entry.name).filter((name) =>
              name.toLowerCase().includes(value.toLowerCase())
            ),
        },
      },
    ),
    {
      description:
        "Read one interactive catalog component or function, including its schema and referenced definitions. kind is components or functions.",
      mimeType: "application/json",
    },
    (uri, variables) =>
      resourceJson(
        uri,
        catalogEntry(String(variables.kind), String(variables.name)),
      ),
  );

  server.registerTool("artifact_read", {
    description:
      "Read an artifact's current content, UI revision and latest event cursor. Local edits stay in the browser until a configured action.event supplies them in its context.",
    inputSchema: z.object({ id: z.string().min(1) }),
  }, ({ id }) =>
    captureToolError("artifact_read", () => {
      const artifact = getArtifact(id);
      if (!artifact) throw new Error(`Unknown artifact: ${id}`);
      return result({ ...artifact, eventCursor: eventCursor(id) });
    }));

  server.registerTool(
    "artifact_ui_update",
    {
      description:
        "Incrementally update an interactive artifact without resetting local controls. Components are upserted by ID (provide each full definition); removeComponents removes nodes (also update parents). dataUpdates use JSON Pointer paths, omitting value deletes that path. Untouched fields preserve local edits. Use artifact_update for a full reset.",
      inputSchema: z.object({
        id: z.string().min(1),
        components: z.array(z.record(z.string(), z.unknown())).max(300)
          .optional(),
        dataUpdates: z.array(
          z.object({ path: z.string(), value: z.unknown().optional() }),
        ).max(300).optional(),
        expectedRevision: z.number().int().nonnegative().optional(),
        removeComponents: z.array(z.string()).max(300).optional(),
      }),
    },
    ({ id, components, removeComponents, dataUpdates, expectedRevision }) =>
      captureToolError("artifact_ui_update", () => {
        if (
          !components?.length && !removeComponents?.length &&
          !dataUpdates?.length
        ) {
          throw new Error("Provide components or dataUpdates.");
        }
        const artifact = updateInteractive(id, {
          ...(components ? { components: components as UIComponent[] } : {}),
          ...(removeComponents ? { removeComponents } : {}),
          ...(dataUpdates ? { dataUpdates } : {}),
        }, expectedRevision);
        return result({
          id,
          revision: artifact.ui!.revision,
          eventCursor: eventCursor(id),
          url: `${baseUrl()}/?artifact=${encodeURIComponent(id)}`,
        });
      }),
  );

  server.registerTool(
    "wait_for_event",
    {
      description:
        "Wait for an interactive artifact's explicit action.event. Local input changes and action.functionCall do not complete this wait. Events are queued even before waiting. Pass after from the last result to avoid repeats; default 0 reads from the beginning. Optional name filters by event name. Omit timeoutMs to wait until an event or client cancellation; timeoutMs:0 polls. A timeout is a normal result. Return the artifact link to the user before waiting.",
      inputSchema: z.object({
        id: z.string().min(1),
        after: z.number().int().nonnegative().optional(),
        name: z.string().min(1).optional(),
        timeoutMs: z.number().int().nonnegative().max(2_147_483_647).optional(),
      }),
    },
    (input, context) =>
      captureToolError(
        "wait_for_event",
        async () =>
          result(
            await waitForEvent({ ...input, signal: context.mcpReq.signal }),
          ),
      ),
  );
}

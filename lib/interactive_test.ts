import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "$std/assert/mod.ts";
import {
  ComponentContext,
  GenericBinder,
  MessageProcessor,
} from "@a2ui/web_core/v0_9";
import {
  canvasCatalog,
  parseUISpec,
  surfaceMessages,
  type UISpec,
} from "./a2ui.ts";
import {
  deleteArtifact,
  getArtifact,
  saveArtifact,
  updateInteractive,
} from "./artifacts.ts";
import { enqueueEvent, eventCursor, waitForEvent } from "./ui_events.ts";
import { catalogEntry, searchCatalog } from "./catalog.ts";
import { createCanvasServer } from "./mcp_server.ts";
import { createMcpHandler } from "npm:@modelcontextprotocol/server@2.3.0";
import { handler as artifactApi } from "../routes/api/artifacts/index.ts";

const example: UISpec = JSON.parse(
  Deno.readTextFileSync(
    new URL("../examples/interactive.json", import.meta.url),
  ),
);

Deno.test("HTTP rejects malformed interactive content with a client error", async () => {
  const response = await artifactApi.POST(
    new Request("http://localhost/api/artifacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Invalid",
        type: "interactive",
        content: "{}",
      }),
    }),
  );
  assertEquals(response.status, 400);
  assert((await response.json()).error.includes("components"));
});
function create() {
  return saveArtifact({
    title: "Test",
    type: "interactive",
    content: JSON.stringify(example),
  });
}
function event(sourceComponentId = "submit", name = "response") {
  return {
    name,
    sourceComponentId,
    surfaceId: "main",
    timestamp: new Date().toISOString(),
    context: { name: "Test", count: 1 },
  };
}

Deno.test("bindings and local function actions do not submit; action.event resolves current context", async () => {
  const artifact = create();
  const processor = new MessageProcessor([canvasCatalog], (input) => {
    enqueueEvent(artifact.id, artifact.ui!.epoch, input);
  });
  try {
    processor.processMessages(surfaceMessages(example));
    const surface = processor.model.getSurface("main")!;
    surface.dataModel.set("/name", "Ada");
    surface.dataModel.set("/quantity", 7);
    const increment = new ComponentContext(surface, "increment");
    const incrementBinding = new GenericBinder<{ action: () => Promise<void> }>(
      increment,
      canvasCatalog.components.get("Button")!.schema,
    );
    await incrementBinding.snapshot.action();
    incrementBinding.dispose();
    assertEquals(surface.dataModel.get("/count"), 1);
    assertEquals(await waitForEvent({ id: artifact.id, timeoutMs: 0 }), {
      status: "timeout",
      cursor: 0,
    });
    const waiting = waitForEvent({
      id: artifact.id,
      name: "response",
      timeoutMs: 500,
    });
    const submit = new ComponentContext(surface, "submit");
    const submitBinding = new GenericBinder<{ action: () => Promise<void> }>(
      submit,
      canvasCatalog.components.get("Button")!.schema,
    );
    await submitBinding.snapshot.action();
    submitBinding.dispose();
    const result = await waiting;
    assertEquals(result.status, "event");
    if (result.status === "event") {
      assertEquals(result.event.context, {
        name: "Ada",
        quantity: 7,
        count: 1,
      });
    }
  } finally {
    processor.dispose();
    deleteArtifact(artifact.id);
  }
});

Deno.test("events before waiting are queued, filters select events and cursors prevent replays", async () => {
  const artifact = create();
  try {
    enqueueEvent(artifact.id, artifact.ui!.epoch, event());
    const result = await waitForEvent({
      id: artifact.id,
      name: "response",
      timeoutMs: 0,
    });
    assertEquals(result.status, "event");
    assertEquals(
      await waitForEvent({
        id: artifact.id,
        after: result.cursor,
        timeoutMs: 0,
      }),
      { status: "timeout", cursor: 1 },
    );
    assertEquals(
      (await waitForEvent({ id: artifact.id, name: "other", timeoutMs: 0 }))
        .status,
      "timeout",
    );
    assertThrows(
      () => enqueueEvent(artifact.id, artifact.ui!.epoch, event("increment")),
      Error,
      "does not declare",
    );
    assertThrows(
      () => enqueueEvent(artifact.id, "stale", event()),
      Error,
      "replaced",
    );
  } finally {
    deleteArtifact(artifact.id);
  }
});

Deno.test("wait cancellation, replacement and deletion release pending listeners", async () => {
  const artifact = create();
  try {
    const controller = new AbortController();
    const cancelled = assertRejects(
      () => waitForEvent({ id: artifact.id, signal: controller.signal }),
      Error,
      "cancelled",
    );
    controller.abort();
    await cancelled;
    const replaced = assertRejects(
      () => waitForEvent({ id: artifact.id }),
      Error,
      "replaced",
    );
    saveArtifact({
      id: artifact.id,
      title: "Replaced",
      type: "interactive",
      content: JSON.stringify(example),
    });
    await replaced;
    const deleted = assertRejects(
      () => waitForEvent({ id: artifact.id }),
      Error,
      "deleted",
    );
    deleteArtifact(artifact.id);
    await deleted;
  } finally {
    deleteArtifact(artifact.id);
  }
});

Deno.test("incremental updates preserve epoch and untouched data, and reject invalid updates atomically", () => {
  const artifact = create();
  try {
    const updated = updateInteractive(artifact.id, {
      components: [{ id: "title", component: "Text", text: "Updated" }],
      dataUpdates: [{ path: "/quantity", value: 5 }],
    }, 0);
    assertEquals(updated.ui?.epoch, artifact.ui?.epoch);
    assertEquals(updated.ui?.revision, 1);
    assertEquals(JSON.parse(updated.content).data, {
      name: "",
      quantity: 5,
      count: 0,
    });
    assertThrows(
      () =>
        updateInteractive(artifact.id, {
          components: [{
            id: "root",
            component: "Column",
            children: ["missing"],
          }],
        }),
      Error,
      "Missing",
    );
    assertThrows(
      () =>
        updateInteractive(artifact.id, {
          dataUpdates: [{ path: "/__proto__/bad", value: 1 }],
        }),
      Error,
    );
    assertThrows(
      () =>
        updateInteractive(artifact.id, {
          dataUpdates: [{ path: "/count", value: 2 }],
        }, 0),
      Error,
      "Revision conflict",
    );
    assertEquals(getArtifact(artifact.id), updated);
    const removed = updateInteractive(artifact.id, {
      components: [{
        id: "root",
        component: "Column",
        children: ["title", "intro", "name", "quantity", "count", "submit"],
      }],
      removeComponents: ["increment", "incrementLabel"],
    }, 1);
    assertEquals(
      parseUISpec(removed.content).components.length,
      example.components.length - 2,
    );
  } finally {
    deleteArtifact(artifact.id);
  }
});

Deno.test("catalog resources are derived from supported schemas, include functions and resolve refs", () => {
  assert(
    searchCatalog("date appointment").matches.some((entry) =>
      entry.name === "DateTimeInput"
    ),
  );
  assert(
    searchCatalog("increment").matches.some((entry) =>
      entry.kind === "functions"
    ),
  );
  const entry = catalogEntry("components", "Button");
  assert("Action" in entry.schema.$defs);
  assert("ChildList" in catalogEntry("components", "Column").schema.$defs);
  assertThrows(() => catalogEntry("components", "Invented"), Error, "Unknown");
  const invalid = structuredClone(example);
  invalid.components[0].children = ["root"];
  assertThrows(() => parseUISpec(JSON.stringify(invalid)), Error, "Circular");
});

Deno.test("MCP exposes query resources, structured interactive creation, updates and event waits", async () => {
  const server = createCanvasServer(() => "http://localhost:8000");
  const handler = createMcpHandler(() => server);
  let requestId = 0;
  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const response = await handler.fetch(
      new Request("http://localhost:8000/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++requestId,
          method,
          params,
        }),
      }),
    );
    const text = await response.text();
    const payload = JSON.parse(
      text.startsWith("event:")
        ? text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)
        : text,
    );
    if (payload.error) throw new Error(JSON.stringify(payload.error));
    return payload.result;
  }
  let id = "";
  try {
    await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    const templates = await rpc("resources/templates/list");
    assert(
      templates.resourceTemplates.some((item: { uriTemplate: string }) =>
        item.uriTemplate.includes("{?query}")
      ),
    );
    const search = await rpc("resources/read", {
      uri: "artifact-canvas://catalog/search?query=slider",
    });
    assert(
      JSON.parse(search.contents[0].text).matches.some((
        item: { name: string },
      ) => item.name === "Slider"),
    );
    const created = await rpc("tools/call", {
      name: "artifact_create",
      arguments: { title: "MCP test", type: "interactive", content: example },
    });
    assert(!created.isError, JSON.stringify(created));
    id = created.structuredContent.id;
    assertEquals(created.structuredContent.type, "interactive");
    const updated = await rpc("tools/call", {
      name: "artifact_ui_update",
      arguments: { id, dataUpdates: [{ path: "/count", value: 3 }] },
    });
    assertEquals(updated.structuredContent.revision, 1);
    const poll = await rpc("tools/call", {
      name: "wait_for_event",
      arguments: { id, timeoutMs: 0 },
    });
    assertEquals(poll.structuredContent.status, "timeout");
    enqueueEvent(id, getArtifact(id)!.ui!.epoch, event());
    const received = await rpc("tools/call", {
      name: "wait_for_event",
      arguments: { id, timeoutMs: 0 },
    });
    assertEquals(received.structuredContent.event.name, "response");
    assertEquals(eventCursor(id), 1);
  } finally {
    if (id) deleteArtifact(id);
    await server.close();
  }
});

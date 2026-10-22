import type { Handlers } from "$fresh/server.ts";
import { enqueueEvent } from "../../../../lib/ui_events.ts";

export const handler: Handlers = {
  async POST(request, context) {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return Response.json({ error: "Same-origin requests only." }, {
        status: 403,
      });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return Response.json({ error: "Expected application/json." }, {
        status: 415,
      });
    }
    try {
      const text = await request.text();
      if (text.length > 100_000) throw new Error("Event exceeds 100 KB.");
      const { epoch, event } = JSON.parse(text);
      const accepted = enqueueEvent(context.params.id, epoch, event);
      return Response.json({ cursor: accepted.cursor });
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : "Invalid event.",
      }, { status: 400 });
    }
  },
};

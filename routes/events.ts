import { subscribe } from "../lib/artifacts.ts";

export const handler = {
  GET() {
    let cleanup = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(": canvas connected\n\n"));
        const unsubscribe = subscribe((artifact) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(artifact)}\n\n`),
          );
        });
        const heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(": ping\n\n")),
          20_000,
        );
        cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
        };
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  },
};

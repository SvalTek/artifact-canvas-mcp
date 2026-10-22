import { A2uiSurface, type LitComponentApi } from "@a2ui/lit/v0_9";
import {
  injectBasicCatalogStyles,
  MessageProcessor,
} from "@a2ui/web_core/v0_9";
import { canvasCatalog, parseUISpec, surfaceMessages } from "./a2ui.ts";
import type { Artifact } from "./artifacts.ts";

// Imported only after the Preact island mounts: Custom Elements never run in SSR.
export function mountInteractive(
  host: HTMLElement,
  initial: Artifact,
  report: (message: string) => void,
) {
  injectBasicCatalogStyles();
  let processor: MessageProcessor | undefined;
  let epoch = "";
  let revision = -1;
  let artifact = initial;
  let disposed = false;
  const requests = new Set<AbortController>();

  function reset(next: Artifact) {
    processor?.dispose();
    host.replaceChildren();
    epoch = next.ui!.epoch;
    revision = next.ui!.revision;
    const instance = new MessageProcessor<LitComponentApi>(
      [canvasCatalog],
      async (event) => {
        const controller = new AbortController();
        requests.add(controller);
        try {
          const response = await fetch(
            `/api/artifacts/${encodeURIComponent(artifact.id)}/events`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ epoch, event }),
              signal: controller.signal,
            },
          );
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error ?? "Could not send your response.");
          }
          if (!disposed) report("");
        } catch (error) {
          if (!disposed && !controller.signal.aborted) {
            report(
              error instanceof Error
                ? error.message
                : "Could not send your response.",
            );
          }
        } finally {
          requests.delete(controller);
        }
      },
    );
    processor = instance;
    instance.processMessages(surfaceMessages(parseUISpec(next.content)));
    const element = new A2uiSurface();
    element.surface = instance.model.getSurface("main");
    host.append(element);
  }

  function update(next: Artifact) {
    artifact = next;
    if (!next.ui || disposed) return;
    if (!processor || epoch !== next.ui.epoch) {
      reset(next);
      return;
    }
    if (revision === next.ui.revision) return;
    const changes = next.ui.changes.filter((change) =>
      change.revision > revision
    );
    if (changes[0]?.revision !== revision + 1) {
      reset(next);
      report("Reconnected to the latest interface; local edits were reset.");
      return;
    }
    for (const change of changes) {
      if (change.components?.length) {
        processor.processMessages({
          version: "v0.9",
          updateComponents: {
            surfaceId: "main",
            components: change.components,
          },
        });
      }
      for (const id of change.removeComponents ?? []) {
        processor.model.getSurface("main")?.componentsModel.removeComponent(id);
      }
      for (const update of change.dataUpdates ?? []) {
        processor.processMessages({
          version: "v0.9",
          updateDataModel: { surfaceId: "main", ...update },
        });
      }
      revision = change.revision;
    }
  }
  update(initial);
  return {
    update,
    dispose() {
      disposed = true;
      for (const request of requests) request.abort();
      processor?.dispose();
      host.replaceChildren();
    },
  };
}

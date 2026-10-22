import { getArtifact, subscribe } from "./artifacts.ts";
import { assertJson, parseUISpec } from "./a2ui.ts";

export interface CanvasEvent {
  cursor: number;
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp: string;
  context: Record<string, unknown>;
}
const queues = new Map<string, CanvasEvent[]>();
const cursors = new Map<string, number>();
const epochs = new Map<string, string>();
const listeners = new Set<() => void>();
const MAX_EVENTS = 500;

subscribe((artifact) => {
  if (artifact.title && artifact.type === "interactive") {
    if (epochs.get(artifact.id) === artifact.ui?.epoch) return;
    epochs.set(artifact.id, artifact.ui!.epoch);
    queues.delete(artifact.id);
    for (const listener of listeners) listener();
    return;
  }
  queues.delete(artifact.id);
  cursors.delete(artifact.id);
  epochs.delete(artifact.id);
  for (const listener of listeners) listener();
});

export function enqueueEvent(
  id: string,
  epoch: string,
  input: unknown,
): CanvasEvent {
  const artifact = getArtifact(id);
  if (!artifact || artifact.type !== "interactive") {
    throw new Error("Unknown interactive artifact.");
  }
  if (artifact.ui?.epoch !== epoch) {
    throw new Error(
      "This interface was replaced. Reload it before submitting.",
    );
  }
  assertJson(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Expected an action.event payload.");
  }
  const event = input as Record<string, unknown>;
  if (
    typeof event.name !== "string" || event.surfaceId !== "main" ||
    typeof event.sourceComponentId !== "string" ||
    typeof event.timestamp !== "string" ||
    !Number.isFinite(Date.parse(event.timestamp)) || !event.context ||
    typeof event.context !== "object" || Array.isArray(event.context)
  ) {
    throw new Error("Invalid action.event payload.");
  }
  const spec = parseUISpec(artifact.content);
  const node = spec.components.find((node) =>
    node.id === event.sourceComponentId
  );
  const action = node?.action as { event?: { name?: string } } | undefined;
  if (!action?.event || action.event.name !== event.name) {
    throw new Error("The source component does not declare this action.event.");
  }
  const cursor = (cursors.get(id) ?? 0) + 1;
  const entry: CanvasEvent = {
    cursor,
    name: event.name,
    surfaceId: "main",
    sourceComponentId: event.sourceComponentId,
    timestamp: event.timestamp,
    context: structuredClone(event.context as Record<string, unknown>),
  };
  cursors.set(id, cursor);
  const queue = queues.get(id) ?? [];
  queue.push(entry);
  if (queue.length > MAX_EVENTS) queue.shift();
  queues.set(id, queue);
  for (const listener of listeners) listener();
  return entry;
}

export function eventCursor(id: string): number {
  return cursors.get(id) ?? 0;
}

export function waitForEvent(options: {
  id: string;
  after?: number;
  name?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<
  { status: "event"; event: CanvasEvent; cursor: number } | {
    status: "timeout";
    cursor: number;
  }
> {
  const { id, after = 0, name, timeoutMs, signal } = options;
  const epoch = getArtifact(id)?.ui?.epoch;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      listeners.delete(check);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Event wait cancelled."));
    };
    const check = () => {
      const artifact = getArtifact(id);
      if (!artifact || artifact.type !== "interactive") {
        cleanup();
        reject(new Error("Interactive artifact was deleted or changed type."));
        return;
      }
      if (artifact.ui?.epoch !== epoch) {
        cleanup();
        reject(
          new Error("The interactive artifact was replaced; start a new wait."),
        );
        return;
      }
      const queue = queues.get(id) ?? [];
      if (queue.length && after < queue[0].cursor - 1) {
        cleanup();
        reject(
          new Error(
            `Event cursor expired; oldest available cursor is ${
              queue[0].cursor
            }.`,
          ),
        );
        return;
      }
      const event = queue.find((event) =>
        event.cursor > after && (!name || event.name === name)
      );
      if (event) {
        cleanup();
        resolve({
          status: "event",
          event: structuredClone(event),
          cursor: event.cursor,
        });
      }
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    listeners.add(check);
    signal?.addEventListener("abort", abort, { once: true });
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        cleanup();
        resolve({ status: "timeout", cursor: eventCursor(id) });
      }, timeoutMs);
    }
    check();
  });
}

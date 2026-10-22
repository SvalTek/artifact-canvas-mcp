import {
  basicCatalog,
  Catalog,
  createFunctionImplementation,
  DataModel,
} from "@a2ui/web_core/v0_9";
import { z } from "zod3";

// Shared by the renderer, validator, and searchable MCP resources.
export const canvasCatalog = new Catalog(
  "artifact-canvas://catalog/v1",
  "0.9",
  [...basicCatalog.components.values()],
  [
    ...basicCatalog.functions.values(),
    createFunctionImplementation({
      name: "increment",
      description:
        "Locally increment a numeric data path; emits no server event.",
      returnType: "void",
      allowedCallers: "rendererOnly",
      requiresUserActivation: true,
      schema: z.object({ target: z.string(), amount: z.number().default(1) }),
    }, (args, context) => {
      if (!context.isUserActivated) return;
      const path = DataModel.resolvePath(args.target, context.path);
      const value = context.dataModel.get(path) ?? 0;
      if (typeof value !== "number") {
        throw new Error("increment needs a number");
      }
      context.dataModel.set(path, value + args.amount);
    }),
  ],
);

export interface UIComponent extends Record<string, unknown> {
  id: string;
  component: string;
}
export interface UISpec {
  components: UIComponent[];
  data: Record<string, unknown>;
}
export interface DataUpdate {
  path: string;
  value?: unknown;
}
export interface UIChange {
  revision: number;
  components?: UIComponent[];
  removeComponents?: string[];
  dataUpdates?: DataUpdate[];
}
export interface UIState {
  epoch: string;
  revision: number;
  changes: UIChange[];
}

export function assertJson(value: unknown, depth = 0): void {
  if (depth > 50) throw new Error("UI JSON is too deeply nested.");
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) assertJson(item, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new Error(`Forbidden JSON key: ${key}`);
      }
      assertJson(item, depth + 1);
    }
    return;
  }
  throw new Error("Expected JSON data.");
}

export function parseUISpec(content: string): UISpec {
  if (content.length > 1_000_000) throw new Error("UI exceeds 1 MB.");
  const value = JSON.parse(content);
  assertJson(value);
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    !Array.isArray(value.components) || !value.data ||
    typeof value.data !== "object" || Array.isArray(value.data)
  ) {
    throw new Error(
      "Interactive content must contain {components: [...], data: {...}}.",
    );
  }
  if (value.components.length > 300) {
    throw new Error("UI exceeds 300 components.");
  }
  const ids = new Set<string>();
  for (const node of value.components) {
    if (
      !node || typeof node.id !== "string" || !/^[\w-]{1,100}$/.test(node.id) ||
      typeof node.component !== "string"
    ) throw new Error("Each component needs an id and component name.");
    if (ids.has(node.id)) throw new Error(`Duplicate component ID: ${node.id}`);
    ids.add(node.id);
    const api = canvasCatalog.components.get(node.component);
    if (!api) throw new Error(`Unknown component: ${node.component}`);
    const { id: _id, component: _component, ...props } = node;
    const parsed = api.schema.safeParse(props);
    if (!parsed.success) {
      throw new Error(`Invalid ${node.id}: ${parsed.error.message}`);
    }
  }
  if (!ids.has("root")) throw new Error("Include a component with id root.");
  const nodes = new Map<string, UIComponent>(
    value.components.map((node: UIComponent) => [node.id, node]),
  );
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string, depth: number) {
    if (depth > 40) throw new Error("Component tree exceeds 40 levels.");
    if (active.has(id)) throw new Error(`Circular component reference: ${id}`);
    if (visited.has(id)) return;
    const node = nodes.get(id);
    if (!node) throw new Error(`Missing child component: ${id}`);
    active.add(id);
    const refs = canvasCatalog.componentRefMap[node.component];
    for (const key of refs.singleRefs) {
      if (typeof node[key] === "string") visit(node[key] as string, depth + 1);
    }
    for (const key of refs.listRefs) {
      const children = node[key];
      if (Array.isArray(children)) {
        for (const child of children) {
          if (typeof child === "string") visit(child, depth + 1);
          else if (child && typeof child === "object") {
            for (const nested of refs.nestedRefs?.[key] ?? []) {
              if (typeof child[nested] === "string") {
                visit(child[nested], depth + 1);
              }
            }
          }
        }
      } else if (
        children && typeof children === "object" && "componentId" in children
      ) {
        visit(String(children.componentId), depth + 1);
      }
    }
    active.delete(id);
    visited.add(id);
  }
  visit("root", 0);
  if (visited.size !== ids.size) {
    throw new Error("All components must be reachable from root.");
  }
  validateCalls(value.components);
  return value;
}

function validateCalls(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    if (
      typeof item.call === "string" && !canvasCatalog.functions.has(item.call)
    ) {
      throw new Error(`Unknown function: ${item.call}`);
    }
  }
  for (const child of Object.values(value)) validateCalls(child);
}

export function applyUIChange(
  spec: UISpec,
  change: Omit<UIChange, "revision">,
): UISpec {
  const nodes = new Map(spec.components.map((node) => [node.id, node]));
  for (const node of change.components ?? []) nodes.set(node.id, node);
  for (const id of change.removeComponents ?? []) nodes.delete(id);
  const model = new DataModel(structuredClone(spec.data));
  try {
    for (const update of change.dataUpdates ?? []) {
      if (update.value !== undefined) assertJson(update.value);
      model.set(update.path, update.value);
    }
    return parseUISpec(
      JSON.stringify({ components: [...nodes.values()], data: model.get("/") }),
    );
  } finally {
    model.dispose();
  }
}

export function surfaceMessages(spec: UISpec) {
  return [
    {
      version: "v0.9" as const,
      createSurface: { surfaceId: "main", catalogId: canvasCatalog.id },
    },
    {
      version: "v0.9" as const,
      updateComponents: { surfaceId: "main", components: spec.components },
    },
    {
      version: "v0.9" as const,
      updateDataModel: {
        surfaceId: "main",
        path: "/",
        value: structuredClone(spec.data),
      },
    },
  ];
}

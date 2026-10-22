import { canvasCatalog } from "./a2ui.ts";

const hints: Record<string, string> = {
  Text: "Display headings, paragraphs, labels and bound values.",
  Row: "Horizontal layout of child components.",
  Column: "Vertical layout of child components.",
  List: "Repeated items from a data collection using a child template.",
  Card: "Group content in a visual card with one child.",
  Tabs: "Switch between sections locally.",
  Modal: "Open and close a local dialog.",
  Divider: "Separate sections horizontally or vertically.",
  TextField: "Form input: edit text, numbers or passwords locally.",
  CheckBox: "Form input: toggle a boolean locally.",
  ChoicePicker: "Form input: select options, dropdown, chips, multiple choice.",
  Slider: "Form input: adjust a numeric range locally.",
  DateTimeInput: "Form input: choose a date, time or appointment locally.",
  Button:
    "Run a local action.functionCall or submit an action.event to the agent.",
  Image: "Display an image or photo.",
  Icon: "Display a named icon.",
  AudioPlayer: "Play audio with local controls.",
  Video: "Play video with local controls.",
};
const schema = canvasCatalog.validationSchema;
const components = schema.components as Record<string, Record<string, unknown>>;
const functions = schema.functions as Record<string, Record<string, unknown>>;

export function catalogIndex() {
  return [
    ...[...canvasCatalog.components.keys()].map((name) => ({
      name,
      kind: "components",
      description: hints[name] ?? name,
      uri: `artifact-canvas://catalog/components/${name}`,
    })),
    ...[...canvasCatalog.functions.values()].map((fn) => ({
      name: fn.name,
      kind: "functions",
      description: fn.description ??
        String(functions[fn.name]?.description ?? fn.name),
      uri: `artifact-canvas://catalog/functions/${fn.name}`,
    })),
  ];
}

export function searchCatalog(query: string) {
  if (query.length > 500) {
    throw new Error("Catalog query exceeds 500 characters.");
  }
  const terms = query.toLowerCase().match(/[\w]+/g) ?? [];
  const ranked = catalogIndex().map((entry) => {
    const text = `${entry.name} ${entry.description} ${
      JSON.stringify(
        (entry.kind === "components" ? components : functions)[entry.name],
      )
    }`.toLowerCase();
    const score = terms.reduce(
      (sum, term) =>
        sum +
        (entry.name.toLowerCase().includes(term)
          ? 10
          : text.includes(term)
          ? 1
          : 0),
      0,
    );
    return { ...entry, score };
  }).filter((entry) => !terms.length || entry.score > 0).sort((a, b) =>
    b.score - a.score || a.name.localeCompare(b.name)
  );
  return {
    catalogId: canvasCatalog.id,
    query,
    matches: ranked.slice(0, 15),
    total: ranked.length,
  };
}

export function catalogEntry(kind: string, name: string) {
  if (kind !== "components" && kind !== "functions") {
    throw new Error("Expected components or functions.");
  }
  const entry = (kind === "components" ? components : functions)[name];
  if (!entry) throw new Error(`Unknown catalog entry: ${name}`);
  const allDefs = schema.$defs as Record<string, unknown>;
  const definitions: Record<string, unknown> = {};
  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (
      "$ref" in value && typeof value.$ref === "string" &&
      value.$ref.startsWith("#/$defs/")
    ) {
      const key = value.$ref.slice(8);
      if (!(key in definitions) && key in allDefs) {
        definitions[key] = allDefs[key];
        collect(allDefs[key]);
      }
    }
    for (const child of Object.values(value)) collect(child);
  }
  collect(entry);
  return {
    catalogId: canvasCatalog.id,
    kind,
    name,
    description: hints[name],
    schema: { ...entry, $defs: definitions },
    guidance:
      "Properties go beside id and component. Bind values with {path:'/key'}. action.functionCall runs locally; action.event sends its named event and resolved context to wait_for_event. Only registered functions can execute.",
  };
}

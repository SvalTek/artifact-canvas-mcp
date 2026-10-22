import { McpServer } from "npm:@modelcontextprotocol/server@2.3.0";
import * as z from "npm:zod@4.6.5/v4";
import { captureToolError, errorMessage, getLogs, writeLog } from "./logs.ts";
import {
  ARTIFACT_TYPES,
  deleteArtifact,
  editArtifactContent,
  getArtifact,
  listArtifacts,
  saveArtifact,
} from "./artifacts.ts";
import {
  ARTIFACT_CANVAS_INSTRUCTIONS,
  ARTIFACT_CANVAS_RESOURCE_DESCRIPTION,
  ARTIFACT_CANVAS_SKILL,
  ARTIFACT_CANVAS_SKILL_URI,
} from "./mcp_guidance.ts";
import { registerInteractive } from "./mcp_interactive.ts";
import { interactiveSpecSchema } from "./mcp_interactive.ts";
import { eventCursor } from "./ui_events.ts";

export function createCanvasServer(baseUrl: () => string) {
  const server = new McpServer({
    name: "artifact-canvas",
    version: "0.2.0",
    description:
      `Create and manage artifacts on the local live canvas. Read ${ARTIFACT_CANVAS_SKILL_URI} first.`,
  }, { instructions: ARTIFACT_CANVAS_INSTRUCTIONS });
  server.server.onerror = (error) =>
    writeLog("error", "mcp", errorMessage(error));
  server.registerResource(
    "artifact-canvas-skill",
    ARTIFACT_CANVAS_SKILL_URI,
    {
      title: "Artifact Canvas skill",
      description: ARTIFACT_CANVAS_RESOURCE_DESCRIPTION,
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: ARTIFACT_CANVAS_SKILL,
      }],
    }),
  );

  server.registerTool(
    "artifact_create",
    {
      description:
        "Create an artifact on the external canvas. Types: markdown (default), text, code, html (sandboxed), interactive (A2UI, full pane). For interactive pass content as {components:[...],data:{...}}; root component ID must be root. Discover components/functions using artifact-canvas://catalog/search?query=... and read each entry schema. Local bindings and action.functionCall stay local; action.event supplies wait_for_event. Returns artifact ID, event cursor and clickable URL.",
      inputSchema: z.object({
        title: z.string().min(1),
        content: z.union([z.string(), interactiveSpecSchema]),
        type: z.enum(ARTIFACT_TYPES).optional(),
        language: z.string().optional(),
      }),
    },
    ({ title, content, type, language }) =>
      captureToolError("artifact_create", () => {
        if (typeof content !== "string" && type !== "interactive") {
          throw new Error("Structured content requires type interactive.");
        }
        const artifact = saveArtifact({
          title,
          content: typeof content === "string"
            ? content
            : JSON.stringify(content),
          type,
          language,
        });
        const url = `${baseUrl()}/?artifact=${encodeURIComponent(artifact.id)}`;
        return {
          structuredContent: {
            id: artifact.id,
            type: artifact.type,
            revision: artifact.ui?.revision ?? 0,
            eventCursor: eventCursor(artifact.id),
            url,
          },
          content: [{
            type: "text",
            text:
              `Created “${title}” on the local canvas. Open it: [${title}](${url})`,
          }],
        };
      }),
  );

  server.registerTool(
    "artifact_update",
    {
      description:
        "Replace the title and content of an existing canvas artifact. For interactive artifacts this resets the surface and local edits. Prefer artifact_ui_update for incremental component/data changes.",
      inputSchema: z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        content: z.union([z.string(), interactiveSpecSchema]),
        type: z.enum(ARTIFACT_TYPES).optional(),
        language: z.string().optional(),
      }),
    },
    ({ id, title, content, type, language }) =>
      captureToolError("artifact_update", () => {
        if (!getArtifact(id)) throw new Error(`Unknown artifact: ${id}`);
        if (
          typeof content !== "string" &&
          (type ?? getArtifact(id)?.type) !== "interactive"
        ) throw new Error("Structured content requires type interactive.");
        const artifact = saveArtifact({
          id,
          title,
          content: typeof content === "string"
            ? content
            : JSON.stringify(content),
          type,
          language,
        });
        return {
          structuredContent: {
            id,
            type: artifact.type,
            revision: artifact.ui?.revision ?? 0,
            eventCursor: eventCursor(id),
          },
          content: [{
            type: "text",
            text:
              `Updated “${title}”. [Open it on the canvas](${baseUrl()}/?artifact=${
                encodeURIComponent(id)
              })`,
          }],
        };
      }),
  );

  server.registerTool("artifact_edit", {
    description:
      "Replace one exact, unique substring in an existing artifact's content. Use the complete current text as oldText and the replacement as newText. The match must occur exactly once; missing or repeated matches are errors. Preserves the artifact title, type, and language, and updates the live canvas.",
    inputSchema: z.object({
      id: z.string().min(1),
      oldText: z.string().min(1),
      newText: z.string(),
    }),
  }, ({ id, oldText, newText }) =>
    captureToolError("artifact_edit", () => {
      const artifact = editArtifactContent(id, oldText, newText);
      return {
        content: [{
          type: "text",
          text:
            `Edited “${artifact.title}” on the local canvas. [Open it](${baseUrl()}/?artifact=${
              encodeURIComponent(id)
            })`,
        }],
      };
    }));

  server.registerTool("artifact_list", {
    description: "List artifacts currently on the local canvas.",
    inputSchema: z.object({}),
  }, () =>
    captureToolError("artifact_list", () => ({
      content: [{
        type: "text",
        text: JSON.stringify(
          listArtifacts().map(({ id, title, type, language, updatedAt }) => ({
            id,
            title,
            type,
            ...(language ? { language } : {}),
            updatedAt,
          })),
          null,
          2,
        ),
      }],
    })));

  server.registerTool("artifact_delete", {
    description: "Remove an artifact from the local canvas.",
    inputSchema: z.object({ id: z.string().min(1) }),
  }, ({ id }) =>
    captureToolError("artifact_delete", () => {
      if (!deleteArtifact(id)) throw new Error(`Unknown artifact: ${id}`);
      return {
        content: [{
          type: "text",
          text: "Artifact removed from the local canvas.",
        }],
      };
    }));

  server.registerTool("get_logs", {
    description: "Read recent in-memory server and MCP error logs.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(500).optional(),
      level: z.enum(["debug", "info", "warn", "error"]).optional(),
    }),
  }, ({ limit, level }) => ({
    content: [{
      type: "text",
      text: JSON.stringify(getLogs({ limit, level }), null, 2),
    }],
  }));

  registerInteractive(server, baseUrl);
  return server;
}

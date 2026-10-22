import {
  createMcpHandler,
  McpServer,
} from "npm:@modelcontextprotocol/server@2.3.0";
import * as z from "npm:zod@4.6.5/v4";
import { captureToolError } from "../lib/logs.ts";
import { errorMessage, getLogs, writeLog } from "../lib/logs.ts";
import {
  ARTIFACT_TYPES,
  deleteArtifact,
  editArtifactContent,
  getArtifact,
  listArtifacts,
  saveArtifact,
} from "../lib/artifacts.ts";
import {
  ARTIFACT_CANVAS_INSTRUCTIONS,
  ARTIFACT_CANVAS_RESOURCE_DESCRIPTION,
  ARTIFACT_CANVAS_SKILL,
  ARTIFACT_CANVAS_SKILL_URI,
} from "../lib/mcp_guidance.ts";

const server = new McpServer({
  name: "artifact-canvas",
  version: "0.1.0",
  description:
    `Create and manage artifacts on the local live canvas. Read the ${ARTIFACT_CANVAS_SKILL_URI} resource for the recommended workflow and artifact guidance.`,
}, {
  instructions: ARTIFACT_CANVAS_INSTRUCTIONS,
});
server.server.onerror = (error) =>
  writeLog("error", "mcp:http", errorMessage(error));
let canvasBaseUrl = "";

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
      "Create a canvas artifact. Content defaults to Markdown. Choose text for literal plain text, html for self-contained HTML/JavaScript rendered in a sandbox with network access disabled, or code for a code block. Returns a link the user can open in a browser.",
    inputSchema: z.object({
      title: z.string().min(1),
      content: z.string(),
      type: z.enum(ARTIFACT_TYPES).optional(),
      language: z.string().optional(),
    }),
  },
  ({ title, content, type, language }) =>
    captureToolError("artifact_create", () => {
      const artifact = saveArtifact({ title, content, type, language });
      const url = `${canvasBaseUrl}/?artifact=${
        encodeURIComponent(artifact.id)
      }`;
      return {
        content: [{
          type: "text",
          text: `Created “${title}”. Open it on the canvas: [${title}](${url})`,
        }],
      };
    }),
);

server.registerTool(
  "artifact_update",
  {
    description:
      "Replace the title and content of an existing canvas artifact.",
    inputSchema: z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      content: z.string(),
      type: z.enum(ARTIFACT_TYPES).optional(),
      language: z.string().optional(),
    }),
  },
  ({ id, title, content, type, language }) =>
    captureToolError("artifact_update", () => {
      if (!getArtifact(id)) throw new Error(`Unknown artifact: ${id}`);
      saveArtifact({ id, title, content, type, language });
      return {
        content: [{
          type: "text",
          text:
            `Updated “${title}” on the local canvas. [Open it](${canvasBaseUrl}/?artifact=${
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
          `Edited “${artifact.title}”. [Open it on the canvas](${canvasBaseUrl}/?artifact=${
            encodeURIComponent(id)
          })`,
      }],
    };
  }));

server.registerTool(
  "artifact_list",
  {
    description: "List artifacts currently on the local canvas.",
    inputSchema: z.object({}),
  },
  () =>
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
    })),
);

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

const mcpHandler = createMcpHandler(() => server);

function handleMcpRequest(request: Request) {
  canvasBaseUrl = new URL(request.url).origin;
  return mcpHandler.fetch(request).catch((error) => {
    writeLog("error", "http:mcp", errorMessage(error));
    throw error;
  });
}

export const handler = {
  GET: handleMcpRequest,
  POST: handleMcpRequest,
  DELETE: handleMcpRequest,
};

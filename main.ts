import { Command } from "jsr:@cliffy/command@1.3.1";
import { McpServer } from "npm:@modelcontextprotocol/server@2.3.0";
import { serveStdio } from "npm:@modelcontextprotocol/server@2.3.0/stdio";
import * as z from "npm:zod@4.6.5/v4";
import { stdin } from "node:process";
import {
  captureToolError,
  errorMessage,
  getLogs,
  installConsoleLogSink,
  writeLog,
} from "./lib/logs.ts";
import { createHandler } from "$fresh/server.ts";
import "$std/dotenv/load.ts";
import config from "./fresh.config.ts";
import manifest from "./fresh.gen.ts";
import {
  ARTIFACT_TYPES,
  deleteArtifact,
  editArtifactContent,
  getArtifact,
  listArtifacts,
  saveArtifact,
} from "./lib/artifacts.ts";
import {
  ARTIFACT_CANVAS_INSTRUCTIONS,
  ARTIFACT_CANVAS_RESOURCE_DESCRIPTION,
  ARTIFACT_CANVAS_SKILL,
  ARTIFACT_CANVAS_SKILL_URI,
} from "./lib/mcp_guidance.ts";

const NAME = "artifact-canvas";
const HOST = "127.0.0.1";
const PORT = Number(Deno.env.get("PORT") ?? 0);
let canvasPort = PORT;
let BASE_URL = `http://${HOST}:${canvasPort}`;

const server = new McpServer({
  name: NAME,
  version: "0.1.0",
  description:
    `Create and manage artifacts on the local live canvas. Read the ${ARTIFACT_CANVAS_SKILL_URI} resource for the recommended workflow and artifact guidance.`,
}, {
  instructions: ARTIFACT_CANVAS_INSTRUCTIONS,
});
installConsoleLogSink();
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
      "Create an artifact on the local canvas. Content defaults to Markdown. Choose text for literal plain text, html for self-contained HTML/JavaScript rendered in a sandbox with network access disabled, or code for a code block. Returns a clickable URL for the user to open.",
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
      const url = `${BASE_URL}/?artifact=${encodeURIComponent(artifact.id)}`;
      return {
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
            `Updated “${title}”. [Open it on the canvas](${BASE_URL}/?artifact=${
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
          `Edited “${artifact.title}” on the local canvas. [Open it](${BASE_URL}/?artifact=${
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

async function run() {
  const requestHandler = await createHandler(manifest, config);
  const webAbort = new AbortController();
  const web = Deno.serve({
    hostname: HOST,
    port: PORT,
    signal: webAbort.signal,
  }, requestHandler);
  canvasPort = web.addr.port;
  BASE_URL = `http://${HOST}:${canvasPort}`;

  let finish: () => void;
  const connectionEnded = new Promise<void>((resolve) => finish = resolve);
  const onStdinEnd = () => finish();
  const shutdown = () => finish();
  stdin.once("end", onStdinEnd);
  stdin.once("close", onStdinEnd);
  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
  const stdio = serveStdio(() => server, {
    onerror: (error) => writeLog("error", "stdio", errorMessage(error)),
  });

  try {
    await connectionEnded;
  } finally {
    stdin.off("end", onStdinEnd);
    stdin.off("close", onStdinEnd);
    Deno.removeSignalListener("SIGINT", shutdown);
    Deno.removeSignalListener("SIGTERM", shutdown);
    webAbort.abort();
    const cleanup = await Promise.allSettled([
      stdio.close(),
      server.close(),
      web.finished,
    ]);
    for (const result of cleanup) {
      if (result.status === "rejected") {
        writeLog("error", "shutdown", errorMessage(result.reason));
      }
    }
  }
}

try {
  await new Command()
    .name(NAME)
    .version("0.1.0")
    .description("MCP server for a local live artifact canvas")
    .action(run)
    .parse(Deno.args);
} catch (error) {
  writeLog("error", "startup", errorMessage(error));
  console.error(errorMessage(error));
  Deno.exitCode = 1;
}

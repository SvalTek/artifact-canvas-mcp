import { Command } from "jsr:@cliffy/command@1.3.1";
import { serveStdio } from "npm:@modelcontextprotocol/server@2.3.0/stdio";
import { stdin } from "node:process";
import { errorMessage, installConsoleLogSink, writeLog } from "./lib/logs.ts";
import { createHandler } from "$fresh/server.ts";
import "$std/dotenv/load.ts";
import config from "./fresh.config.ts";
import manifest from "./fresh.gen.ts";
import { createCanvasServer } from "./lib/mcp_server.ts";
const NAME = "artifact-canvas";
const HOST = "127.0.0.1";
const PORT = Number(Deno.env.get("PORT") ?? 0);
let canvasPort = PORT;
let BASE_URL = `http://${HOST}:${canvasPort}`;
const server = createCanvasServer(() => BASE_URL);
installConsoleLogSink();
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
    .version("0.2.0")
    .description("MCP server for a local live artifact canvas")
    .action(run)
    .parse(Deno.args);
} catch (error) {
  writeLog("error", "startup", errorMessage(error));
  console.error(errorMessage(error));
  Deno.exitCode = 1;
}

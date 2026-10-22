import { createMcpHandler } from "npm:@modelcontextprotocol/server@2.3.0";
import { errorMessage, writeLog } from "../lib/logs.ts";
import { createCanvasServer } from "../lib/mcp_server.ts";
let canvasBaseUrl = "";
const server = createCanvasServer(() => canvasBaseUrl);
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

// Mock MCP server for testing (Streamable HTTP at POST /mcp).
// No auth here: on OpenChoreo the gateway (mcp-auth policy) checks Asgardeo tokens first.

import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.PORT || 3000);

function buildServer() {
  const server = new McpServer({ name: "mock-mcp", version: "1.0.0" });

  server.registerTool("ping", {
    description: "Check the server is reachable. Returns pong.",
    inputSchema: {},
  }, async () => ({ content: [{ type: "text", text: "pong" }] }));

  server.registerTool("echo", {
    description: "Return the given message.",
    inputSchema: { message: z.string() },
  }, async ({ message }) => ({ content: [{ type: "text", text: message }] }));

  server.registerTool("add", {
    description: "Add two numbers.",
    inputSchema: { a: z.number(), b: z.number() },
  }, async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }));

  return server;
}

const app = express();
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.post("/mcp", express.json(), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.all("/mcp", (_req, res) => res.set("Allow", "POST").status(405).end());

app.listen(PORT, "0.0.0.0", () => console.log(`mock-mcp listening on :${PORT}`));

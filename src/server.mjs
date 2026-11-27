// Mock MCP server for testing (Streamable HTTP at POST /mcp) with Asgardeo login.
//
// Auth is on when these env vars are set:
//   ASGARDEO_BASE_URL  e.g. https://api.asgardeo.io/t/<org>
//   MCP_RESOURCE       the public MCP URL, e.g. https://<gateway>/<component>-<endpoint>/mcp
//   MCP_SCOPE          scope required in the token, e.g. mcp:access
// Without them the server runs with NO auth (local testing only).

import express from "express";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify, errors } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.PORT || 3000);
const { ASGARDEO_BASE_URL, MCP_RESOURCE, MCP_SCOPE } = process.env;
const authSettings = [ASGARDEO_BASE_URL, MCP_RESOURCE, MCP_SCOPE].filter(Boolean).length;
if (authSettings !== 0 && authSettings !== 3) {
  throw new Error("Set all of ASGARDEO_BASE_URL, MCP_RESOURCE and MCP_SCOPE, or none of them.");
}
const auth = authSettings === 3 ? setupAuth() : null;

function setupAuth() {
  const base = ASGARDEO_BASE_URL.replace(/\/$/, "");
  const resource = new URL(MCP_RESOURCE);
  const issuer = base + "/oauth2/token";
  const metadataUrl = new URL(".well-known/oauth-protected-resource", resource);
  return {
    resource, issuer, metadataUrl,
    jwks: createRemoteJWKSet(new URL(base + "/oauth2/jwks")),
    challenge: `Bearer resource_metadata="${metadataUrl.href}", scope="${MCP_SCOPE}"`,
  };
}

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

// The gateway may strip or keep the path prefix, so accept both forms.
const mcpPaths = auth ? [...new Set(["/mcp", auth.resource.pathname])] : ["/mcp"];

if (auth) {
  // "How to log in here" document for MCP clients (RFC 9728).
  const metadataPaths = [...new Set(["/.well-known/oauth-protected-resource", auth.metadataUrl.pathname])];
  app.get(metadataPaths, (_req, res) => res.json({
    resource: auth.resource.href,
    authorization_servers: [auth.issuer],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
  }));

  // Every MCP request needs a valid Asgardeo access token (JWT) with the scope.
  app.use(mcpPaths, async (req, res, next) => {
    const token = /^Bearer (\S+)$/i.exec(req.get("authorization") || "")?.[1];
    if (!token) return res.set("WWW-Authenticate", auth.challenge).sendStatus(401);
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, auth.jwks, {
        issuer: auth.issuer, audience: auth.resource.href, algorithms: ["RS256"], requiredClaims: ["exp"],
      }));
    } catch (error) {
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) return res.sendStatus(503);
      console.warn("Rejected token:", error.code || error.message);
      return res.set("WWW-Authenticate", auth.challenge + ', error="invalid_token"').sendStatus(401);
    }
    const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
    if (!scopes.includes(MCP_SCOPE)) {
      return res.set("WWW-Authenticate", auth.challenge + ', error="insufficient_scope"').sendStatus(403);
    }
    next();
  });
}

app.post(mcpPaths, express.json(), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.all(mcpPaths, (_req, res) => res.set("Allow", "POST").status(405).end());

app.listen(PORT, "0.0.0.0", () => {
  console.log(`mock-mcp listening on :${PORT}`);
  console.log(auth ? `auth ON: issuer ${auth.issuer}, resource ${auth.resource.href}, scope ${MCP_SCOPE}`
                   : "WARNING: auth OFF (set ASGARDEO_BASE_URL, MCP_RESOURCE, MCP_SCOPE)");
});

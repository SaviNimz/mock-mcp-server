# Mock MCP server

A tiny MCP server for testing deployment and Asgardeo login on **OpenChoreo**.
Streamable HTTP at `POST /mcp`, port `3000`.

| Tool | Returns |
|---|---|
| `ping` | `pong` |
| `echo` `{ "message": "hi" }` | `hi` |
| `add` `{ "a": 2, "b": 3 }` | `5` |

The server has **no auth of its own**. On OpenChoreo, the gateway's `mcp-auth` policy checks Asgardeo tokens before requests reach it (the `mcp-proxy` trait sets this up).

## Run locally

```bash
npm ci && npm start
curl -s -X POST localhost:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
```

## Deploy on OpenChoreo (UI)

**Create → Service**

| Field | Value |
|---|---|
| Component Name | `mock-mcp` |
| Build & Deploy | **Build from Source**, workflow `dockerfile-builder` |
| Git Repository URL / Branch / Application Path | this repo / `main` / `.` |
| Traits | `mcp-proxy`: `endpoint: mcp`, `issuers: [Asgardeo]`, `requiredScopes: [mcp:access]` |

The endpoint (`mcp`, port 3000, external) comes from `workload.yaml`.
The `mcp-proxy` trait (`openchoreo/mcp-proxy-trait.yaml`) and the gateway module have to be installed once by a cluster admin.

The MCP URL is the endpoint URL on the **Deploy** tab plus `/mcp`:
`https://<env>-<namespace>.<gateway-host>/mock-mcp-mcp/mcp`

CLI alternative: `kubectl apply -f openchoreo/component.yaml`.

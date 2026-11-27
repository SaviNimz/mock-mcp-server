# Mock MCP server

A tiny MCP server for testing deployment and Asgardeo login on **OpenChoreo**.
Streamable HTTP at `POST /mcp`, port `3000`.

| Tool | Returns |
|---|---|
| `ping` | `pong` |
| `echo` `{ "message": "hi" }` | `hi` |
| `add` `{ "a": 2, "b": 3 }` | `5` |

## Asgardeo login

The server checks **Asgardeo** access tokens itself when these env vars are set (in OpenChoreo: Deploy → Create release → Workload → Environment Variables):

| Env var | Example |
|---|---|
| `ASGARDEO_BASE_URL` | `https://api.asgardeo.io/t/<org>` |
| `MCP_RESOURCE` | the public MCP URL, e.g. `https://<env>-<ns>.<gateway-host>/<component>-mcp/mcp` |
| `MCP_SCOPE` | `mcp:access` |
| `ASGARDEO_CLIENT_ID` (optional) | client ID of the MCP client app in Asgardeo, e.g. the Claude app. Needed because Asgardeo sets the access token `aud` to the client ID, not to `MCP_RESOURCE` |

With them set:
- `POST /mcp` without a token → `401` + `WWW-Authenticate` pointing at the login metadata
- `GET /.well-known/oauth-protected-resource` → resource URL, Asgardeo issuer, scope
- the token must be an Asgardeo **JWT** with issuer `<ASGARDEO_BASE_URL>/oauth2/token`, the scope, and either audience = `MCP_RESOURCE` or (when `ASGARDEO_CLIENT_ID` is set) audience and `azp` = that client ID

Without them the server runs **with no auth** (local testing only).

In Asgardeo: API resource identifier = `MCP_RESOURCE`, scope `MCP_SCOPE`, app with redirect URL `https://claude.ai/api/mcp/auth_callback`, access token type JWT, API authorized for the app.

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

The endpoint (`mcp`, port 3000, external) comes from `workload.yaml`.
Then set the three env vars above and deploy.

The MCP URL is the endpoint URL on the **Deploy** tab plus `/mcp`:
`https://<env>-<namespace>.<gateway-host>/mock-mcp-mcp/mcp`

CLI alternative: `kubectl apply -f openchoreo/component.yaml`.

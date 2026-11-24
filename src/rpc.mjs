import { AuthError } from "./auth.mjs"
import { TOOL_DEFS, callTool, listToolsForToken } from "./tools.mjs"
import { tokenFromHeaders } from "./auth.mjs"

export async function handleJsonRpc(body, headers = {}) {
  const id = body?.id ?? null
  const method = body?.method
  const token = tokenFromHeaders(headers)
  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "jobs2-mcp", version: "0.1.0" },
        },
      }
    }
    if (method === "notifications/initialized") {
      return null
    }
    if (method === "tools/list") {
      const tools = listToolsForToken(token)
      return { jsonrpc: "2.0", id, result: { tools } }
    }
    if (method === "tools/call") {
      const name = body?.params?.name
      const args = body?.params?.arguments || {}
      const result = await callTool(name, args, token)
      return { jsonrpc: "2.0", id, result }
    }
    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} }
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    }
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500
    const code = err instanceof AuthError && err.status === 402 ? -32002 : -32001
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message: err.message, data: { status, auth: err.code } },
    }
  }
}

export { TOOL_DEFS }

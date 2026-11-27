import { handleJsonRpc } from "../src/rpc.mjs"
import { authorizationServerDiscoveryUrls, protectedResourceMetadata, wwwAuthenticate } from "../src/oauth.mjs"

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*")
  res.setHeader("access-control-allow-headers", "authorization,content-type,x-jobs2-mcp-token")
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS")
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  const path = req.url ? String(req.url).split("?")[0] : "/"
  if (req.method === "GET" && (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp" || path.endsWith("/oauth-protected-resource") || path.endsWith("/oauth-protected-resource/mcp"))) {
    res.status(200).json(protectedResourceMetadata())
    return
  }
  if (req.method === "GET" && (path === "/.well-known/oauth-authorization-server" || path.endsWith("/oauth-authorization-server"))) {
    res.status(200).json(authorizationServerDiscoveryUrls())
    return
  }
  if (req.method === "GET") {
    res.status(200).json({ ok: true, name: "jobs2-mcp" })
    return
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" })
    return
  }
  const out = await handleJsonRpc(req.body || {}, req.headers)
  const status = out?.error?.data?.status || 200
  if (status === 401) res.setHeader("WWW-Authenticate", wwwAuthenticate())
  res.status(status === 401 || status === 402 ? status : 200).json(out)
}

import { handleJsonRpc } from "../src/rpc.mjs"

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*")
  res.setHeader("access-control-allow-headers", "authorization,content-type,x-jobs2-mcp-token")
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS")
  if (req.method === "OPTIONS") {
    res.status(204).end()
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
  res.status(status === 401 || status === 402 ? status : 200).json(out)
}

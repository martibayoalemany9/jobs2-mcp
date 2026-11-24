import { createServer } from "node:http"
import { handleJsonRpc } from "./rpc.mjs"

function send(res, status, obj, extra = {}) {
  const body = obj == null ? "" : JSON.stringify(obj)
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type,x-jobs2-mcp-token,payment-signature,PAYMENT-SIGNATURE",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    ...extra,
  })
  res.end(body)
}

export async function handleHttp(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, null)
    return
  }
  const url = new URL(req.url || "/", "http://localhost")
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    send(res, 200, { ok: true, name: "jobs2-mcp", transport: "streamable-http" })
    return
  }
  if (req.method !== "POST" || (url.pathname !== "/mcp" && url.pathname !== "/")) {
    send(res, 404, { error: "not_found" })
    return
  }
  const chunks = []
  for await (const c of req) chunks.push(c)
  let body
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
  } catch {
    send(res, 400, { error: "invalid_json" })
    return
  }
  const out = await handleJsonRpc(body, req.headers)
  if (out?.error?.data?.status === 401) {
    send(res, 401, out)
    return
  }
  const paid = out?.result?.structuredContent
  if (out?.error?.data?.status === 402 || (out?.result?.isError && paid?.x402Version)) {
    const { encodePaymentRequired } = await import("./x402.mjs")
    const reqBody = paid || (await import("./x402.mjs")).paymentRequired("search_jobs", out?.error?.message || "Payment required")
    send(res, 402, out, {
      "PAYMENT-REQUIRED": encodePaymentRequired(reqBody),
      "x-402-note": "Subscribe at https://jobs2.graphai.eu/?view=invoices or retry with PAYMENT-SIGNATURE / _meta x402/payment.",
    })
    return
  }
  send(res, 200, out)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787)
  createServer((req, res) => {
    handleHttp(req, res).catch((err) => {
      send(res, 500, { error: String(err.message || err) })
    })
  }).listen(port, "127.0.0.1", () => {
    console.error(`jobs2-mcp http://127.0.0.1:${port}/mcp`)
  })
}

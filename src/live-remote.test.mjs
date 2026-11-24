import assert from "node:assert/strict"
import test from "node:test"

const live = process.env.MCP_LIVE === "1"
const URL = process.env.JOBS2_MCP_URL || "https://jobs2-mcp.vercel.app/mcp"
const REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers?search=eu.graphai/jobs2"

async function rpc(method, params = {}, extraHeaders = {}) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const body = await res.json()
  return { status: res.status, body }
}

test("jobs2 production initialize", { skip: !live }, async () => {
  const { status, body } = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "jobs2-mcp-ci", version: "0.1.0" },
  })
  assert.equal(status, 200)
  assert.equal(body.result.serverInfo.name, "jobs2-mcp")
})

test("jobs2 production ping", { skip: !live }, async () => {
  const { status, body } = await rpc("ping")
  assert.equal(status, 200)
  assert.ok(body.result)
})

test("jobs2 unsigned tools/list is login only", { skip: !live }, async () => {
  const { body } = await rpc("tools/list")
  const names = (body.result?.tools || []).map((t) => t.name)
  assert.ok(names.includes("login"))
  assert.equal(names.includes("search_jobs"), false)
})

test("jobs2 registry listing eu.graphai/jobs2", { skip: !live }, async () => {
  const res = await fetch(REGISTRY)
  assert.equal(res.ok, true)
  const data = await res.json()
  const names = (data.servers || []).map((s) => s.server?.name)
  assert.ok(names.includes("eu.graphai/jobs2"), JSON.stringify(names))
})

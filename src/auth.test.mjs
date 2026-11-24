import assert from "node:assert/strict"
import test from "node:test"
import { issueToken, verifyToken, authorize, AuthError } from "./auth.mjs"
import { callTool } from "./tools.mjs"
import { handleJsonRpc } from "./rpc.mjs"

test("token round-trip for supabase plan", () => {
  const t = issueToken({ email: "martibayoalemany@gmail.com", plan: "mcp_supabase" })
  const s = verifyToken(t)
  assert.equal(s.email, "martibayoalemany@gmail.com")
  assert.equal(s.plan, "mcp_supabase")
})

test("missing token is 401", () => {
  assert.throws(() => verifyToken(""), (e) => e instanceof AuthError && e.status === 401)
})

test("web studio unlocks salary tool", () => {
  const t = issueToken({ email: "a@b.c", plan: "web_studio" })
  authorize(t, "search_jobs_salary")
})

test("supabase plan cannot call salary", () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_supabase" })
  assert.throws(() => authorize(t, "search_jobs_salary"), (e) => e.status === 402)
})

test("search_jobs filters by country and specialty", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_supabase" })
  const out = await callTool("search_jobs", { country: "DE", specialty: "hardware" }, t)
  const data = JSON.parse(out.content[0].text)
  assert.equal(data.store, "supabase")
  assert.ok(data.jobs.some((j) => j.job_key === "de-ka-hw-1"))
  assert.ok(!("salary_min" in data.jobs[0]))
})

test("fast tool uses redis store", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_redis" })
  const out = await callTool("search_jobs_fast", { city: "Amsterdam" }, t)
  const data = JSON.parse(out.content[0].text)
  assert.equal(data.store, "redis")
  assert.equal(data.jobs[0].city, "Amsterdam")
})

test("salary tool includes ranges and specialties", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_salary" })
  const out = await callTool("search_jobs_salary", { specialty: "sap" }, t)
  const data = JSON.parse(out.content[0].text)
  assert.equal(data.jobs[0].salary_min, 55000)
  assert.deepEqual(data.jobs[0].specialties, ["sap", "logistik"])
})

test("json-rpc tools/list requires login", async () => {
  const denied = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {})
  assert.equal(denied.error.data.status, 401)
  const t = issueToken({ email: "a@b.c", plan: "mcp_supabase" })
  const ok = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { authorization: `Bearer ${t}` })
  assert.ok(ok.result.tools.some((x) => x.name === "search_jobs"))
  assert.ok(!ok.result.tools.some((x) => x.name === "search_jobs_salary"))
})

test("json-rpc initialize works without token", async () => {
  const r = await handleJsonRpc({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }, {})
  assert.equal(r.result.serverInfo.name, "jobs2-mcp")
})

test("local-operator sentinel unlocks all tools", async () => {
  const s = verifyToken("local-operator")
  assert.equal(s.plan, "web_studio")
  authorize("local-operator", "search_jobs_salary")
})

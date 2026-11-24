import assert from "node:assert/strict"
import test from "node:test"
import { issueToken, verifyToken, authorize, AuthError } from "./auth.mjs"
import { callTool } from "./tools.mjs"
import { handleJsonRpc } from "./rpc.mjs"
import { issueMockPayment } from "./x402.mjs"

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

test("search_jobs prints a markdown table", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_supabase" })
  const out = await callTool("search_jobs", { country: "DE", specialty: "hardware" }, t)
  const text = out.content[0].text
  assert.match(text, /\| country \| city \| title \|/)
  assert.match(text, /Karlsruhe/)
  assert.match(text, /Hardware Engineer/)
  assert.doesNotMatch(text, /72000/)
})

test("fast tool uses redis store in table meta", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_redis" })
  const out = await callTool("search_jobs_fast", { city: "Amsterdam" }, t)
  assert.match(out.content[0].text, /store: redis/)
  assert.match(out.content[0].text, /Amsterdam/)
})

test("salary table includes ranges and specialties", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_salary" })
  const out = await callTool("search_jobs_salary", { specialty: "sap" }, t)
  const text = out.content[0].text
  assert.match(text, /salary_min/)
  assert.match(text, /55000/)
  assert.match(text, /sap, logistik/)
})

test("json-rpc tools/list requires login", async () => {
  const denied = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {})
  assert.deepEqual(
    denied.result.tools.map((x) => x.name),
    ["login"],
  )
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

test("unpaid tools/call returns x402 PaymentRequired", async () => {
  const r = await handleJsonRpc({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "search_jobs", arguments: { country: "DE" } },
  }, {})
  assert.equal(r.result.isError, true)
  assert.equal(r.result.structuredContent.x402Version, 2)
  assert.ok(r.result.structuredContent.accepts[0].amount)
})

test("mock x402 payment unlocks salary table", async () => {
  const payment = issueMockPayment("search_jobs_salary", "0xpayer")
  const out = await callTool("search_jobs_salary", { country: "DE" }, "", { _meta: { "x402/payment": payment } }, {})
  assert.equal(out.isError, undefined)
  assert.match(out.content[0].text, /\| country \|/)
  assert.equal(out._meta["x402/payment-response"].success, true)
})

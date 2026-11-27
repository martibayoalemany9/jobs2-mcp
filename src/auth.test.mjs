import assert from "node:assert/strict"
import test from "node:test"
import { issueToken, verifyToken, authorize, AuthError } from "./auth.mjs"
import { callTool } from "./tools.mjs"
import { handleJsonRpc } from "./rpc.mjs"
import { issueMockPayment } from "./x402.mjs"

test("token round-trip for supabase plan", async () => {
  const t = issueToken({ email: "martibayoalemany@gmail.com", plan: "mcp_supabase" })
  const s = await verifyToken(t)
  assert.equal(s.email, "martibayoalemany@gmail.com")
  assert.equal(s.plan, "mcp_supabase")
})

test("missing token is 401", async () => {
  await assert.rejects(() => verifyToken(""), (e) => e instanceof AuthError && e.status === 401)
})

test("web studio unlocks salary tool", async () => {
  const t = issueToken({ email: "a@b.c", plan: "web_studio" })
  await authorize(t, "search_jobs_salary")
})

test("supabase plan cannot call salary", async () => {
  const t = issueToken({ email: "a@b.c", plan: "mcp_supabase" })
  await assert.rejects(() => authorize(t, "search_jobs_salary"), (e) => e.status === 402)
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

test("json-rpc tools/list is login and subscribe until authed", async () => {
  const denied = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {})
  assert.deepEqual(
    denied.result.tools.map((x) => x.name),
    ["login", "subscribe"],
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
  const s = await verifyToken("local-operator")
  assert.equal(s.plan, "web_studio")
  await authorize("local-operator", "search_jobs_salary")
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

test("operator email can text-filter the full catalog", async () => {
  const t = issueToken({ email: "martibayoalemany@gmail.com", plan: "web_studio" })
  const out = await callTool("search_jobs", { q: "Software" }, t)
  const text = out.content[0].text
  assert.match(text, /Software Engineer/)
  assert.doesNotMatch(text, /only filter allowed/)
  const rows = text.split("\n").filter((l) => l.startsWith("|") && !l.includes("country") && !l.includes("---"))
  assert.ok(rows.length > 50, `expected full catalog, got ${rows.length}`)
})

test("martibayoalemany4 free plan is country-only 50 jobs", async () => {
  const t = issueToken({ email: "martibayoalemany4@gmail.com", plan: "free" })
  const blocked = await callTool("search_jobs", { q: "Software", city: "Berlin" }, t)
  assert.match(blocked.content[0].text, /Country is the only filter allowed unless you subscribe/)
  const ok = await callTool("search_jobs", { country: "DE", limit: 200, page: 2, specialty: "hardware" }, t)
  const text = ok.content[0].text
  const rows = text.split("\n").filter((l) => l.startsWith("|") && l.includes("| DE |"))
  assert.ok(rows.length <= 50)
  assert.ok(rows.length >= 1)
  assert.match(text, /Free plan cannot set page_size/)
  assert.match(text, /page: 1\//)
})

test("operator paginates search_jobs with page_size", async () => {
  const t = issueToken({ email: "martibayoalemany@gmail.com", plan: "web_studio" })
  const p1 = await callTool("search_jobs", { country: "DE", page_size: 10, page: 1, specialty: "software" }, t)
  assert.match(p1.content[0].text, /page: 1\//)
  assert.match(p1.content[0].text, /next_page: 2/)
  const p2 = await callTool("search_jobs", { country: "DE", page_size: 10, page: 2, specialty: "software" }, t)
  assert.match(p2.content[0].text, /page: 2\//)
  const titles1 = p1.content[0].text
  const titles2 = p2.content[0].text
  assert.notEqual(titles1, titles2)
})

test("operator title filter and all three search tools paginate", async () => {
  const t = issueToken({ email: "martibayoalemany@gmail.com", plan: "web_studio" })
  const titled = await callTool("search_jobs", { title: "Hardware", page_size: 5 }, t)
  assert.match(titled.content[0].text, /Hardware/)
  assert.match(titled.content[0].text, /page_size: 5/)
  const fast = await callTool("search_jobs_fast", { country: "DE", page_size: 8, page: 1 }, t)
  assert.match(fast.content[0].text, /store: redis/)
  assert.match(fast.content[0].text, /page: 1\//)
  const sal = await callTool("search_jobs_salary", { country: "DE", page_size: 8, page: 2 }, t)
  assert.match(sal.content[0].text, /salary_min/)
  assert.match(sal.content[0].text, /page: 2\//)
  const spec = await callTool("list_specialties", { page_size: 3, page: 1 }, t)
  assert.match(spec.content[0].text, /next_page: 2/)
})

test("subscribe tool returns checkout copy without YOUR_TOKEN", async () => {
  const t = issueToken({ email: "martibayoalemany4@gmail.com", plan: "free" })
  const out = await callTool("subscribe", { plan: "mcp_supabase" }, t)
  assert.match(out.content[0].text, /Jobs2 Studio web/)
  assert.doesNotMatch(out.content[0].text, /YOUR_TOKEN/)
  const next = await callTool("subscribe", { plan: "mcp_redis" }, t)
  assert.match(next.content[0].text, /coming next/i)
})

test("mock x402 payment unlocks salary table", async () => {
  const payment = issueMockPayment("search_jobs_salary", "0xpayer")
  const out = await callTool("search_jobs_salary", { country: "DE" }, "", { _meta: { "x402/payment": payment } }, {})
  assert.equal(out.isError, undefined)
  assert.match(out.content[0].text, /\| country \|/)
  assert.equal(out._meta["x402/payment-response"].success, true)
})

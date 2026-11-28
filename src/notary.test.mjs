import assert from "node:assert/strict"
import { test } from "node:test"
import { buildNotaryRecord, sanitizeArgs, subjectHash, verifyNotaryRecord } from "./notary.mjs"

test("sanitizeArgs drops email and pairing code", () => {
  const s = sanitizeArgs({ country: "DE", email: "secret@example.com", code: "12345678" })
  assert.equal(s.country, "DE")
  assert.equal(s.email, undefined)
  assert.equal(s.code, undefined)
})

test("subject hashes are stable and not the raw email", () => {
  const h = subjectHash("Subscribed.User@example.com")
  assert.equal(h, subjectHash("subscribed.user@example.com"))
  assert.equal(h.includes("@"), false)
  assert.equal(h.length, 64)
})

test("hash chain HMAC verifies", () => {
  const a = buildNotaryRecord({
    method: "tools/call",
    tool: "search_jobs",
    plan: "web_studio",
    email: "user@example.com",
    args: { country: "DE", email: "user@example.com" },
    result: { matched: 12 },
    status: "ok",
    prevHash: "genesis",
  })
  assert.equal(verifyNotaryRecord(a), true)
  assert.equal(a.args.email, undefined)
  const b = buildNotaryRecord({
    method: "tools/call",
    tool: "search_jobs",
    plan: "free",
    email: "other@example.com",
    args: { country: "FR" },
    result: { matched: 50 },
    prevHash: a.record_hash,
  })
  assert.equal(b.prev_hash, a.record_hash)
  assert.equal(verifyNotaryRecord(b), true)
  b.hmac = "00".repeat(32)
  assert.equal(verifyNotaryRecord(b), false)
})

import { createHash, createHmac, randomUUID } from "node:crypto"

const SITE = process.env.JOBS2_BASE_URL || "https://jobs2.graphai.eu"

export function notarySecret() {
  return String(process.env.JOBS2_MCP_SIGNING_SECRET || process.env.JOBS2_MCP_TOKEN_SECRET || "dev-jobs2-mcp")
}

export function subjectHash(email) {
  const e = String(email || "").trim().toLowerCase()
  if (!e) return ""
  return createHash("sha256").update(`jobs2-mcp-subject|${notarySecret()}|${e}`).digest("hex")
}

export function ipHash(ip) {
  const v = String(ip || "").trim()
  if (!v) return ""
  return createHash("sha256").update(`jobs2-mcp-ip|${notarySecret()}|${v}`).digest("hex")
}

export function sanitizeArgs(args) {
  const out = { ...(args && typeof args === "object" ? args : {}) }
  delete out.email
  delete out.code
  delete out.token
  return out
}

export function buildNotaryRecord({
  method,
  tool,
  plan,
  email,
  args,
  result,
  status,
  prevHash = "genesis",
  ip,
} = {}) {
  const event_id = randomUUID()
  const occurred_at = new Date().toISOString()
  const body = {
    event_id,
    occurred_at,
    method: String(method || ""),
    tool: String(tool || ""),
    plan: String(plan || ""),
    subject_hash: subjectHash(email),
    args: sanitizeArgs(args),
    result: result && typeof result === "object" ? result : { note: String(result || "") },
    status: String(status || "ok"),
    prev_hash: String(prevHash || "genesis"),
    ip_hash: ipHash(ip),
  }
  const canonical = JSON.stringify(body)
  const record_hash = createHash("sha256").update(canonical).digest("hex")
  const hmac = createHmac("sha256", notarySecret()).update(record_hash).digest("hex")
  return { ...body, record_hash, hmac }
}

export function verifyNotaryRecord(rec) {
  if (!rec?.record_hash || !rec?.hmac) return false
  const { record_hash, hmac, ...body } = rec
  const canonical = JSON.stringify(body)
  const expectHash = createHash("sha256").update(canonical).digest("hex")
  if (expectHash !== record_hash) return false
  const expectMac = createHmac("sha256", notarySecret()).update(record_hash).digest("hex")
  return expectMac === hmac
}

export async function publishNotary(record) {
  const url = `${SITE.replace(/\/$/, "")}/api/mcp/notary`
  const payload = JSON.stringify(record)
  const sig = createHmac("sha256", notarySecret()).update(payload).digest("hex")
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jobs2-notary": sig,
      },
      body: payload,
    })
  } catch {
    /* evidence write must never fail the MCP call */
  }
}

export function resultMetaFromTool(name, result) {
  const text = result?.content?.[0]?.text || ""
  const matched = /matched:\s*(\d+)/i.exec(text)
  const page = /page:\s*(\d+)/i.exec(text)
  return {
    tool: name,
    isError: Boolean(result?.isError),
    matched: matched ? Number(matched[1]) : undefined,
    page: page ? Number(page[1]) : undefined,
    chars: text.length,
  }
}

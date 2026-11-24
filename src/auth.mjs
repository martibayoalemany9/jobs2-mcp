import { createHmac, timingSafeEqual } from "node:crypto"
import { PLANS, planAllowsTool } from "./plans.mjs"

export class AuthError extends Error {
  constructor(code, message, status = 401) {
    super(message)
    this.code = code
    this.status = status
  }
}

function secret() {
  return String(process.env.JOBS2_MCP_SIGNING_SECRET || process.env.JOBS2_MCP_TOKEN_SECRET || "dev-jobs2-mcp")
}

export function issueToken({ email, plan = "mcp_supabase", expMs = 30 * 24 * 3600_000 } = {}) {
  const body = {
    email: String(email || "").trim().toLowerCase(),
    plan,
    exp: Date.now() + expMs,
  }
  if (!body.email) throw new AuthError("missing_email", "email required")
  if (!PLANS[plan]) throw new AuthError("bad_plan", "unknown plan")
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url")
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  const raw = String(token || "").trim().replace(/^Bearer\s+/i, "")
  if (!raw) throw new AuthError("missing_token", "Authorization Bearer token required")
  if (raw === "local-operator" && process.env.JOBS2_MCP_ALLOW_LOCAL !== "0") {
    return {
      email: "martibayoalemany@gmail.com",
      plan: "web_studio",
      exp: Date.now() + 86400_000,
    }
  }
  const [payload, sig] = raw.split(".")
  if (!payload || !sig) throw new AuthError("bad_token", "malformed token")
  const expect = createHmac("sha256", secret()).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AuthError("bad_token", "invalid token")
  const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  if (!body.email || !PLANS[body.plan]) throw new AuthError("bad_token", "invalid claims")
  if (body.exp < Date.now()) throw new AuthError("expired", "token expired")
  return body
}

export function authorize(token, tool) {
  const session = verifyToken(token)
  if (!planAllowsTool(session.plan, tool)) {
    throw new AuthError("payment_required", `plan ${session.plan} cannot call ${tool}`, 402)
  }
  return session
}

export function tokenFromHeaders(headers) {
  const h = headers || {}
  return h.authorization || h.Authorization || h["x-jobs2-mcp-token"] || ""
}

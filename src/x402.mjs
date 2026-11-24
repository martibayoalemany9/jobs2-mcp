/**
 * x402 seller for jobs2-mcp.
 *
 * Live USDC settlement needs X402_PAY_TO (EVM address) and optionally
 * CDP_API_KEY / CDP_API_SECRET for Coinbase facilitator.
 * This workspace has neither. Local/dev uses an HMAC mock payload
 * (scheme extra.kind = jobs2-hmac) so Grok can exercise the 402 loop
 * without a funded wallet. Subscription Bearer tokens skip x402.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
export const NETWORK_BASE_SEPOLIA = "eip155:84532"

export const TOOL_PRICE_USDC_MICRO = {
  search_jobs: "50000",
  search_jobs_fast: "100000",
  search_jobs_salary: "150000",
  list_specialties: "10000",
}

function secret() {
  return String(process.env.JOBS2_MCP_SIGNING_SECRET || "dev-jobs2-mcp")
}

export function payTo() {
  return String(process.env.X402_PAY_TO || "").trim()
}

export function facilitatorUrl() {
  return String(process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator").replace(/\/$/, "")
}

export function paymentRequired(tool, error = "Payment required") {
  const amount = TOOL_PRICE_USDC_MICRO[tool] || "50000"
  const to = payTo() || "0x0000000000000000000000000000000000000000"
  const body = {
    x402Version: 2,
    error,
    resource: {
      url: `mcp://tool/${tool}`,
      description: `jobs2.graphai.eu MCP ${tool}`,
      mimeType: "text/markdown",
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK_BASE_SEPOLIA,
        amount,
        asset: USDC_BASE_SEPOLIA,
        payTo: to,
        maxTimeoutSeconds: 120,
        extra: {
          name: "USDC",
          version: "2",
          billing: "https://jobs2.graphai.eu/?view=invoices",
          mock: payTo() ? false : true,
        },
      },
    ],
  }
  return body
}

export function encodePaymentRequired(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64")
}

export function issueMockPayment(tool, payer = "local-x402") {
  const req = paymentRequired(tool)
  const accepted = req.accepts[0]
  const nonce = String(Date.now())
  const sig = createHmac("sha256", secret()).update(`${tool}:${accepted.amount}:${nonce}:${payer}`).digest("hex")
  return {
    x402Version: 2,
    resource: req.resource,
    accepted,
    payload: {
      kind: "jobs2-hmac",
      signature: sig,
      authorization: { from: payer, to: accepted.payTo, value: accepted.amount, nonce },
    },
  }
}

function validMock(tool, payment) {
  const p = payment?.payload
  if (!p || p.kind !== "jobs2-hmac") return false
  const auth = p.authorization || {}
  const expect = createHmac("sha256", secret())
    .update(`${tool}:${auth.value}:${auth.nonce}:${auth.from}`)
    .digest("hex")
  const a = Buffer.from(String(p.signature || ""))
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  const need = TOOL_PRICE_USDC_MICRO[tool]
  return String(auth.value) === String(need)
}

export async function settleX402(tool, payment) {
  if (!payment) return { ok: false, reason: "missing_payment" }
  if (validMock(tool, payment)) {
    return {
      ok: true,
      mock: true,
      payer: payment.payload.authorization.from,
      network: NETWORK_BASE_SEPOLIA,
      transaction: `mock:${payment.payload.authorization.nonce}`,
    }
  }
  const to = payTo()
  if (!to) return { ok: false, reason: "no_pay_to_and_invalid_mock" }
  const url = `${facilitatorUrl()}/verify`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPayload: payment, paymentRequirements: paymentRequired(tool).accepts[0] }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && (data.valid === true || data.isValid === true || data.success === true)) {
      return { ok: true, payer: data.payer || payment.payload?.authorization?.from, network: NETWORK_BASE_SEPOLIA, transaction: data.transaction || "" }
    }
    return { ok: false, reason: data.errorReason || data.error || `facilitator_${res.status}` }
  } catch (err) {
    return { ok: false, reason: String(err.message || err) }
  }
}

export function extractPayment(params, headers) {
  const meta = params?._meta || params?.meta || {}
  if (meta["x402/payment"]) return meta["x402/payment"]
  const h = headers || {}
  const raw = h["payment-signature"] || h["PAYMENT-SIGNATURE"] || h["x-payment"]
  if (!raw) return null
  try {
    const s = String(raw)
    const json = s.startsWith("{") ? s : Buffer.from(s, "base64").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function x402ToolError(tool, error) {
  const structured = paymentRequired(tool, error)
  return {
    isError: true,
    structuredContent: structured,
    content: [{ type: "text", text: JSON.stringify(structured) }],
  }
}

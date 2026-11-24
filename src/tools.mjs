import { AuthError, authorize } from "./auth.mjs"
import { queryJobs, listSpecialties } from "./store.mjs"
import { PLANS } from "./plans.mjs"
import { jobsMarkdown, specialtiesMarkdown } from "./table.mjs"
import { extractPayment, settleX402, x402ToolError } from "./x402.mjs"

export const TOOL_DEFS = [
  {
    name: "search_jobs",
    description:
      "Query jobs by country, city, and specialty. Returns a Markdown table. €5 MCP / €5 web, or x402 USDC per call.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "ISO-2 country, e.g. DE" },
        city: { type: "string" },
        specialty: { type: "string", description: "jobs2 specialty id, e.g. hardware" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "search_jobs_fast",
    description: "Same filters from Redis. Markdown table. €10 MCP / €5 web, or x402.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string" },
        city: { type: "string" },
        specialty: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "search_jobs_salary",
    description: "Jobs with salary range and specialties. Markdown table. €15 MCP / €5 web, or x402.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string" },
        city: { type: "string" },
        specialty: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "list_specialties",
    description: "Markdown table of specialty ids for the current subscription or x402 session.",
    inputSchema: { type: "object", properties: {} },
  },
]

function md(text, extraMeta) {
  const out = { content: [{ type: "text", text }] }
  if (extraMeta) out._meta = extraMeta
  return out
}

async function sessionFor(name, token, params, headers) {
  try {
    return { session: authorize(token, name), payment: null }
  } catch (err) {
    if (!(err instanceof AuthError) || (err.status !== 401 && err.status !== 402)) throw err
    const payment = extractPayment(params, headers)
    const settled = await settleX402(name, payment)
    if (settled.ok) {
      return {
        session: {
          email: settled.payer || "x402",
          plan: "mcp_salary",
          via: "x402",
        },
        payment: settled,
      }
    }
    return { error: x402ToolError(name, err.message + (settled.reason ? ` (${settled.reason})` : "")) }
  }
}

export async function callTool(name, args, token, params = {}, headers = {}) {
  const gate = await sessionFor(name, token, params, headers)
  if (gate.error) return gate.error
  const session = gate.session
  const payMeta = gate.payment
    ? {
        "x402/payment-response": {
          success: true,
          transaction: gate.payment.transaction,
          network: gate.payment.network,
          payer: gate.payment.payer,
        },
      }
    : undefined
  const filters = {
    country: args?.country,
    city: args?.city,
    specialty: args?.specialty,
  }
  if (name === "list_specialties") {
    return md(specialtiesMarkdown(listSpecialties(), session), payMeta)
  }
  if (name === "search_jobs") {
    const data = await queryJobs("supabase", filters)
    return md(jobsMarkdown(data.jobs, { includeSalary: false, plan: session.plan, store: data.store, email: session.email }), payMeta)
  }
  if (name === "search_jobs_fast") {
    const data = await queryJobs("redis", filters)
    return md(jobsMarkdown(data.jobs, { includeSalary: false, plan: session.plan, store: data.store, email: session.email }), payMeta)
  }
  if (name === "search_jobs_salary") {
    const data = await queryJobs("redis", filters, { includeSalary: true })
    return md(jobsMarkdown(data.jobs, { includeSalary: true, plan: session.plan, store: data.store, email: session.email }), payMeta)
  }
  throw new Error(`unknown tool ${name}`)
}

export function listToolsForToken(token) {
  const session = authorize(token, "list_specialties")
  const plan = PLANS[session.plan]
  return TOOL_DEFS.filter((t) => plan.tools.includes(t.name))
}

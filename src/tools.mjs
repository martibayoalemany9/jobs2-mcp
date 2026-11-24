import { authorize } from "./auth.mjs"
import { queryJobs, listSpecialties } from "./store.mjs"
import { PLANS } from "./plans.mjs"

export const TOOL_DEFS = [
  {
    name: "search_jobs",
    description: "Query jobs by country, city, and specialty from Supabase (€5 MCP or €5 web).",
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
    description: "Same filters, Redis-first (€10 MCP or €5 web).",
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
    description: "Jobs with salary range and specialties on each role (€15 MCP or €5 web).",
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
    description: "List specialty ids available to the current subscription.",
    inputSchema: { type: "object", properties: {} },
  },
]

function text(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] }
}

export async function callTool(name, args, token) {
  const session = authorize(token, name)
  const filters = {
    country: args?.country,
    city: args?.city,
    specialty: args?.specialty,
  }
  if (name === "list_specialties") {
    return text({ plan: session.plan, email: session.email, specialties: listSpecialties() })
  }
  if (name === "search_jobs") {
    const data = await queryJobs("supabase", filters)
    return text({ plan: session.plan, ...data })
  }
  if (name === "search_jobs_fast") {
    const data = await queryJobs("redis", filters)
    return text({ plan: session.plan, ...data })
  }
  if (name === "search_jobs_salary") {
    const data = await queryJobs("redis", filters, { includeSalary: true })
    return text({ plan: session.plan, ...data })
  }
  throw new Error(`unknown tool ${name}`)
}

export function listToolsForToken(token) {
  const session = authorize(token, "list_specialties")
  const plan = PLANS[session.plan]
  return TOOL_DEFS.filter((t) => plan.tools.includes(t.name))
}

/** MCP and web subscription plans (EUR cents / month). */

export const PLANS = {
  free: {
    id: "free",
    name: "Free (country only)",
    price_cents: 0,
    coming_next: false,
    stores: ["supabase"],
    tools: ["search_jobs", "list_specialties", "subscribe"],
    note: "Country filter only, 50 jobs. Subscribe for text search.",
  },
  web_studio: {
    id: "web_studio",
    name: "Jobs2 Studio web",
    price_cents: 500,
    coming_next: false,
    stores: ["supabase", "redis"],
    tools: ["search_jobs", "list_specialties", "subscribe"],
    note: "Included when you pay MCP Supabase jobs.",
  },
  mcp_supabase: {
    id: "mcp_supabase",
    name: "MCP Supabase jobs",
    price_cents: 500,
    coming_next: false,
    stores: ["supabase"],
    tools: ["search_jobs", "list_specialties", "subscribe"],
    note: "Pays for full search_jobs (text filter) and includes Jobs2 Studio web.",
  },
  mcp_redis: {
    id: "mcp_redis",
    name: "MCP Redis fast jobs",
    price_cents: 1000,
    coming_next: true,
    stores: ["redis", "supabase"],
    tools: ["search_jobs", "search_jobs_fast", "list_specialties"],
    note: "Coming next.",
  },
  mcp_salary: {
    id: "mcp_salary",
    name: "MCP salary + specialties",
    price_cents: 1500,
    coming_next: true,
    stores: ["redis", "supabase"],
    tools: ["search_jobs", "search_jobs_fast", "search_jobs_salary", "list_specialties"],
    note: "Coming next.",
  },
}

export const TOOL_MIN_PLAN = {
  login: Object.keys(PLANS),
  subscribe: Object.keys(PLANS),
  search_jobs: ["free", "web_studio", "mcp_supabase", "mcp_redis", "mcp_salary"],
  search_jobs_fast: ["web_studio", "mcp_redis", "mcp_salary"],
  search_jobs_salary: ["web_studio", "mcp_salary"],
  list_specialties: ["free", "web_studio", "mcp_supabase", "mcp_redis", "mcp_salary"],
}

export const OPERATOR_EMAIL = "martibayoalemany@gmail.com"
export const FREE_DEMO_EMAIL = "martibayoalemany4@gmail.com"

export function planAllowsTool(planId, tool) {
  const allowed = TOOL_MIN_PLAN[tool] || []
  return allowed.includes(planId)
}

export function searchEntitlement(session) {
  const email = String(session?.email || "").toLowerCase()
  const plan = session?.plan
  const paid =
    email === OPERATOR_EMAIL ||
    plan === "web_studio" ||
    plan === "mcp_supabase" ||
    plan === "mcp_redis" ||
    plan === "mcp_salary"
  if (paid) {
    return { textFilter: true, countryOnly: false, maxLimit: 10000, subscribeHint: "" }
  }
  return {
    textFilter: false,
    countryOnly: true,
    maxLimit: 50,
    subscribeHint:
      "Country is the only filter allowed unless you subscribe. Call the subscribe tool to unlock text search and the full catalog.",
  }
}

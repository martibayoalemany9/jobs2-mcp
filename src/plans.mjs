/** MCP and web subscription plans (EUR cents / month). */

export const PLANS = {
  web_studio: {
    id: "web_studio",
    name: "Jobs2 Studio web",
    price_cents: 500,
    stores: ["supabase", "redis"],
    tools: ["search_jobs", "search_jobs_fast", "search_jobs_salary", "list_specialties"],
    note: "€5 web subscription unlocks every MCP tool.",
  },
  mcp_supabase: {
    id: "mcp_supabase",
    name: "MCP Supabase jobs",
    price_cents: 500,
    stores: ["supabase"],
    tools: ["search_jobs", "list_specialties"],
    note: "Country, city, and specialty queries on Supabase.",
  },
  mcp_redis: {
    id: "mcp_redis",
    name: "MCP Redis fast jobs",
    price_cents: 1000,
    stores: ["redis", "supabase"],
    tools: ["search_jobs", "search_jobs_fast", "list_specialties"],
    note: "Same filters, served from Redis first.",
  },
  mcp_salary: {
    id: "mcp_salary",
    name: "MCP salary + specialties",
    price_cents: 1500,
    stores: ["redis", "supabase"],
    tools: ["search_jobs", "search_jobs_fast", "search_jobs_salary", "list_specialties"],
    note: "Salary ranges and specialties attached to each role.",
  },
}

export const TOOL_MIN_PLAN = {
  search_jobs: ["web_studio", "mcp_supabase", "mcp_redis", "mcp_salary"],
  search_jobs_fast: ["web_studio", "mcp_redis", "mcp_salary"],
  search_jobs_salary: ["web_studio", "mcp_salary"],
  list_specialties: ["web_studio", "mcp_supabase", "mcp_redis", "mcp_salary"],
}

export function planAllowsTool(planId, tool) {
  const allowed = TOOL_MIN_PLAN[tool] || []
  return allowed.includes(planId)
}

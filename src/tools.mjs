import { AuthError, authorize, verifyToken } from "./auth.mjs"
import { queryJobs, listSpecialties } from "./store.mjs"
import { PLANS, searchEntitlement } from "./plans.mjs"
import { jobsMarkdown, specialtiesMarkdown } from "./table.mjs"
import { extractPayment, settleX402, x402ToolError } from "./x402.mjs"

const JOBS2_SITE = process.env.JOBS2_BASE_URL || "https://jobs2.graphai.eu"

const SEARCH_PROPS = {
  country: { type: "string", description: "ISO-2 country, e.g. DE. Required for the free 50-row plan." },
  specialty: { type: "string", description: "Specialty id (paid/operator only), e.g. hardware" },
  title: { type: "string", description: "Job title contains (paid/operator only)" },
  q: { type: "string", description: "Free-text (paid/operator). Ignored on the free plan." },
  city: { type: "string", description: "City contains (paid/operator only)" },
  page_size: { type: "integer", minimum: 1, maximum: 10000, description: "Rows per page (paid/operator). Free plan is fixed at 50." },
  page: { type: "integer", minimum: 1, description: "1-based page. Paid/operator only; free plan is a single page of 50." },
  limit: { type: "integer", minimum: 1, maximum: 10000, description: "Alias of page_size" },
}

export const TOOL_DEFS = [
  {
    name: "login",
    description:
      "Pair with jobs2.graphai.eu: open /mcp, read the number on the web, pass it here as code. Returns a Bearer token. Authorization is generated on login; do not paste YOUR_TOKEN beforehand.",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "8-digit number from the website" } } },
  },
  {
    name: "subscribe",
    description:
      "Start MCP · Supabase jobs (€5). That purchase also unlocks Jobs2 Studio web. Returns a checkout URL. Redis and salary SKUs are coming next.",
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "string", description: "mcp_supabase (default). web_studio is included. mcp_redis and mcp_salary are coming next." },
        email: { type: "string", description: "Optional if already logged in" },
      },
    },
  },
  {
    name: "search_jobs",
    description:
      "Query jobs. Operator/paid: country, specialty, title, page_size, page (full catalog). Free (martibayoalemany4): country only, 50 rows, one page.",
    inputSchema: { type: "object", properties: SEARCH_PROPS },
  },
  {
    name: "search_jobs_fast",
    description: "Redis path. Same filters and pagination as search_jobs.",
    inputSchema: { type: "object", properties: SEARCH_PROPS },
  },
  {
    name: "search_jobs_salary",
    description: "Salary columns. Same filters and pagination as search_jobs.",
    inputSchema: { type: "object", properties: SEARCH_PROPS },
  },
  {
    name: "list_specialties",
    description: "Markdown table of specialty ids. Paid/operator may pass page and page_size.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 1 },
        page_size: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
]

function md(text, extraMeta) {
  const out = { content: [{ type: "text", text }] }
  if (extraMeta) out._meta = extraMeta
  return out
}

async function sessionFor(name, token, params, headers) {
  try {
    return { session: await authorize(token, name), payment: null }
  } catch (err) {
    if (!(err instanceof AuthError) || (err.status !== 401 && err.status !== 402)) throw err
    const payment = extractPayment(params, headers)
    const settled = await settleX402(name, payment)
    if (settled.ok) {
      return {
        session: {
          email: settled.payer || "x402",
          plan: "mcp_supabase",
          via: "x402",
        },
        payment: settled,
      }
    }
    return { error: x402ToolError(name, err.message + (settled.reason ? ` (${settled.reason})` : "")) }
  }
}

async function runSubscribe(args, token) {
  let email = String(args?.email || "").trim().toLowerCase()
  if (!email && token) {
    try {
      const s = await verifyToken(token)
      email = s.email
    } catch {
      /* open subscribe without login */
    }
  }
  const plan = String(args?.plan || "mcp_supabase")
  if (plan === "mcp_redis" || plan === "mcp_salary") {
    return md("This product is coming next. Subscribe to mcp_supabase (€5) to unlock Jobs2 Studio web and full search_jobs.")
  }
  const headers = { "content-type": "application/json" }
  if (token) headers.authorization = String(token).startsWith("Bearer") ? token : `Bearer ${token}`
  const r = await fetch(`${JOBS2_SITE}/api/mcp/subscribe`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan: "mcp_supabase", email }),
  })
  const j = await r.json().catch(() => ({}))
  const intro =
    "Subscribe to MCP · Supabase jobs (€5). This also unlocks Jobs2 Studio web. Redis and salary products are coming next."
  if (j.url) {
    return md(`${intro}\n\nCheckout: ${j.url}\n\nAfter payment, call login again (pairing number on /mcp).`)
  }
  return md(`${intro}\n\nOpen ${JOBS2_SITE}/mcp and pay MCP · Supabase jobs. ${j.error || j.hint || ""}`.trim())
}

function applySearchGate(session, args) {
  const ent = searchEntitlement(session)
  const filters = {}
  const extras = []
  const askedPage = Math.max(1, Number(args?.page) || 1)
  const askedSize = Number(args?.page_size ?? args?.limit)
  if (ent.countryOnly) {
    filters.country = args?.country
    if (args?.city || args?.specialty || args?.q || args?.title) extras.push(ent.subscribeHint)
    if (args?.page || args?.page_size || args?.limit) extras.push("Free plan cannot set page_size or page. One page of 50 jobs.")
    if (!filters.country) extras.push("Pass country (ISO-2). " + ent.subscribeHint)
    return { filters, limit: ent.maxLimit, offset: 0, page: 1, extras, ent }
  }
  filters.country = args?.country
  filters.city = args?.city
  filters.specialty = args?.specialty
  filters.title = args?.title
  filters.q = args?.q
  const limit =
    Number.isFinite(askedSize) && askedSize > 0
      ? Math.min(askedSize, ent.maxLimit)
      : askedPage > 1
        ? 25
        : ent.maxLimit
  const offset = (askedPage - 1) * limit
  return { filters, limit, offset, page: askedPage, extras, ent }
}

export async function callTool(name, args, token, params = {}, headers = {}) {
  if (name === "login") {
    const code = String(args?.code || "").trim()
    if (!code) {
      return md(
        "Open https://jobs2.graphai.eu/mcp while signed in. Enter the **number on the web** as `login` argument `code`. The Bearer token is generated on login.",
      )
    }
    const r = await fetch(`${JOBS2_SITE}/api/mcp/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim", code }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return md(`login failed: ${j.error || r.status}`)
    if (!j.token) return md(`login failed: pairing did not return a token (${j.error || "empty"})`)
    return md(
      `Logged in as ${j.email} plan ${j.plan}\n\nToken is generated on login. Uncomment Authorization in your MCP config:\n\n\`\`\`toml\n${j.grok_toml}\n\`\`\`\n\nToken: \`${j.token}\``,
    )
  }
  if (name === "subscribe") {
    return runSubscribe(args, token)
  }
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
  if (name === "list_specialties") {
    const all = listSpecialties()
    const ent = searchEntitlement(session)
    let page = 1
    let pageSize = all.length
    if (!ent.countryOnly) {
      pageSize = Math.max(1, Math.min(Number(args?.page_size) || all.length, 100))
      page = Math.max(1, Number(args?.page) || 1)
    }
    const offset = (page - 1) * pageSize
    const slice = all.slice(offset, offset + pageSize)
    const hasMore = offset + slice.length < all.length
    let text = specialtiesMarkdown(slice, { plan: session.plan, email: session.email })
    text += `\n\npage: ${page} · page_size: ${slice.length} · matched: ${all.length}` +
      (hasMore ? ` · next_page: ${page + 1}\n\nPass page: ${page + 1} for the next specialties.` : " · next_page: —\n\nEnd of specialties.")
    return md(text, payMeta)
  }
  const { filters, limit, offset, extras } = applySearchGate(session, args)
  const pageOpts = { limit, offset }
  if (name === "search_jobs") {
    const data = await queryJobs("supabase", filters, pageOpts)
    let text = jobsMarkdown(data.jobs, {
      includeSalary: false,
      plan: session.plan,
      store: data.store,
      email: session.email,
      page: data.page,
      pages: data.pages,
      pageSize: data.limit,
      matched: data.matched,
      next_page: data.next_page,
      hasMore: data.hasMore,
    })
    if (extras.length) text = extras.join("\n") + "\n\n" + text
    return md(text, payMeta)
  }
  if (name === "search_jobs_fast") {
    const data = await queryJobs("redis", filters, pageOpts)
    return md(
      jobsMarkdown(data.jobs, {
        includeSalary: false,
        plan: session.plan,
        store: data.store,
        email: session.email,
        page: data.page,
        pages: data.pages,
        pageSize: data.limit,
        matched: data.matched,
        next_page: data.next_page,
        hasMore: data.hasMore,
      }),
      payMeta,
    )
  }
  if (name === "search_jobs_salary") {
    const data = await queryJobs("redis", filters, { includeSalary: true, ...pageOpts })
    return md(
      jobsMarkdown(data.jobs, {
        includeSalary: true,
        plan: session.plan,
        store: data.store,
        email: session.email,
        page: data.page,
        pages: data.pages,
        pageSize: data.limit,
        matched: data.matched,
        next_page: data.next_page,
        hasMore: data.hasMore,
      }),
      payMeta,
    )
  }
  throw new Error(`unknown tool ${name}`)
}

export async function listToolsForToken(token) {
  const open = TOOL_DEFS.filter((t) => t.name === "login" || t.name === "subscribe")
  try {
    const session = await authorize(token, "list_specialties")
    const plan = PLANS[session.plan] || PLANS.free
    const names = new Set(plan.tools.concat(["login", "subscribe"]))
    return TOOL_DEFS.filter((t) => names.has(t.name))
  } catch {
    return open
  }
}

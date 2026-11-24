# jobs2-mcp

Authenticated [Model Context Protocol](https://modelcontextprotocol.io) server for [jobs2.graphai.eu](https://jobs2.graphai.eu). Compatible with **Grok**, **OpenAI Codex**, Claude, Cursor, and any Streamable HTTP or stdio MCP client.

The server **requires login**. Tool calls without a Bearer token return HTTP 401. A valid token with a too-cheap plan returns HTTP 402.

Remote URL (after Vercel deploy): `https://mcp.jobs2.graphai.eu/mcp`  
Setup UI: `https://jobs2.graphai.eu/mcp`  
Billing (web + MCP together): `https://jobs2.graphai.eu/?view=invoices`

## Plans

| Plan | Price | Store | Tools |
|---|---|---|---|
| Jobs2 Studio web | **€5 / month** | all | every MCP tool **and** full web studio |
| MCP Supabase | **€5 / month** | Supabase | `search_jobs`, `list_specialties` (country, city, specialty) |
| MCP Redis | **€10 / month** | Redis first | plus `search_jobs_fast` |
| MCP salary | **€15 / month** | Redis + catalog | plus `search_jobs_salary` (salary range and specialties on each role) |

A **€5 web** subscription already includes Redis-fast and salary tools. Do not stack MCP add-ons unless the account is MCP-only.

## Login

1. Subscribe on the jobs2 billing page.
2. Copy the issued MCP token (`JOBS2_MCP_TOKEN`).
3. Send `Authorization: Bearer <token>` on every MCP HTTP request, or set `JOBS2_MCP_TOKEN` for the stdio process.

Tokens are HMAC-signed (`JOBS2_MCP_SIGNING_SECRET`) with `email`, `plan`, and expiry. They are not Clerk session cookies.

## Tools

- `search_jobs` — `country` (ISO-2), `city`, `specialty`
- `search_jobs_fast` — same filters, Redis
- `search_jobs_salary` — same filters, includes `salary_min` / `salary_max` / `specialties`
- `list_specialties`

## Deploy (Vercel webservice)

There is **no single global MCP cloud**. You run **your** server. Vercel Functions (this repo), Cloudflare Workers, or a container all work. Clients on the public internet call the HTTPS endpoint.

```bash
cd jobs2-mcp
npx vercel --prod --yes
```

Set Vercel env:

- `JOBS2_MCP_SIGNING_SECRET`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` (live catalog)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (fast path)
- `SENTRY_DSN`

Point `mcp.jobs2.graphai.eu` at the deployment. `vercel.json` maps `/` and `/mcp` to `api/mcp.js`.

Local HTTP: `PORT=8787 node src/http.mjs` then POST `http://127.0.0.1:8787/mcp`.

## Client setup

### Grok (`~/.grok/config.toml`)

```toml
[mcp_servers.jobs2]
url = "https://mcp.jobs2.graphai.eu/mcp"
enabled = true

  [mcp_servers.jobs2.headers]
  Authorization = "Bearer ${JOBS2_MCP_TOKEN}"
```

Local stdio while developing:

```toml
[mcp_servers.jobs2]
command = "node"
args = ["/Users/username/jobs2-mcp/src/stdio.mjs"]
enabled = true

  [mcp_servers.jobs2.env]
  JOBS2_MCP_TOKEN = "paste-token"
  JOBS2_MCP_SIGNING_SECRET = "same-as-server"
```

### Codex / Claude Code / Cursor

HTTP:

```json
{
  "mcpServers": {
    "jobs2": {
      "url": "https://mcp.jobs2.graphai.eu/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

stdio:

```json
{
  "mcpServers": {
    "jobs2": {
      "command": "node",
      "args": ["src/stdio.mjs"],
      "env": { "JOBS2_MCP_TOKEN": "YOUR_TOKEN" }
    }
  }
}
```

Claude Desktop uses `claude_desktop_config.json`. VS Code Copilot uses `.vscode/mcp.json`. ChatGPT custom connectors paste the HTTPS URL and OAuth/token when the directory supports it.

## Can we bill MCP on Revolut, Stripe, Checkout, NOWPayments, x402?

**MCP itself does not take money.** You bill the **account**, then the MCP checks the plan.

| Provider | Monthly MCP subscription | Notes for Graphai |
|---|---|---|
| **Checkout.com** | Yes, via existing jobs2 checkout | Sandbox-capable; keep MCP SKUs on the same billing page. Preferred while Revolut/Stripe flags are off. |
| **Revolut Pay** | Yes in principle (Merchant orders) | jobs2 currently **pauses** Revolut Pay (`REVOLUT_PAY_ENABLED`) because `/customers` was 500. Do not treat `payWithPopup` as live. |
| **Stripe** | Yes (Checkout Sessions / Billing) | Live account previously **rejected charges**. `STRIPE_PAY_ENABLED` stays off until the account can charge. Stripe **does not** bill “MCP protocol”; it bills a product SKU. |
| **NOWPayments** | Yes for **crypto** | [Recurring Payments API](https://nowpayments.io/blog/how-to-create-recurring-crypto-payments) (`POST /v1/subscriptions/plans`, 30-day interval, IPN). Good for €5/€10/€15 crypto SKUs. NOWPayments also ships `http://mcp.nowpayments.io/mcp` — that is **their** payment MCP, not a marketplace for ours. |
| **x402** | Pay-**per-request**, not a calendar month | HTTP 402 + USDC (Coinbase facilitator, Vercel `x402-mcp`, AWS Marketplace AgentCore). Excellent for agents that will not create an account. **Does not replace** a €5/€10/€15 monthly SKU unless you meter usage to those amounts. We return 402 with a pointer to the jobs2 billing page; optional `paidTool` can be added later for USDC micropayments. |

**Recommendation:** keep **Checkout.com** (and later Stripe/Revolut) for EUR monthly SKUs on jobs2; add **NOWPayments** for crypto monthly; use **x402** as an extra agent micropayment lane, not as the only subscription.

## Are there central MCP servers or marketplaces with billing?

- **No central MCP host you must use.** Anthropic’s spec is a protocol. You deploy.
- **Official MCP Registry** (`server.json` + domain proof) — listing, not charging.
- **Claude connectors / ChatGPT plugins / Cursor directory / Smithery / Glama / PulseMCP / mcp.so** — discovery. Billing is still yours (or the directory’s cut if they offer paid listings).
- **AWS Marketplace + Bedrock AgentCore payments** — can settle x402 in USD on an AWS bill.
- **Vercel** bills **compute** (Fluid functions), not your €5 SKU.
- **Apify:** store is for **Actors** (scrapers), with Apify subscription/compute units. You do **not** need a different Apify plugin to run this MCP. Optional: an Apify Actor could wrap job harvest; agents would still call **this** HTTP MCP. Apify’s own MCP (if enabled) is a separate client to Apify’s API.

## Sentry and Aikido

- Sentry: create project `jobs2-mcp`, set `SENTRY_DSN`. GitHub workflow `.github/workflows/ci.yml` runs tests.
- Aikido: add GitHub repo `martibayoalemany9/jobs2-mcp` to group (same as jobs2, `179235` if the org allows). Workflow `.github/workflows/aikido.yml` uses `TOKEN_AIKIDO_CI_CD`.

## Tests

```bash
node --test src/*.test.mjs
```

Covers token login, 401/402, all four tools, JSON-RPC `initialize` / `tools/list` / plan gating.

## License

Private Graphai OÜ unless published otherwise.

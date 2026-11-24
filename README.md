# jobs2-mcp

Authenticated [Model Context Protocol](https://modelcontextprotocol.io) server for [jobs2.graphai.eu](https://jobs2.graphai.eu). Compatible with **Grok**, **OpenAI Codex**, Claude, Cursor, and any Streamable HTTP or stdio MCP client.

The server **requires login or x402 payment**. `tools/list` without a Bearer token is HTTP 401. Tool calls without a token (or with a too-cheap plan) return an x402 `PaymentRequired` result (MCP `isError` + HTTP 402 `PAYMENT-REQUIRED`). Results are **Markdown tables** so Grok prints them as tables.

**x402 credentials on this Mac:** there is no `X402_PAY_TO`, CDP API key, or funded USDC wallet in `~/.env`. Live Coinbase facilitator settlement cannot run until you set `X402_PAY_TO` (Base address that receives USDC). Until then the seller advertises Base Sepolia USDC quotes and accepts a **dev HMAC mock** payload (`payload.kind = jobs2-hmac`) for tests. Grok on this laptop uses the `local-operator` subscription sentinel and does not need to pay.

Official registry: [`eu.graphai/jobs2`](https://registry.modelcontextprotocol.io/) (`server.json`, streamable HTTP).  
Remote URL: `https://jobs2-mcp.vercel.app/mcp`  
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

Each tool returns a Markdown table (country, city, title, company, specialties, url; salary columns on `search_jobs_salary`).

- `search_jobs` — `country` (ISO-2), `city`, `specialty`
- `search_jobs_fast` — same filters, Redis
- `search_jobs_salary` — same filters, includes `salary_min` / `salary_max` / `specialties`
- `list_specialties`

Grok (this Mac) is already registered in `~/.grok/config.toml` as `[mcp_servers.jobs2]` stdio. **Start a new Grok chat** so the process loads; this session started before the server existed. Then ask e.g. “call search_jobs for hardware in DE” and you should see a table.

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
| **x402** | Pay-**per-request** USDC | Implemented on this MCP: unpaid `tools/call` → MCP `PaymentRequired` + HTTP `PAYMENT-REQUIRED`. Retry with `_meta["x402/payment"]` or `PAYMENT-SIGNATURE`. Live settlement needs `X402_PAY_TO` + Coinbase facilitator (`X402_FACILITATOR_URL`, default `https://x402.org/facilitator`). No CDP keys in this workspace; mock HMAC payments work in tests. |

**Recommendation:** keep **Checkout.com** (and later Stripe/Revolut) for EUR monthly SKUs on jobs2; add **NOWPayments** for crypto monthly; use **x402** as an extra agent micropayment lane, not as the only subscription.

## Are there central MCP servers or marketplaces with billing?

- **No central MCP host you must use.** Anthropic’s spec is a protocol. You deploy.
- **Official MCP Registry** (`server.json` + domain proof) — listing, not charging.
- **Claude connectors / ChatGPT plugins / Cursor directory / Smithery / Glama / PulseMCP / mcp.so** — discovery. Billing is still yours (or the directory’s cut if they offer paid listings).
- **AWS Marketplace + Bedrock AgentCore payments** — can settle x402 in USD on an AWS bill.
- **Vercel** bills **compute** (Fluid functions), not your €5 SKU.
- **Apify:** store is for **Actors** (scrapers), with Apify subscription/compute units. You do **not** need a different Apify plugin to run this MCP. Optional: an Apify Actor could wrap job harvest; agents would still call **this** HTTP MCP. Apify’s own MCP (if enabled) is a separate client to Apify’s API.

## Sentry and Aikido

- GitHub: https://github.com/martibayoalemany9/jobs2-mcp
- Sentry project **jobs2-mcp** exists in org `graphai-ou` (EU, `de.sentry.io`), project id `4512486877954128`. Set `SENTRY_DSN` on Vercel. SDK hook: `src/sentry.mjs`.
- Aikido: GitHub secret `TOKEN_AIKIDO_CI_CD` is on this repo. Workflow `.github/workflows/aikido.yml` runs on `main`. `scan-release` CLI returns **402** on the current Aikido plan (`is_release_gating` is paid). Keep the GitHub App on group `179235` so SAST/SCA still ingest the public repo. `ci.yml` always runs `node --test`.

## Tests

```bash
node --test src/*.test.mjs
```

Covers token login, 401/402, all four tools, JSON-RPC `initialize` / `tools/list` / plan gating.

## License

Private Graphai OÜ unless published otherwise.

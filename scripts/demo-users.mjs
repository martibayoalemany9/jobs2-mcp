#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs"
import { hostname } from "node:os"
import { issueToken } from "../src/auth.mjs"
import { callTool } from "../src/tools.mjs"

const g1 = issueToken({ email: "martibayoalemany@gmail.com", plan: "web_studio" })
const g4 = issueToken({ email: "martibayoalemany4@gmail.com", plan: "free" })

async function run(label, token, name, args) {
  const t0 = Date.now()
  const out = await callTool(name, args, token)
  const text = out.content?.[0]?.text || JSON.stringify(out)
  return { label, name, args, ms: Date.now() - t0, text }
}

const cases = []
cases.push(await run("g1 operator unlimited", g1, "search_jobs", { country: "DE", specialty: "software", title: "Engineer", page_size: 10, page: 1 }))
cases.push(await run("g1 operator page 2", g1, "search_jobs", { country: "DE", specialty: "software", title: "Engineer", page_size: 10, page: 2 }))
cases.push(await run("g1 search_jobs_fast page 1", g1, "search_jobs_fast", { country: "DE", page_size: 8, page: 1 }))
cases.push(await run("g1 search_jobs_fast page 2", g1, "search_jobs_fast", { country: "DE", page_size: 8, page: 2 }))
cases.push(await run("g1 search_jobs_salary page 1", g1, "search_jobs_salary", { country: "DE", page_size: 8, page: 1 }))
cases.push(await run("g1 search_jobs_salary page 2", g1, "search_jobs_salary", { country: "DE", page_size: 8, page: 2 }))
cases.push(await run("g1 list_specialties page 1", g1, "list_specialties", { page_size: 3, page: 1 }))
cases.push(await run("g1 list_specialties page 2", g1, "list_specialties", { page_size: 3, page: 2 }))
cases.push(await run("g4 free country DE", g4, "search_jobs", { country: "DE", page_size: 200, page: 3, specialty: "hardware", title: "Engineer" }))
cases.push(await run("g4 free country NL", g4, "search_jobs", { country: "NL" }))
cases.push(await run("g4 list_specialties", g4, "list_specialties", { page_size: 2 }))

function mdToHtml(text) {
  const esc = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const lines = esc.split("\n")
  let html = ""
  let inTable = false
  for (const line of lines) {
    if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1)
      if (cells.every((c) => /^[\s:-]+$/.test(c))) continue
      if (!inTable) {
        html += "<table>"
        inTable = true
        html += "<thead><tr>" + cells.map((c) => `<th>${c.trim()}</th>`).join("") + "</tr></thead><tbody>"
      } else {
        html += "<tr>" + cells.map((c) => `<td>${c.trim()}</td>`).join("") + "</tr>"
      }
    } else {
      if (inTable) {
        html += "</tbody></table>"
        inTable = false
      }
      if (line.trim()) html += `<p>${line}</p>`
    }
  }
  if (inTable) html += "</tbody></table>"
  return html
}

const sections = cases
  .map(
    (c) => `<section class="card" id="${c.label.replace(/\s+/g, "-")}">
  <h2>${c.label}</h2>
  <p class="meta">tool <code>${c.name}</code> · args <code>${JSON.stringify(c.args)}</code> · ${c.ms} ms</p>
  ${mdToHtml(c.text)}
</section>`,
  )
  .join("\n")

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Jobs2 MCP · g1 vs g4 on ${hostname()}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#0b1220; color:#e8eef8; margin:0; }
  header { padding:24px 32px; background:#132038; border-bottom:1px solid #2a3d5c; }
  h1 { margin:0 0 8px; font-size:22px; }
  .sub { color:#9fb3cc; font-size:14px; }
  main { padding:20px 32px 48px; display:grid; gap:20px; }
  .card { background:#15243a; border:1px solid #2a3d5c; border-radius:12px; padding:16px 18px; }
  h2 { margin:0 0 8px; font-size:16px; color:#7dd3fc; }
  .meta { color:#9fb3cc; font-size:12px; }
  table { border-collapse:collapse; width:100%; font-size:13px; margin-top:8px; }
  th,td { border:1px solid #2a3d5c; padding:6px 8px; text-align:left; }
  th { background:#1c3150; }
  code { background:#0b1220; padding:1px 5px; border-radius:4px; }
  .g4 { outline: 2px solid #f59e0b; }
</style></head>
<body>
<header>
  <h1>Jobs2 MCP on ${hostname()}</h1>
  <p class="sub">GCP demo · ${new Date().toISOString()} · g1 martibayoalemany@gmail.com (unlimited) · g4 martibayoalemany4@gmail.com (50 rows, country only)</p>
</header>
<main>${sections}</main>
</body></html>`

const dir = process.env.OUT_DIR || "/tmp/jobs2-mcp-demo"
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/report.html`, html)
writeFileSync(`${dir}/cases.json`, JSON.stringify(cases.map((c) => ({ ...c, text: c.text.slice(0, 2000) })), null, 2))
console.log(`wrote ${dir}/report.html host=${hostname()} cases=${cases.length}`)

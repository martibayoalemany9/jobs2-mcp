/** Markdown tables so Grok/Codex print job results as tables. */

function cell(v) {
  return String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
}

export function markdownTable(headers, rows) {
  const head = `| ${headers.map(cell).join(" | ")} |`
  const sep = `| ${headers.map(() => "---").join(" | ")} |`
  const body = rows.map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n")
  return `${head}\n${sep}\n${body}`
}

export function jobsMarkdown(jobs, { includeSalary = false, plan, store, email } = {}) {
  const headers = includeSalary
    ? ["country", "city", "title", "company", "specialties", "salary_min", "salary_max", "url"]
    : ["country", "city", "title", "company", "specialties", "url"]
  const rows = (jobs || []).map((j) => {
    const specs = Array.isArray(j.specialties) ? j.specialties.join(", ") : ""
    const base = [j.country_iso2, j.city, j.title, j.company, specs]
    if (includeSalary) return [...base, j.salary_min ?? "", j.salary_max ?? "", j.url || ""]
    return [...base, j.url || ""]
  })
  const table = rows.length ? markdownTable(headers, rows) : "_no matching jobs_"
  const meta = [`plan: ${plan || "—"}`, store ? `store: ${store}` : null, email ? `user: ${email}` : null, `rows: ${rows.length}`]
    .filter(Boolean)
    .join(" · ")
  return `${meta}\n\n${table}`
}

export function specialtiesMarkdown(list, { plan, email } = {}) {
  const rows = (list || []).map((s) => [s])
  const table = rows.length ? markdownTable(["specialty"], rows) : "_none_"
  return `plan: ${plan || "—"} · user: ${email || "—"}\n\n${table}`
}

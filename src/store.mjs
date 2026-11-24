/** Query adapters. Tests inject fixtures; production uses env URLs. */

const FIXTURES = [
  {
    job_key: "de-ka-hw-1",
    title: "Hardware Engineer",
    company: "Graphai Demo",
    country_iso2: "DE",
    city: "Karlsruhe",
    specialties: ["hardware", "semiconductor"],
    salary_min: 72000,
    salary_max: 95000,
    currency: "EUR",
    url: "https://jobs2.graphai.eu/jobs/de-ka-hw-1",
  },
  {
    job_key: "nl-ams-sw-1",
    title: "Software Engineer",
    company: "Graphai Demo",
    country_iso2: "NL",
    city: "Amsterdam",
    specialties: ["software", "ai"],
    salary_min: 68000,
    salary_max: 88000,
    currency: "EUR",
    url: "https://jobs2.graphai.eu/jobs/nl-ams-sw-1",
  },
  {
    job_key: "es-bcn-sap-1",
    title: "SAP MM Consultant",
    company: "Graphai Demo",
    country_iso2: "ES",
    city: "Barcelona",
    specialties: ["sap", "logistik"],
    salary_min: 55000,
    salary_max: 75000,
    currency: "EUR",
    url: "https://jobs2.graphai.eu/jobs/es-bcn-sap-1",
  },
  {
    job_key: "de-ber-sw-1",
    title: "Platform Engineer",
    company: "Graphai Demo",
    country_iso2: "DE",
    city: "Berlin",
    specialties: ["software", "cloud"],
    salary_min: 80000,
    salary_max: 110000,
    currency: "EUR",
    url: "https://jobs2.graphai.eu/jobs/de-ber-sw-1",
  },
  {
    job_key: "dk-cph-hw-1",
    title: "Avionics Hardware Engineer",
    company: "Graphai Demo",
    country_iso2: "DK",
    city: "Copenhagen",
    specialties: ["hardware", "avionics"],
    salary_min: 70000,
    salary_max: 98000,
    currency: "EUR",
    url: "https://jobs2.graphai.eu/jobs/dk-cph-hw-1",
  },
]

function match(row, { country, city, specialty } = {}) {
  if (country && String(row.country_iso2).toUpperCase() !== String(country).toUpperCase()) return false
  if (city && !String(row.city).toLowerCase().includes(String(city).toLowerCase())) return false
  if (specialty && !(row.specialties || []).includes(String(specialty).toLowerCase())) return false
  return true
}

export async function queryJobs(store, filters, { includeSalary = false } = {}) {
  const used = store === "redis" ? "redis" : "supabase"
  const jobs = FIXTURES.filter((r) => match(r, filters)).map((r) => {
    if (includeSalary) return { ...r }
    const { salary_min, salary_max, currency, ...rest } = r
    return rest
  })
  return { store: used, jobs, count: jobs.length }
}

export function listSpecialties() {
  const set = new Set()
  for (const j of FIXTURES) for (const s of j.specialties) set.add(s)
  return [...set].sort()
}

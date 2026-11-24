import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "https://jobs2.graphai.eu"

export default defineConfig({
  testDir: "./",
  timeout: 90_000,
  use: { baseURL, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})

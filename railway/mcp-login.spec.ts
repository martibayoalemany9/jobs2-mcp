import { expect, test } from "@playwright/test"

test("jobs2 MCP page documents Grok install and pairing login", async ({ page }) => {
  await page.goto("/mcp")
  await expect(page.locator("h1")).toContainText("Jobs2 MCP")
  await expect(page.getByTestId("mcp-register-docs")).toContainText("search_jobs")
  await expect(page.getByText("[mcp_servers.jobs2]")).toBeVisible()
  await expect(page.getByTestId("mcp-pair-login")).toBeVisible()
})

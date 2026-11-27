import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"
import { handleHttp } from "./http.mjs"
import { AUTH_ISSUER, RESOURCE, protectedResourceMetadata, wwwAuthenticate } from "./oauth.mjs"

test("RFC 9728 protected resource metadata lists Clerk as AS", () => {
  const m = protectedResourceMetadata()
  assert.equal(m.resource, RESOURCE)
  assert.deepEqual(m.authorization_servers, [AUTH_ISSUER])
  assert.ok(m.scopes_supported.includes("mcp:tools"))
  assert.deepEqual(m.bearer_methods_supported, ["header"])
})

test("WWW-Authenticate points at RFC 9728 URL and RFC 8707 resource", () => {
  const h = wwwAuthenticate()
  assert.match(h, /resource_metadata="https:\/\/mcp\.jobs2\.graphai\.eu\/\.well-known\/oauth-protected-resource"/)
  assert.match(h, /resource="https:\/\/mcp\.jobs2\.graphai\.eu\/mcp"/)
  assert.match(h, /scope="mcp:tools"/)
})

test("HTTP GET well-known oauth-protected-resource", async () => {
  const server = createServer((req, res) => {
    handleHttp(req, res).catch(() => res.end())
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const { port } = server.address()
  const res = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.resource, RESOURCE)
  assert.equal(body.authorization_servers[0], AUTH_ISSUER)
  const as = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`)
  const disc = await as.json()
  assert.equal(disc.code_challenge_methods_supported[0], "S256")
  assert.equal(disc.client_id_metadata_document_supported, true)
  assert.equal(disc.resource_indicators, RESOURCE)
  server.close()
})

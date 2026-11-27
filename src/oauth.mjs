/** MCP OAuth 2.1 resource-server metadata (RFC 9728) + Clerk AS discovery. */

export const RESOURCE =
  process.env.JOBS2_MCP_RESOURCE || "https://mcp.jobs2.graphai.eu/mcp"

export const AUTH_ISSUER = process.env.JOBS2_OAUTH_ISSUER || "https://clerk.graphai.eu"

export const SCOPES = ["mcp:tools", "email", "openid", "profile", "offline_access"]

export function resourceOrigin() {
  return new URL(RESOURCE).origin
}

/** RFC 9728 Protected Resource Metadata. */
export function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [AUTH_ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: SCOPES,
    resource_name: "Jobs2 Graphai MCP",
    resource_documentation: "https://jobs2.graphai.eu/mcp",
    resource_policy_uri: "https://jobs2.graphai.eu/imprint",
    tls_client_certificate_bound_access_tokens: false,
  }
}

/**
 * RFC 8414 is published by Clerk (the authorization server), not this resource.
 * Clients MUST fetch `${AUTH_ISSUER}/.well-known/oauth-authorization-server`
 * or OpenID Discovery `${AUTH_ISSUER}/.well-known/openid-configuration`.
 * Clerk already advertises PKCE S256 and OAuth 2.1 code+refresh.
 */
export function authorizationServerDiscoveryUrls() {
  return {
    oauth_authorization_server: `${AUTH_ISSUER}/.well-known/oauth-authorization-server`,
    openid_configuration: `${AUTH_ISSUER}/.well-known/openid-configuration`,
    jwks_uri: `${AUTH_ISSUER}/.well-known/jwks.json`,
    authorization_endpoint: `${AUTH_ISSUER}/oauth/authorize`,
    token_endpoint: `${AUTH_ISSUER}/oauth/token`,
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    resource_indicators: RESOURCE,
  }
}

export function wwwAuthenticate(scope = "mcp:tools") {
  const meta = `${resourceOrigin()}/.well-known/oauth-protected-resource`
  const pathMeta = `${resourceOrigin()}/.well-known/oauth-protected-resource/mcp`
  return `Bearer realm="jobs2-mcp", resource_metadata="${meta}", resource_metadata_path="${pathMeta}", scope="${scope}", resource="${RESOURCE}"`
}

export function isJwt(token) {
  const parts = String(token || "").replace(/^Bearer\s+/i, "").split(".")
  return parts.length === 3
}

let jwksCache = { at: 0, keys: [] }

async function jwks() {
  const now = Date.now()
  if (jwksCache.keys.length && now - jwksCache.at < 3600_000) return jwksCache.keys
  const r = await fetch(`${AUTH_ISSUER}/.well-known/jwks.json`)
  if (!r.ok) throw new Error(`jwks ${r.status}`)
  const body = await r.json()
  jwksCache = { at: now, keys: body.keys || [] }
  return jwksCache.keys
}

export async function verifyClerkJwt(raw) {
  const { createPublicKey, createVerify } = await import("node:crypto")
  const token = String(raw || "").replace(/^Bearer\s+/i, "")
  const [h, p, s] = token.split(".")
  if (!h || !p || !s) throw new Error("malformed jwt")
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"))
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"))
  const keys = await jwks()
  const jwk = keys.find((k) => !header.kid || k.kid === header.kid) || keys[0]
  if (!jwk) throw new Error("no jwk")
  const key = createPublicKey({ key: jwk, format: "jwk" })
  const ok = createVerify("RSA-SHA256")
    .update(`${h}.${p}`)
    .verify(key, Buffer.from(s, "base64url"))
  if (!ok) throw new Error("bad jwt sig")
  if (claims.iss && claims.iss !== AUTH_ISSUER && !String(claims.iss).startsWith(AUTH_ISSUER)) {
    throw new Error("bad iss")
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  const resourceOk =
    aud.includes(RESOURCE) ||
    aud.includes(resourceOrigin()) ||
    aud.some((a) => String(a || "").includes("jobs2"))
  if (claims.aud && !resourceOk && process.env.JOBS2_OAUTH_STRICT_AUD === "1") {
    throw new Error("token not bound to this MCP resource (RFC 8707)")
  }
  const email = String(claims.email || claims.preferred_username || "").trim().toLowerCase()
  const plan = claims.plan || claims.public_metadata?.plan || "mcp_supabase"
  return {
    email: email || `clerk:${claims.sub || "unknown"}`,
    plan,
    exp: (claims.exp || 0) * 1000,
    via: "clerk-oauth",
    sub: claims.sub,
    aud: claims.aud,
  }
}

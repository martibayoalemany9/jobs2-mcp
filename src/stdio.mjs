#!/usr/bin/env node
import { createInterface } from "node:readline"
import { handleJsonRpc } from "./rpc.mjs"

const token = process.env.JOBS2_MCP_TOKEN || ""
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of rl) {
  const trimmed = line.trim()
  if (!trimmed) continue
  let body
  try {
    body = JSON.parse(trimmed)
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } })}\n`)
    continue
  }
  const out = await handleJsonRpc(body, { authorization: token ? `Bearer ${token}` : "" })
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`)
}

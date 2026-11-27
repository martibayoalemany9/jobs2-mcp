#!/usr/bin/env python3
"""Same installer as https://jobs2.graphai.eu/mcp-install.py"""
from __future__ import print_function
import json, os, sys

URL = os.environ.get("JOBS2_MCP_URL", "https://jobs2-mcp.vercel.app/mcp")
HOME = os.path.expanduser("~")
GROK = """# Authorization is filled after the login tool returns a token.
[mcp_servers.jobs2]
url = "%s"
enabled = true
# [mcp_servers.jobs2.headers]
# Authorization = "Bearer <issued on login>"
""" % URL


def merge_json(path, url):
    data = {}
    if os.path.isfile(path):
        try:
            with open(path) as f:
                data = json.load(f) or {}
        except Exception:
            data = {}
    servers = data.get("mcpServers") or {}
    servers["jobs2"] = {"url": url, "disabled": False}
    data["mcpServers"] = servers
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("wrote", path)


def merge_toml(path):
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    existing = ""
    if os.path.isfile(path):
        with open(path) as f:
            existing = f.read()
    if "[mcp_servers.jobs2]" in existing:
        print("jobs2 already in", path)
        return
    with open(path, "a") as f:
        if existing and not existing.endswith("\n"):
            f.write("\n")
        f.write("\n" + GROK)
    print("wrote", path)


def main():
    merge_toml(os.path.join(HOME, ".grok", "config.toml"))
    merge_json(os.path.join(HOME, ".cursor", "mcp.json"), URL)
    print("Call jobs2 login after pairing. Do not paste YOUR_TOKEN.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

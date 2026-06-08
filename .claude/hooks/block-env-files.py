#!/usr/bin/env python3
import sys, json, re, os

data = json.load(sys.stdin)
inp = data.get("tool_input", {})
file_path = inp.get("file_path", "") or inp.get("path", "")
command = inp.get("command", "")

blocked = False
if file_path and re.match(r"\.env(\.[a-z]*)?$", os.path.basename(file_path), re.IGNORECASE):
    blocked = True
if command and re.search(r"(?:^|[\s/])\.env(?:\.[a-z]*)?(?:$|[\s\"'\\])", command, re.IGNORECASE):
    blocked = True

if blocked:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": ".env files are off-limits to protect secrets. Set keys in Vercel environment variables for production."
        }
    }))

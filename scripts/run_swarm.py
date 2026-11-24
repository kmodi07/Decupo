#!/usr/bin/env python3
"""Run three actual Claude Code agents concurrently in isolated git worktrees.

Requires installed 'claude' CLI, ANTHROPIC_API_KEY, and an explicit operator trigger.
This runner never deploys, sends messages, or claims simulated work is real.
"""
import concurrent.futures
import datetime as dt
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "agent-reports"
OUTPUT.mkdir(exist_ok=True)
LOCK = threading.Lock()
AGENTS = {
    "frontend": ("site", ".claude/agents/frontend.md"),
    "backend": ("server", ".claude/agents/backend.md"),
    "qa": ("tests", ".claude/agents/qa.md"),
}
GOAL = os.getenv("MISSION_GOAL", "Build the Decupo premium website and a real mission-control foundation")
MAX_TURNS = os.getenv("AGENT_MAX_TURNS", "14")

def command(args, cwd=ROOT, check=True):
    return subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, check=check)

def event(agent, state, detail=""):
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    item = {"at": now, "agent": agent, "status": state, "detail": detail[:220]}
    with LOCK:
        with (OUTPUT / "events.jsonl").open("a", encoding="utf-8") as log:
            log.write(json.dumps(item) + "\n")
        print(f"[{now}] {agent}: {state} {detail[:100]}", flush=True)

def run_agent(name, scope, config, workspace):
    path = workspace / name
    event(name, "starting", f"isolated worktree; owns {scope}/")
    try:
        command(["git", "worktree", "add", "--detach", str(path), "HEAD"])
        instructions = (path / config).read_text(encoding="utf-8")
        prompt = (
            f"You are the {name} Decupo agent. MISSION: {GOAL}\n"
            f"Your ONLY writable project directory is {scope}/. "
            "Read CLAUDE.md, then implement actual functioning code under your own directory. "
            "Do not edit any other directory or configuration. "
            "Do not install unrelated dependencies, deploy, contact people, or spend money. "
            "Run useful local checks. Write files, not just explanations. "
            "Never claim tests passed unless you ran them.\n" + instructions
        )
        argv = ["claude", "-p", prompt, "--output-format", "stream-json",
                "--verbose", "--permission-mode", "acceptEdits",
                "--max-turns", MAX_TURNS]
        proc = subprocess.Popen(argv, cwd=path, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, bufsize=1)
        tool_count = 0
        errors = 0
        with (OUTPUT / f"{name}.log").open("w", encoding="utf-8") as log:
            for line in proc.stdout:
                try:
                    item = json.loads(line)
                    kind = item.get("type", "unknown")
                    # Do not persist raw prompts, file contents, or environment data.
                    if kind == "assistant":
                        blocks = item.get("message", {}).get("content", [])
                        for block in blocks:
                            if block.get("type") == "tool_use":
                                tool_count += 1
                                event(name, "working", str(block.get("name", "tool")))
                    elif kind == "result" and item.get("is_error"):
                        errors += 1
                    log.write(json.dumps({"event_type": kind, "at": dt.datetime.now(dt.timezone.utc).isoformat()}) + "\n")
                except (ValueError, TypeError):
                    log.write("non-json output omitted\n")
        code = proc.wait()
        if code:
            raise RuntimeError(f"Claude exited {code}; tool calls: {tool_count}, errors: {errors}")
        status = command(["git", "status", "--porcelain", "--", scope], path).stdout
        if not status.strip():
            raise RuntimeError(f"No changed files under {scope}/")
        command(["git", "add", "--", scope], path)
        command(["git", "commit", "-m", f"feat({name}): implement Decupo mission scope"], path)
        sha = command(["git", "rev-parse", "HEAD"], path).stdout.strip()
        event(name, "completed", f"{tool_count} tool operations; commit {sha[:10]}")
        return {"agent": name, "commit": sha, "ok": True, "tools": tool_count}
    except Exception as exc:
        event(name, "failed", str(exc))
        return {"agent": name, "commit": None, "ok": False, "error": str(exc)}

def write_dashboard(results):
    events = []
    event_path = OUTPUT / "events.jsonl"
    if event_path.exists():
        events = [json.loads(x) for x in event_path.read_text().splitlines() if x]
    rows = []
    for r in results:
        label = "Completed" if r["ok"] else "Failed"
        rows.append(f"<tr><td>{html.escape(r['agent'])}</td><td>{label}</td><td>{html.escape((r.get('commit') or r.get('error') or '')[:110])}</td></tr>")
    activity = "".join(f"<li><b>{html.escape(e['agent'])}</b> · {html.escape(e['status'])} · {html.escape(e['detail'])}</li>" for e in events[-70:])
    page = ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            '<title>Decupo · Actual Agent Run</title><style>body{font:16px system-ui;background:#130d25;color:#f6f1ff;max-width:950px;margin:5vw auto;padding:24px}'
            'h1{font-size:2.6rem}p,li{line-height:1.6}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #6f6287;padding:15px;text-align:left}'
            'section{background:#261a42;padding:24px;border-radius:18px;margin-top:20px}small{color:#d4c9e6}</style>'
            '<h1>Decupo Agent Run</h1><p>Real execution report from GitHub Actions. This is a completed-run snapshot, not a live simulation.</p>'
            '<section><h2>Workers</h2><table><tr><th>Agent</th><th>Status</th><th>Evidence</th></tr>'
            + ''.join(rows) + '</table></section><section><h2>Actual recorded activity</h2><ol>' + activity + '</ol></section>'
            '<small>For ongoing live activity while jobs run, open the GitHub Actions console.</small></html>')
    (OUTPUT / "index.html").write_text(page, encoding="utf-8")
    (OUTPUT / "summary.json").write_text(json.dumps({"goal": GOAL, "results": results}, indent=2), encoding="utf-8")
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## Decupo genuine multi-agent run\n\n")
            f.write("| Agent | Status | Commit |\n|---|---|---|\n")
            for r in results:
                f.write(f"| {r['agent']} | {'completed' if r['ok'] else 'failed'} | {(r.get('commit') or '-')[:12]} |\n")
            f.write("\nActivity and sanitized per-agent logs are uploaded as artifacts.\n")

def main():
    if not shutil.which("claude"):
        sys.exit("Claude Code CLI is not installed")
    if not os.getenv("ANTHROPIC_API_KEY") and not os.getenv("CLAUDE_CODE_OAUTH_TOKEN"):
        sys.exit("Missing approved Claude authentication")
    command(["git", "config", "user.name", "decupo-agent-bot"])
    command(["git", "config", "user.email", "decupo-agent-bot@users.noreply.github.com"])
    with tempfile.TemporaryDirectory(prefix="decupo-swarm-") as d:
        workspace = Path(d)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            jobs = [pool.submit(run_agent, name, scope, config, workspace)
                    for name, (scope, config) in AGENTS.items()]
            results = [job.result() for job in jobs]
        for r in results:
            if r["ok"]:
                try:
                    command(["git", "cherry-pick", r["commit"]])
                    event(r["agent"], "integrated", r["commit"][:12])
                except Exception as exc:
                    command(["git", "cherry-pick", "--abort"], check=False)
                    r["ok"] = False
                    r["error"] = f"Integration failed: {exc}"
                    event(r["agent"], "integration-failed", str(exc))
        write_dashboard(results)
        if not all(r["ok"] for r in results):
            sys.exit("One or more genuine agent runs failed; review artifacts")

if __name__ == "__main__":
    main()

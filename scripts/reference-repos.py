#!/usr/bin/env python3
"""Clone read-only reference checkouts and print evidence without running their code.

Usage: python3 scripts/reference-repos.py clone|snapshot|verify
Existing checkouts are never reset, cleaned, pulled, or otherwise modified.
The initial clone follows upstream HEAD; references.lock.json pins research revisions.
After a lock is present, new checkouts use its exact revision.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str, cwd: Path | None = None, timeout: int = 180) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, text=True,
                            capture_output=True, timeout=timeout, check=True)
    return result.stdout.strip()


def process(item: dict, action: str, pins: dict[str, str]) -> dict:
    name, repo = item["directory"], item["repo"]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise ValueError("Unsafe reference directory")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid GitHub repository")
    path = ROOT / "参考工程" / name
    url = f"https://github.com/{repo}.git"
    pin = pins.get(name)
    if action == "clone" and not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        if pin:
            if not re.fullmatch(r"[0-9a-f]{40}", pin):
                raise ValueError("Invalid pinned Git revision")
            git("init", str(path))
            git("remote", "add", "origin", url, cwd=path)
            git("fetch", "--depth=1", "origin", pin, cwd=path)
            git("checkout", "--detach", "FETCH_HEAD", cwd=path)
        else:
            git("clone", "--depth=1", "--single-branch", "--no-tags", url, str(path))
    if not (path / ".git").is_dir():
        raise ValueError(f"Missing checkout: {name}; run clone first")
    origin = git("remote", "get-url", "origin", cwd=path)
    if origin != url:
        raise ValueError(f"Origin mismatch for {name}: refusing to operate")
    head = git("rev-parse", "HEAD", cwd=path)
    dirty = bool(git("status", "--porcelain", cwd=path))
    if action == "verify" and (dirty or (pin and head != pin)):
        raise ValueError(f"Dirty checkout or revision mismatch: {name}")
    result = dict(item, url=url, commit=head,
                  commitDate=git("show", "-s", "--format=%cI", "HEAD", cwd=path),
                  subject=git("show", "-s", "--format=%s", "HEAD", cwd=path),
                  dirty=dirty)
    if action == "snapshot":
        response = subprocess.run(["gh", "api", "repos/" + repo],
                                  capture_output=True, text=True, timeout=40)
        if response.returncode == 0:
            data = json.loads(response.stdout)
            result["github"] = {key: data.get(key) for key in (
                "full_name", "default_branch", "created_at", "pushed_at",
                "archived", "stargazers_count", "size")}
            result["github"]["license"] = (data.get("license") or {}).get("spdx_id")
        else:
            result["metadataError"] = "GitHub metadata unavailable; checkout remains usable"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("clone", "snapshot", "verify"))
    args = parser.parse_args()
    items = json.loads((ROOT / "references.json").read_text())["repositories"]
    lock = ROOT / "references.lock.json"
    pins = ({x["directory"]: x["commit"]
             for x in json.loads(lock.read_text())["repositories"]}
            if lock.exists() else {})
    if args.action == "verify" and set(pins) != {x["directory"] for x in items}:
        print("Verification requires a complete references.lock.json", file=sys.stderr)
        return 1
    failed = False
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(process, item, args.action, pins): item for item in items}
        for job in concurrent.futures.as_completed(jobs):
            try:
                print(json.dumps(job.result(), ensure_ascii=False), flush=True)
            except (OSError, ValueError, subprocess.SubprocessError) as exc:
                failed = True
                print(json.dumps({"directory": jobs[job]["directory"],
                                  "error": str(exc)}, ensure_ascii=False),
                      file=sys.stderr, flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

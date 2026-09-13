#!/usr/bin/env python3
"""Validate the planning deliverable without installing or executing upstream code."""
from __future__ import annotations

import ast
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "AGENTS.md", "README.md", ".gitignore", "references.json",
    "references.lock.json", "docs/README.md",
    "docs/technical-proposal-2026-09-13.md",
    "docs/research-2026-09-13.md", "docs/acceptance-plan.md",
    "docs/delivery-status.md", "参考工程/README.md",
    "scripts/reference-repos.py", "scripts/validate-research.py",
]


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                          text=True, timeout=15)


def main() -> int:
    errors: list[str] = []
    for name in REQUIRED:
        path = ROOT / name
        if not path.is_file() or path.stat().st_size == 0:
            errors.append(f"Missing or empty: {name}")
    if errors:
        print("\n".join(errors))
        return 1

    manifest = json.loads((ROOT / "references.json").read_text())
    lock = json.loads((ROOT / "references.lock.json").read_text())
    items, pinned = manifest["repositories"], lock["repositories"]
    names = [x["directory"] for x in items]
    pins = {x["directory"]: x for x in pinned}
    if len(names) != len(set(names)) or len(pinned) != len(pins):
        errors.append("Duplicate reference directories")
    if set(names) != set(pins):
        errors.append("Reference manifest and lock disagree")

    for item in items:
        name = item["directory"]
        pin = pins.get(name, {})
        if pin.get("repo") != item["repo"]:
            errors.append(f"Repository mismatch: {name}")
        if not re.fullmatch(r"[0-9a-f]{40}", pin.get("commit", "")):
            errors.append(f"Invalid pinned revision: {name}")
        if not (ROOT / "参考工程" / name / ".git").is_dir():
            errors.append(f"Missing actual checkout: {name}")
        if run_git("check-ignore", "-q", f"参考工程/{name}/README.md").returncode != 0:
            errors.append(f"Reference checkout not ignored: {name}")

    if run_git("check-ignore", "-q", "参考工程/README.md").returncode == 0:
        errors.append("Reference guide must not be ignored")

    for path in (ROOT / "scripts").glob("*.py"):
        try:
            ast.parse(path.read_text(), filename=str(path.relative_to(ROOT)))
        except SyntaxError as exc:
            errors.append(f"Invalid Python syntax: {exc}")

    docs = [ROOT / "README.md", ROOT / "参考工程/README.md", *(ROOT / "docs").glob("*.md")]
    for path in docs:
        text = path.read_text()
        # Only normal Markdown links are checked; fenced examples are not file references.
        plain = re.sub(r"```.*?```", "", text, flags=re.S)
        for target in re.findall(r"\[[^\]]+\]\(([^\s)]+)\)", plain):
            parsed = urlsplit(target)
            if parsed.scheme or not parsed.path:
                continue
            destination = (path.parent / unquote(parsed.path)).resolve()
            if not destination.is_relative_to(ROOT) or not destination.exists():
                errors.append(f"Broken local link: {path.relative_to(ROOT)} -> {target}")

    tracked = run_git("ls-files", "--stage")
    if tracked.returncode != 0:
        errors.append("Cannot inspect Git index")
    elif any(line.startswith("160000 ") for line in tracked.stdout.splitlines()):
        errors.append("Unexpected Git submodule/gitlink in product repository")

    result = {
        "status": "FAIL" if errors else "PASS",
        "requiredFiles": len(REQUIRED), "referenceRepositories": len(items),
        "markdownFilesChecked": len(docs), "errors": errors,
        "scope": "Research documents and local reference setup only; not product validation",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

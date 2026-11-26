"""Cross-platform validation runner for groupctl (Windows & Linux).

Handles isolated git worktrees where node_modules is absent by temporarily
linking the main repository's node_modules (and cleaning it up in finally).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def _find_npm() -> str:
    npm = shutil.which("npm.cmd") if os.name == "nt" else shutil.which("npm")
    if npm:
        return npm
    npm = shutil.which("npm")
    if npm:
        return npm
    raise RuntimeError("npm executable not found in PATH")


def _find_main_repo_node_modules(repo_root: Path) -> Path | None:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return None

    common_dir = Path(proc.stdout.strip())
    if not common_dir.is_absolute():
        common_dir = (repo_root / common_dir).resolve()
    else:
        common_dir = common_dir.resolve()

    candidate = common_dir.parent / "node_modules"
    return candidate if candidate.is_dir() else None


def _link_node_modules(target: Path, link_path: Path) -> bool:
    if os.name == "nt":
        proc = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link_path), str(target)],
            capture_output=True,
            text=True,
        )
        return proc.returncode == 0
    try:
        os.symlink(target, link_path, target_is_directory=True)
        return True
    except OSError:
        return False


def _unlink_node_modules(link_path: Path) -> None:
    if not link_path.exists() and not link_path.is_symlink():
        return
    if os.name == "nt":
        subprocess.run(["cmd", "/c", "rmdir", str(link_path)], capture_output=True)
    else:
        link_path.unlink(missing_ok=True)


def _run_step(cmd: list[str], cwd: Path) -> int:
    print(f"[run_checks] Running: {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=cwd)
    return proc.returncode


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    npm = _find_npm()
    local_nm = repo_root / "node_modules"
    created_link = False

    try:
        if not local_nm.exists():
            shared_nm = _find_main_repo_node_modules(repo_root)
            if shared_nm and shared_nm.resolve() != local_nm.resolve():
                if _link_node_modules(shared_nm, local_nm):
                    created_link = True
                else:
                    rc = _run_step([npm, "ci", "--prefer-offline"], repo_root)
                    if rc != 0:
                        return rc
            else:
                rc = _run_step([npm, "ci", "--prefer-offline"], repo_root)
                if rc != 0:
                    return rc

        for step in (
            [npm, "run", "typecheck"],
            [npm, "test"],
            [npm, "run", "build"],
        ):
            rc = _run_step(step, repo_root)
            if rc != 0:
                return rc
        return 0
    finally:
        if created_link:
            _unlink_node_modules(local_nm)


if __name__ == "__main__":
    sys.exit(main())

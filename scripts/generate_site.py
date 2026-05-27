#!/usr/bin/env python3
"""generate_site.py — Structured wrapper for site generation

This script provides a clearer CLI around the existing `scripts/aggiorna.py`
generator. It imports the legacy script as a module and calls its `main()`
function so you can call generation programmatically or from cron/CI.

Usage:
  python scripts/generate_site.py [--dry-run]

Notes:
  - This wrapper intentionally delegates the heavy lifting to
    `scripts/aggiorna.py` to preserve current behaviour while giving a
    clearer entrypoint name.
"""
import argparse
import importlib.util
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parent.parent
LEGACY = REPO / "scripts" / "aggiorna.py"


def load_legacy_module(path: Path):
    spec = importlib.util.spec_from_file_location("aggiorna_module", str(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description="Generate site data (wrapper)")
    parser.add_argument("--dry-run", action="store_true", help="Do not write files, print output")
    args = parser.parse_args()

    if not LEGACY.exists():
        print(f"Legacy generator not found at {LEGACY}")
        sys.exit(1)

    mod = load_legacy_module(LEGACY)
    # The legacy script exposes a main() function — call it.
    # It reads sys.argv for --dry-run, so set that if requested.
    if args.dry_run:
        sys_argv_backup = sys.argv
        try:
            sys.argv = [str(LEGACY), "--dry-run"]
            mod.main()
        finally:
            sys.argv = sys_argv_backup
    else:
        mod.main()


if __name__ == "__main__":
    main()

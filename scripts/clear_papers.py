#!/usr/bin/env python3
"""
Clear all collected papers from the database.
Use when you need to reset and fix loading issues (e.g. schema mismatch, corrupted data).

Usage:
    python scripts/clear_papers.py           # dry-run, show what would be deleted
    python scripts/clear_papers.py --yes     # actually delete
"""

from __future__ import annotations

import argparse
import os
import sys

# Ensure project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite:///./data/papermind.db")

from sqlalchemy import text

from packages.storage.db import session_scope


def get_counts(session) -> dict[str, int]:
    """Get row counts for paper-related tables."""
    tables = [
        "papers",
        "paper_topics",
        "action_papers",
        "analysis_reports",
        "image_analyses",
        "citations",
        "notes",
        "pipeline_runs",
        "generated_contents",
    ]
    counts = {}
    for t in tables:
        try:
            r = session.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar_one()
            counts[t] = r
        except Exception:
            counts[t] = 0
    return counts


def clear_papers(session, dry_run: bool) -> None:
    """Delete all papers and related data in correct order."""
    # Order: child tables first (those with FK to papers), then papers
    tables_to_clear = [
        "action_papers",
        "paper_topics",
        "analysis_reports",
        "image_analyses",
        "notes",
        "citations",
    ]
    for table in tables_to_clear:
        if dry_run:
            r = session.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
            print(f"  Would delete {r} rows from {table}")
        else:
            session.execute(text(f"DELETE FROM {table}"))
            print(f"  Deleted from {table}")

    # pipeline_runs, generated_contents, agent_pending_actions: SET NULL on paper delete
    for t in ["pipeline_runs", "generated_contents", "agent_pending_actions"]:
        if dry_run:
            r = session.execute(text(f"SELECT COUNT(*) FROM {t} WHERE paper_id IS NOT NULL")).scalar_one()
            print(f"  Would set paper_id=NULL for {r} rows in {t}")
        else:
            session.execute(text(f"UPDATE {t} SET paper_id = NULL WHERE paper_id IS NOT NULL"))

    # Finally delete papers
    if dry_run:
        r = session.execute(text("SELECT COUNT(*) FROM papers")).scalar_one()
        print(f"  Would delete {r} rows from papers")
    else:
        session.execute(text("DELETE FROM papers"))
        print("  Deleted from papers")

    if not dry_run:
        session.commit()
        print("Done. Database cleared.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Clear all collected papers from database")
    parser.add_argument("--yes", action="store_true", help="Actually perform deletion (default: dry-run)")
    args = parser.parse_args()

    dry_run = not args.yes
    if dry_run:
        print("DRY RUN - no changes will be made. Use --yes to actually delete.\n")

    with session_scope() as session:
        counts = get_counts(session)
        print("Current counts:")
        for k, v in counts.items():
            print(f"  {k}: {v}")
        print()

        if counts["papers"] == 0:
            print("No papers in database. Nothing to do.")
            return

        clear_papers(session, dry_run)


if __name__ == "__main__":
    main()

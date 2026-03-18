#!/usr/bin/env python3
"""
Seed Clara's 7 research topics into PaperMind topic_subscriptions.

Usage:
    cd /path/to/PaperMind
    .venv/bin/python scripts/seed_clara_topics.py
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import os
os.environ.setdefault("DATABASE_URL", "sqlite:///./data/papermind.db")

TOPICS = [
    {
        "name": "Reinforcement Learning",
        "query": "abs:reinforcement AND abs:learning",
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
    {
        "name": "LLM Agent",
        "query": "abs:agent AND (abs:language OR abs:LLM)",
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
    {
        "name": "Benchmark & Evaluation",
        "query": "abs:benchmark AND (abs:language OR abs:agent OR abs:reasoning)",
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
    {
        "name": "World Models",
        "query": "abs:world AND abs:model AND (abs:learning OR abs:planning)",
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
    {
        "name": "Agentic Reasoning",
        "query": "abs:reasoning AND (abs:agent OR abs:language OR abs:planning)",
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
    {
        "name": "LLM Post-Training",
        "query": "(abs:post-training OR abs:alignment OR abs:fine-tuning) AND abs:language",
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
    {
        "name": "In-Context Learning",
        "query": 'abs:"in-context learning" OR abs:ICL AND abs:language',
        "max_results_per_run": 15,
        "enable_date_filter": True,
        "date_filter_days": 2,
        "schedule_frequency": "daily",
        "schedule_time_utc": 2,
    },
]


def main():
    os.chdir(PROJECT_ROOT)

    from packages.storage.db import session_scope
    from packages.storage.repositories import TopicRepository

    with session_scope() as session:
        repo = TopicRepository(session)
        for t in TOPICS:
            topic = repo.upsert_topic(
                name=t["name"],
                query=t["query"],
                enabled=True,
                max_results_per_run=t["max_results_per_run"],
                retry_limit=2,
                schedule_frequency=t["schedule_frequency"],
                schedule_time_utc=t["schedule_time_utc"],
                enable_date_filter=t["enable_date_filter"],
                date_filter_days=t["date_filter_days"],
            )
            print(f"  + {topic.name}  (id={topic.id[:8]}...)")

    print(f"\nDone — {len(TOPICS)} topics seeded.")


if __name__ == "__main__":
    main()

"""
HuggingFace Daily Papers (Trending) client.

Scrapes https://huggingface.co/papers for today's trending paper IDs,
then fetches metadata via the HF papers API.  Returns PaperCreate objects
compatible with PaperLens's ingest pipeline.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date

import httpx

from packages.domain.schemas import PaperCreate

logger = logging.getLogger(__name__)

HF_PAPERS_URL = "https://huggingface.co/papers"
HF_API_URL = "https://huggingface.co/api/papers"


class HFTrendingClient:
    def __init__(self, min_upvotes: int = 8, max_papers: int = 30) -> None:
        self.min_upvotes = min_upvotes
        self.max_papers = max_papers
        self._client: httpx.Client | None = None

    @property
    def client(self) -> httpx.Client:
        if self._client is None or self._client.is_closed:
            self._client = httpx.Client(
                timeout=30,
                follow_redirects=True,
                headers={"User-Agent": "PaperLens/1.0"},
            )
        return self._client

    def fetch_trending(self) -> list[PaperCreate]:
        """Return trending HF papers as PaperCreate objects, sorted by upvotes desc."""
        paper_ids = self._scrape_ids()
        if not paper_ids:
            return []

        papers: list[PaperCreate] = []
        for pid in paper_ids[: self.max_papers]:
            try:
                pc = self._fetch_detail(pid)
                if pc is not None:
                    papers.append(pc)
            except Exception as exc:
                logger.debug("HF detail fetch failed for %s: %s", pid, exc)
            time.sleep(0.3)

        papers.sort(
            key=lambda p: (p.metadata or {}).get("upvotes", 0), reverse=True
        )

        if self.min_upvotes > 0:
            papers = [
                p
                for p in papers
                if (p.metadata or {}).get("upvotes", 0) >= self.min_upvotes
            ]

        logger.info(
            "HF trending: %d papers (min_upvotes=%d)", len(papers), self.min_upvotes
        )
        return papers

    def _scrape_ids(self) -> list[str]:
        """Scrape arxiv IDs from the HF daily papers page."""
        try:
            resp = self.client.get(HF_PAPERS_URL)
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("HF papers page fetch failed: %s", exc)
            return []
        return list(set(re.findall(r'href="/papers/([0-9]+\.[0-9]+)"', resp.text)))

    def _fetch_detail(self, arxiv_id: str) -> PaperCreate | None:
        resp = self.client.get(f"{HF_API_URL}/{arxiv_id}")
        resp.raise_for_status()
        data = resp.json()
        title = data.get("title", "").strip()
        if not title:
            return None

        authors: list[str] = []
        raw_authors = data.get("authors", [])
        if isinstance(raw_authors, list):
            for a in raw_authors[:8]:
                name = a.get("name", "") if isinstance(a, dict) else str(a)
                if name:
                    authors.append(name)

        return PaperCreate(
            arxiv_id=arxiv_id,
            title=title[:512],
            abstract=(data.get("summary") or "")[:4000],
            publication_date=date.today(),
            metadata={
                "source": "hf_trending",
                "upvotes": data.get("upvotes", 0),
                "authors": authors,
                "hf_url": f"https://huggingface.co/papers/{arxiv_id}",
            },
        )

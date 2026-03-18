"""
基于收藏论文的兴趣分析与主题推荐服务
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from packages.ai.prompts import build_interest_analysis_prompt
from packages.integrations.arxiv_client import ArxivClient
from packages.integrations.llm_client import LLMClient
from packages.storage.db import session_scope
from packages.storage.repositories import (
    GeneratedContentRepository,
    PaperRepository,
    TopicRepository,
)
from packages.storage.models import Paper

logger = logging.getLogger(__name__)

_MIN_FAVORITES = 3


class InterestAnalyzer:
    """分析用户收藏论文 → 推荐新主题订阅"""

    def __init__(self) -> None:
        self.llm = LLMClient()
        self.arxiv = ArxivClient()

    def analyze_favorites(self, *, progress_callback=None) -> dict:
        """
        主流程：
        1. 加载收藏论文 + 已有主题
        2. LLM 分析兴趣空白
        3. arXiv 预搜索每个建议
        4. 存入 generated_contents
        """

        def _progress(msg: str, cur: int, total: int = 100):
            if progress_callback:
                progress_callback(msg, cur, total)

        _progress("加载收藏论文...", 5)
        favorites_data = self._load_favorites()
        if len(favorites_data) < _MIN_FAVORITES:
            return {
                "status": "insufficient",
                "message": f"收藏论文不足 {_MIN_FAVORITES} 篇，无法分析",
                "favorite_count": len(favorites_data),
                "interests": [],
                "suggestions": [],
            }

        _progress("加载已有主题...", 10)
        existing_topics = self._load_existing_topics()

        _progress("LLM 分析兴趣...", 20)
        analysis = self._llm_analyze(favorites_data, existing_topics)
        if not analysis:
            return {
                "status": "error",
                "message": "LLM 分析失败",
                "favorite_count": len(favorites_data),
                "interests": [],
                "suggestions": [],
            }

        suggestions = analysis.get("suggestions", [])
        interests = analysis.get("interests", [])

        _progress(f"搜索预览论文 ({len(suggestions)} 个方向)...", 50)
        for i, s in enumerate(suggestions):
            query = s.get("query", "")
            if not query:
                s["preview_papers"] = []
                continue
            try:
                papers = self.arxiv.fetch_latest(query, max_results=3, days_back=30)
                s["preview_papers"] = [
                    {
                        "title": p.title,
                        "arxiv_id": p.arxiv_id,
                        "abstract": (p.abstract or "")[:200],
                    }
                    for p in papers[:3]
                ]
            except Exception:
                logger.warning("arXiv preview search failed for query: %s", query)
                s["preview_papers"] = []
            _progress(f"搜索预览 {i + 1}/{len(suggestions)}...", 50 + int(40 * (i + 1) / max(len(suggestions), 1)))

        result = {
            "status": "ok",
            "favorite_count": len(favorites_data),
            "interests": interests,
            "suggestions": suggestions,
            "analyzed_at": datetime.now(UTC).isoformat(),
        }

        _progress("保存结果...", 95)
        self._save_result(result)

        _progress("完成", 100)
        return result

    def _load_favorites(self) -> list[dict]:
        with session_scope() as session:
            repo = PaperRepository(session)
            from sqlalchemy import select
            q = (
                select(Paper)
                .where(Paper.favorited == True)  # noqa: E712
                .order_by(Paper.created_at.desc())
                .limit(100)
            )
            papers = list(session.scalars(q).all())
            return [
                {
                    "title": p.title,
                    "abstract": (p.abstract or "")[:300],
                    "keywords": (p.metadata_json or {}).get("keywords", []),
                    "categories": (p.metadata_json or {}).get("categories", []),
                }
                for p in papers
            ]

    def _load_existing_topics(self) -> list[dict]:
        with session_scope() as session:
            topics = TopicRepository(session).list_topics(enabled_only=False)
            return [
                {"name": t.name, "query": t.query}
                for t in topics
            ]

    def _llm_analyze(self, favorites: list[dict], topics: list[dict]) -> dict | None:
        fav_lines = []
        for i, f in enumerate(favorites, 1):
            kw = ", ".join(f["keywords"][:5]) if f["keywords"] else "N/A"
            fav_lines.append(f"[P{i}] {f['title']}\n  Keywords: {kw}\n  Abstract: {f['abstract']}")
        favorites_info = "\n\n".join(fav_lines)

        if topics:
            topic_lines = [f"- {t['name']} (query: {t['query']})" for t in topics]
            existing_topics = "\n".join(topic_lines)
        else:
            existing_topics = "(No existing topics)"

        prompt = build_interest_analysis_prompt(favorites_info, existing_topics)
        result = self.llm.complete_json(prompt, stage="interest_analysis", max_tokens=4096)
        self.llm.trace_result(
            result,
            stage="interest_analysis",
            prompt_digest=f"interest_analysis:{len(favorites)}_favs",
        )

        parsed = result.parsed_json
        if not isinstance(parsed, dict):
            logger.warning("Interest analysis LLM returned non-dict: %s", type(parsed))
            return None

        sug_list = parsed.get("suggestions", [])
        if isinstance(sug_list, list):
            for s in sug_list:
                if isinstance(s, dict):
                    s.setdefault("confidence", 0.5)
                    s.setdefault("preview_papers", [])
        return parsed

    def _save_result(self, result: dict) -> None:
        md_parts = [f"# 兴趣分析报告\n\n分析时间: {result.get('analyzed_at', '')}\n收藏论文数: {result['favorite_count']}\n"]
        if result.get("interests"):
            md_parts.append("## 识别到的兴趣方向\n")
            for interest in result["interests"]:
                md_parts.append(f"- {interest}")
            md_parts.append("")
        if result.get("suggestions"):
            md_parts.append("## 主题推荐\n")
            for s in result["suggestions"]:
                conf = s.get("confidence", 0)
                md_parts.append(f"### {s.get('name', '?')} (置信度: {conf:.0%})")
                md_parts.append(f"- 查询: `{s.get('query', '')}`")
                md_parts.append(f"- 理由: {s.get('reason', '')}")
                previews = s.get("preview_papers", [])
                if previews:
                    md_parts.append("- 预览论文:")
                    for p in previews:
                        md_parts.append(f"  - {p.get('title', '')} ({p.get('arxiv_id', '')})")
                md_parts.append("")

        markdown = "\n".join(md_parts)
        with session_scope() as session:
            repo = GeneratedContentRepository(session)
            repo.create(
                content_type="interest_suggestion",
                title="兴趣分析报告",
                markdown=markdown,
                metadata_json=result,
            )

    def get_latest_suggestions(self) -> dict | None:
        """获取最新一次分析结果"""
        with session_scope() as session:
            repo = GeneratedContentRepository(session)
            items = repo.list_by_type("interest_suggestion", limit=1)
            if not items:
                return None
            gc = items[0]
            meta = gc.metadata_json or {}
            return {
                "interests": meta.get("interests", []),
                "suggestions": meta.get("suggestions", []),
                "analyzed_at": meta.get("analyzed_at", gc.created_at.isoformat() if gc.created_at else ""),
                "favorite_count": meta.get("favorite_count", 0),
                "content_id": gc.id,
            }

    def has_new_favorites_since_last(self) -> tuple[bool, int]:
        """检查上次分析后是否有新收藏，返回 (有新收藏, 总收藏数)"""
        last = self.get_latest_suggestions()
        last_at = None
        if last and last.get("analyzed_at"):
            try:
                last_at = datetime.fromisoformat(last["analyzed_at"])
            except (ValueError, TypeError):
                pass

        with session_scope() as session:
            from sqlalchemy import select, func
            total = session.scalar(
                select(func.count()).select_from(Paper).where(Paper.favorited == True)  # noqa: E712
            ) or 0

            if last_at is None:
                return (total >= _MIN_FAVORITES, total)

            new_count = session.scalar(
                select(func.count()).select_from(Paper).where(
                    Paper.favorited == True,  # noqa: E712
                    Paper.updated_at > last_at,
                )
            ) or 0

            return (new_count >= 3, total)

"""
PDF 视觉解析器 — MinerU 优先，PyMuPDF 兜底

MinerU (pip install mineru) 提供结构化解析：
  - 自动识别 figure / table / formula
  - 提取图片到独立目录
  - 输出 Markdown + content_list JSON

如果 MinerU 未安装，退化为 PyMuPDF 逐页文本提取。
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_MINERU_CACHE_DIR = Path("data/.mineru_cache")


def _cache_key(pdf_path: str) -> str:
    return hashlib.md5(Path(pdf_path).resolve().as_posix().encode()).hexdigest()[:16]


class VisionPdfReader:
    """
    Extracts structured page descriptions from a PDF.

    Priority: MinerU CLI → PyMuPDF text → stub.
    """

    def extract_page_descriptions(self, pdf_path: str, max_pages: int = 12) -> str:
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"pdf not found: {pdf_path}")

        result = self._try_mineru(path)
        if result:
            return result

        result = self._try_pymupdf(path, max_pages)
        if result:
            return result

        return f"PDF parser unavailable for {path.name}; install mineru or pymupdf."

    def get_figures_info(self, pdf_path: str) -> list[dict]:
        """Return list of extracted figure metadata (path, type, caption)."""
        cache_dir = _MINERU_CACHE_DIR / _cache_key(pdf_path)
        content_list_files = list(cache_dir.glob("*_content_list.json"))
        if not content_list_files:
            return []

        figures: list[dict] = []
        try:
            with open(content_list_files[0], "r", encoding="utf-8") as f:
                content_list = json.load(f)
            for item in content_list:
                cat = item.get("type", "")
                if cat in ("image", "table"):
                    figures.append({
                        "type": cat,
                        "img_path": item.get("img_path", ""),
                        "caption": (
                            item.get("img_caption", "")
                            or item.get("table_caption", "")
                        ),
                    })
        except Exception as exc:
            logger.debug("Failed to parse MinerU content list: %s", exc)

        return figures

    # ------------------------------------------------------------------

    def _try_mineru(self, path: Path) -> str | None:
        if not shutil.which("mineru"):
            logger.debug("mineru CLI not found, skipping")
            return None

        cache_dir = _MINERU_CACHE_DIR / _cache_key(str(path))

        md_files = list(cache_dir.glob("*.md")) if cache_dir.exists() else []
        if md_files:
            logger.info("MinerU cache hit: %s", cache_dir)
            return self._read_mineru_output(cache_dir)

        cache_dir.mkdir(parents=True, exist_ok=True)

        try:
            logger.info("Running MinerU on %s ...", path.name)
            proc = subprocess.run(
                ["mineru", "-p", str(path), "-o", str(cache_dir)],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if proc.returncode != 0:
                logger.warning("MinerU failed (rc=%d): %s", proc.returncode, proc.stderr[:500])
                return None

            return self._read_mineru_output(cache_dir)

        except FileNotFoundError:
            logger.debug("mineru binary not available")
            return None
        except subprocess.TimeoutExpired:
            logger.warning("MinerU timed out for %s", path.name)
            return None
        except Exception as exc:
            logger.warning("MinerU error: %s", exc)
            return None

    @staticmethod
    def _read_mineru_output(cache_dir: Path) -> str | None:
        """Read MinerU output: markdown file + content_list JSON for figure metadata."""
        md_files = sorted(cache_dir.rglob("*.md"), key=lambda p: p.stat().st_size, reverse=True)
        if not md_files:
            return None

        md_text = md_files[0].read_text(encoding="utf-8", errors="replace")

        content_list_files = list(cache_dir.rglob("*_content_list.json"))
        figure_section = ""
        if content_list_files:
            try:
                with open(content_list_files[0], "r", encoding="utf-8") as f:
                    content_list = json.load(f)

                fig_items = []
                for item in content_list:
                    cat = item.get("type", "")
                    if cat in ("image", "table"):
                        caption = (
                            item.get("img_caption", "")
                            or item.get("table_caption", "")
                            or "no caption"
                        )
                        fig_items.append(f"- [{cat.upper()}] {caption}")

                if fig_items:
                    figure_section = (
                        "\n\n[Extracted Figures & Tables]\n" + "\n".join(fig_items)
                    )
            except Exception:
                pass

        combined = md_text[:20000] + figure_section
        return combined if combined.strip() else None

    @staticmethod
    def _try_pymupdf(path: Path, max_pages: int) -> str | None:
        try:
            import fitz  # type: ignore
        except ImportError:
            return None

        try:
            doc = fitz.open(str(path))
            chunks: list[str] = []
            for i in range(min(max_pages, len(doc))):
                page = doc.load_page(i)
                text = page.get_text("text").strip()
                if text:
                    chunks.append(f"[Page {i + 1}]\n{text[:3000]}")
            doc.close()
            return "\n\n".join(chunks)[:20000] if chunks else None
        except Exception as exc:
            logger.warning("PyMuPDF extraction failed: %s", exc)
            return None

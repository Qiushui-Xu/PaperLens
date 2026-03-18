"""
PDF 文本提取器 — 复用 MinerU 缓存，PyMuPDF 兜底

如果 VisionPdfReader 已经用 MinerU 解析过同一 PDF，
直接读取缓存的 markdown，避免重复解析。
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class PdfTextExtractor:
    """
    Text extraction from PDF.
    Priority: MinerU cached markdown → PyMuPDF → stub.
    """

    def extract_text(self, pdf_path: str, max_pages: int = 15) -> str:
        path = Path(pdf_path)
        if not path.exists():
            return ""

        result = self._try_mineru_cache(path)
        if result:
            return result

        return self._try_pymupdf(path, max_pages)

    @staticmethod
    def _try_mineru_cache(path: Path) -> str | None:
        from packages.ai.vision_reader import _MINERU_CACHE_DIR, _cache_key

        cache_dir = _MINERU_CACHE_DIR / _cache_key(str(path))
        if not cache_dir.exists():
            return None

        md_files = sorted(cache_dir.rglob("*.md"), key=lambda p: p.stat().st_size, reverse=True)
        if not md_files:
            return None

        text = md_files[0].read_text(encoding="utf-8", errors="replace")
        return text[:20000] if text.strip() else None

    @staticmethod
    def _try_pymupdf(path: Path, max_pages: int) -> str:
        try:
            import fitz  # type: ignore

            doc = fitz.open(str(path))
            chunks: list[str] = []
            for i in range(min(max_pages, len(doc))):
                text = doc.load_page(i).get_text("text").strip()
                if text:
                    chunks.append(text[:3000])
            doc.close()
            return "\n\n".join(chunks)[:20000]
        except ImportError:
            return f"PDF text extraction unavailable for {path.name}; install pymupdf or mineru."
        except Exception as exc:
            logger.warning("PyMuPDF extraction failed: %s", exc)
            return ""

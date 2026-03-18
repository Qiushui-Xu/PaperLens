"""笔记管理路由 — 论文级高亮/想法 + 主题级笔记"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from packages.storage.db import session_scope
from packages.storage.repositories import NoteRepository

router = APIRouter()


class NoteCreateBody(BaseModel):
    note_type: str = "idea"
    content: str = ""
    source_text: str = ""
    page_number: int | None = None


class NoteUpdateBody(BaseModel):
    content: str


@router.get("/papers/{paper_id}/notes")
def list_paper_notes(paper_id: str) -> dict:
    with session_scope() as session:
        repo = NoteRepository(session)
        notes = repo.list_by_paper(paper_id)
        return {"items": [repo._to_dict(n) for n in notes]}


@router.post("/papers/{paper_id}/notes")
def create_paper_note(paper_id: str, body: NoteCreateBody) -> dict:
    with session_scope() as session:
        repo = NoteRepository(session)
        note = repo.create(
            paper_id=paper_id,
            note_type=body.note_type,
            content=body.content,
            source_text=body.source_text,
            page_number=body.page_number,
        )
        return repo._to_dict(note)


@router.patch("/notes/{note_id}")
def update_note(note_id: str, body: NoteUpdateBody) -> dict:
    with session_scope() as session:
        repo = NoteRepository(session)
        note = repo.update(note_id, body.content)
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        return repo._to_dict(note)


@router.delete("/notes/{note_id}")
def delete_note(note_id: str) -> dict:
    with session_scope() as session:
        repo = NoteRepository(session)
        ok = repo.delete(note_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"deleted": note_id}


@router.get("/topics/{topic_id}/notes")
def list_topic_notes(topic_id: str) -> dict:
    with session_scope() as session:
        repo = NoteRepository(session)
        return repo.list_by_topic(topic_id)


@router.post("/topics/{topic_id}/notes")
def create_topic_note(topic_id: str, body: NoteCreateBody) -> dict:
    with session_scope() as session:
        repo = NoteRepository(session)
        note = repo.create(
            topic_id=topic_id,
            note_type="topic_note",
            content=body.content,
        )
        return repo._to_dict(note)

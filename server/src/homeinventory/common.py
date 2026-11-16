"""Helpers the API routers share."""

from fastapi import HTTPException, Response, status
from sqlalchemy.orm import Session

NO_CONTENT = {"status_code": status.HTTP_204_NO_CONTENT, "response_class": Response}


def get_or_404(session: Session, model, id: int):
    row = session.get(model, id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return row


def conflict(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail)

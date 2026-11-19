"""substitutes both ways

Revision ID: 0fd08ebefd06
Revises: 7885528f7451
Create Date: 2026-11-19 14:04:05.232966

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0fd08ebefd06"
down_revision: str | Sequence[str] | None = "7885528f7451"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Substitutes became a pair: each one set so far stands in the other way too.
    op.execute(
        "INSERT OR IGNORE INTO item_substitutes (item_id, substitute_id)"
        " SELECT substitute_id, item_id FROM item_substitutes"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Both ways stay: the one-way rows can't be told from the added ones.

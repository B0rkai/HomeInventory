"""families short in the whole house

A family (or the variants of an item where any will do) goes on the list only once every
member is short wherever it's kept; it used to be per place. Lines open for a family that
isn't short in the whole house any more are cancelled, by nobody.

Revision ID: 7b0ced3d3a6f
Revises: 15dcfdd3631b
Create Date: 2026-11-21 11:07:33.810278

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b0ced3d3a6f"
down_revision: str | Sequence[str] | None = "15dcfdd3631b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "UPDATE requests SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP"
        " WHERE kind = 'buy' AND status IN ('open', 'claimed') AND location_id IS NOT NULL"
        " AND cooking_id IS NULL"
        " AND item_id IN (SELECT id FROM items WHERE family IS NOT NULL)"
        " AND EXISTS (SELECT 1 FROM stock s JOIN items m ON m.id = s.item_id"
        " JOIN items i ON i.id = requests.item_id"
        " WHERE m.family = i.family AND s.level NOT IN ('low', 'out'))"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # The cancelled lines stay cancelled; the next level change sorts out the list.

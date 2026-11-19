"""variants will do as a family

Revision ID: 463bc03c0939
Revises: a48877ded1c0
Create Date: 2026-11-19 17:54:17.330099

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "463bc03c0939"
down_revision: str | Sequence[str] | None = "a48877ded1c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Any variant will do: a family named after the item. One already in a family stays in
    # it (the family covers its variants already).
    op.execute("UPDATE items SET family = name WHERE any_variant = 1 AND family IS NULL")
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_column("any_variant")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("any_variant", sa.Boolean(), server_default=sa.text("0"), nullable=False)
        )
    op.execute("UPDATE items SET any_variant = 1, family = NULL WHERE family = name")

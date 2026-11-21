"""How long items keep: an item's own shelf life, else its group's (docs/features.md,
Groups). Planned cookings buy fresh food no earlier than that (cooking_lines.py)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from homeinventory.icons import hue_of, item_icon
from homeinventory.models import Item, ItemGroup


class ShelfLife:
    """How long items keep, from their own setting or their group's; the groups read once.

    An item's group is the one chosen, else its icon's (a subgroup listing the icon, in list
    order, else the group of the icon's colour), as the web client tells it (groups.ts).
    """

    def __init__(self, session: Session) -> None:
        groups = list(session.scalars(select(ItemGroup)))
        self.by_id = {group.id: group for group in groups}

        def order(of: int | None) -> list[ItemGroup]:
            return sorted(
                (g for g in groups if g.parent_id == of), key=lambda g: (g.position, g.id)
            )

        self.ordered = [g for top in order(None) for g in [top, *order(top.id)]]

    def group_of(self, item: Item) -> ItemGroup | None:
        if item.group_id is not None and item.group_id in self.by_id:
            return self.by_id[item.group_id]
        icon = item_icon(item.name, item.icon)
        if not icon:
            return None
        return next(
            (g for g in self.ordered if g.parent_id is not None and icon in g.icons),
            next((g for g in self.ordered if g.parent_id is None and g.hue == hue_of(icon)), None),
        )

    def keeps_days(self, item: Item) -> int | None:
        """How many days the item keeps; None for any time."""
        if item.keeps_days is not None:
            return item.keeps_days
        if item.keeps_any_time:
            return None
        group = self.group_of(item)
        return group and group.keeps_days

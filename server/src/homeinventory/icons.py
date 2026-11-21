"""The icon an item's name suggests, as the web client guesses it (web/src/icons.ts).

The table is data both read (seed/item_icons.json); the server needs the guess to tell an
item's subgroup when none is chosen, for its shelf life. The matching here must stay the
client's: keywords of up to 3 letters are whole words ("só" isn't "sör"), 4 letters start a
word, longer ones match anywhere ("kockacukor"); the first matching entry wins, and an
empty icon stops a word from matching a shorter keyword further down.
"""

import json
import re
import unicodedata
from functools import cache
from pathlib import Path

ITEM_ICONS = Path(__file__).parent / "seed" / "item_icons.json"


@cache
def _table() -> list[tuple[str, str, list[str]]]:
    entries = json.loads(ITEM_ICONS.read_text(encoding="utf-8"))
    return [
        (entry["icon"], entry["hue"], [_normalize(k) for k in entry["keywords"]])
        for entry in entries
    ]


def _normalize(text: str) -> str:
    """Without accents or case, words split by single spaces."""
    bare = "".join(
        char
        for char in unicodedata.normalize("NFD", text)
        if not unicodedata.category(char).startswith("M")
    )
    return re.sub(r"[^a-z0-9]+", " ", bare.lower()).strip()


def _matches(name: str, keyword: str) -> bool:
    if len(keyword) <= 3:
        return f" {keyword} " in f" {name} "
    if len(keyword) == 4:
        return f" {keyword}" in f" {name}"
    return keyword in name


def guess_icon(name: str) -> str:
    """The icon the item's name suggests; empty for none."""
    normalized = _normalize(name)
    for icon, _, keywords in _table():
        if any(_matches(normalized, keyword) for keyword in keywords):
            return icon
    return ""


def item_icon(name: str, icon: str | None) -> str:
    """The icon an item shows: the one chosen, else the guess; empty for none."""
    return guess_icon(name) if icon is None else icon


def hue_of(icon: str) -> str | None:
    """An icon's colour in the table; none for no icon, the neutral one for an unknown."""
    if not icon:
        return None
    return next((hue for key, hue, _ in _table() if key == icon), "home")

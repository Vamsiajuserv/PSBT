"""Gold & silver: which metal a category is.

The daily Gold & Silver Rate was removed on 2026-11-15 (client decision): gold and silver are kept
by grams and description only. Purity was removed everywhere on 2026-11-20 (client): it is not
asked, kept or used in any rule. Old rates stay in the `metal_rates` table and old purities in
their columns; nothing reads them any more.
"""


def metal_of(name: str | None) -> str | None:
    """Gold / Silver from a donation category or hundi item type ("GOLD", "Silver coins" …)."""
    n = (name or "").lower()
    return "Gold" if "gold" in n else "Silver" if "silver" in n else None

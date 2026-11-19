"""Recipes: what a dish takes, by catalogue item, for the meal planner (docs/features.md).

An ingredient is named, not picked by id: a name the catalogue doesn't have yet becomes an
item kept nowhere (and not restocked), so a recipe can be typed in before anything is
bought for it. An ingredient can also be another recipe, a part ("Nokedli"), as long as
no recipe ends up taking itself.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from homeinventory.common import NO_CONTENT, announce_changes, conflict, get_or_404
from homeinventory.db import get_session
from homeinventory.identity import current_user
from homeinventory.models import Item, Recipe, RecipeIngredient, RecipeKind
from homeinventory.schemas import IngredientIn, RecipeCreate, RecipeOut, RecipeUpdate

router = APIRouter(dependencies=[Depends(current_user), Depends(announce_changes)])


def _check_name(session: Session, name: str, own_id: int | None = None) -> None:
    folded = name.casefold()
    if any(
        recipe.name.casefold() == folded and recipe.id != own_id
        for recipe in session.scalars(select(Recipe))
    ):
        raise conflict("A recipe with this name already exists")


def _item_for(session: Session, items: list[Item], wanted: IngredientIn) -> Item:
    """The catalogue item an ingredient names; a new one if there's none. For any variant,
    the name's item without a variant, else its first variant."""
    name = wanted.name.casefold()
    same_name = sorted(
        (item for item in items if item.name.casefold() == name),
        key=lambda item: (item.variant is not None, (item.variant or "").casefold()),
    )
    if wanted.any_variant and same_name:
        return same_name[0]
    variant = None if wanted.any_variant else wanted.variant
    for item in same_name:
        if (item.variant or "").casefold() == (variant or "").casefold():
            return item
    # Kept nowhere, so not restocked (as an item taken off its last place).
    item = Item(name=same_name[0].name if same_name else wanted.name, variant=variant)
    item.restock = False
    item.any_variant = any(other.any_variant for other in same_name)
    session.add(item)
    session.flush()
    items.append(item)
    return item


def _takes(part: Recipe, recipe_id: int) -> bool:
    """Whether `part` is the recipe, or takes it, through its parts' parts too."""
    if part.id == recipe_id:
        return True
    return any(
        ingredient.part_id is not None and _takes(ingredient.part, recipe_id)
        for ingredient in part.ingredients
    )


def _part_for(session: Session, recipe: Recipe, wanted: IngredientIn) -> Recipe:
    name = wanted.name.casefold()
    part = next(
        (other for other in session.scalars(select(Recipe)) if other.name.casefold() == name),
        None,
    )
    if part is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "No such recipe")
    if part.kind == RecipeKind.MENU:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A menu is no ingredient")
    if _takes(part, recipe.id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A recipe can't take itself")
    return part


def _set_ingredients(session: Session, recipe: Recipe, wanted: list[IngredientIn]) -> None:
    items = list(session.scalars(select(Item)))
    ingredients: list[RecipeIngredient] = []
    for position, ingredient in enumerate(wanted):
        if ingredient.recipe:
            target = {"part_id": _part_for(session, recipe, ingredient).id}
        else:
            target = {"item_id": _item_for(session, items, ingredient).id}
        if any(
            (i.item_id, i.part_id) == (target.get("item_id"), target.get("part_id"))
            for i in ingredients
        ):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "An ingredient is listed twice"
            )
        ingredients.append(
            RecipeIngredient(
                **target,
                any_variant=ingredient.any_variant,
                amount=ingredient.amount,
                optional=ingredient.optional,
                position=position,
            )
        )
    recipe.ingredients = ingredients


@router.get("/recipes")
def list_recipes(session: Session = Depends(get_session)) -> list[RecipeOut]:
    recipes = session.scalars(select(Recipe).order_by(Recipe.id))
    return [RecipeOut.model_validate(recipe) for recipe in recipes]


@router.post("/recipes", status_code=status.HTTP_201_CREATED)
def create_recipe(new: RecipeCreate, session: Session = Depends(get_session)) -> RecipeOut:
    """Adds a recipe; ingredients the catalogue doesn't have yet are added to it."""
    _check_name(session, new.name)
    recipe = Recipe(name=new.name, icon=new.icon, kind=new.kind, note=new.note, link=new.link)
    session.add(recipe)
    session.flush()
    _set_ingredients(session, recipe, new.ingredients)
    session.commit()
    return RecipeOut.model_validate(recipe)


@router.patch("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: int, update: RecipeUpdate, session: Session = Depends(get_session)
) -> RecipeOut:
    """Changes the fields sent; `ingredients` replaces the whole list."""
    recipe = get_or_404(session, Recipe, recipe_id)
    sent = update.model_fields_set
    if update.name is not None:
        _check_name(session, update.name, recipe.id)
        recipe.name = update.name
    if update.kind is not None:
        if update.kind == RecipeKind.MENU and session.scalar(
            select(RecipeIngredient.id).where(RecipeIngredient.part_id == recipe.id).limit(1)
        ):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A menu is no ingredient")
        recipe.kind = update.kind
    for field in ("icon", "note", "link"):
        if field in sent:
            setattr(recipe, field, getattr(update, field))
    if update.ingredients is not None:
        # The old rows go first, or the same item again would break the unique pair.
        recipe.ingredients = []
        session.flush()
        _set_ingredients(session, recipe, update.ingredients)
    session.commit()
    return RecipeOut.model_validate(recipe)


@router.delete("/recipes/{recipe_id}", **NO_CONTENT)
def delete_recipe(recipe_id: int, session: Session = Depends(get_session)) -> None:
    session.delete(get_or_404(session, Recipe, recipe_id))
    session.commit()

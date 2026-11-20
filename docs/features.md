# Features and data model

What HomeInventory does, how the data is shaped, and the order to build it.
Decisions about the stack, identity and deployment are in `CLAUDE.md`.

## The problem

A single-floor flat is easy to keep track of. A three-floor house with four
toilets, five bins, a basement storage room and a kitchen pantry is not.
Whoever notices that something has run out, is running low or needs doing
should be able to say so on the spot, and the other person should find out,
check stock remotely, and avoid duplicating the job.

## Features (v1)

1. **Report on the spot.** "Out of sugar", "low on toilet paper in the guest
   WC", "bin on floor 2 is full". The home screen shows the places as a tree
   that fits on one phone screen without scrolling (floor → room), so
   reaching a place is a tap or two, and reporting one more. Badges in the
   shortage colours count what's out and low: a floor only what's kept on
   it directly (its rooms show their own), a room (or a place's child) what's
   in it and the places inside. Each missing item shows as its icon in the
   shortage colour, out before low, up to five; past that a "+".
2. **Stock levels per place.** Each supply has a level, **lots / plenty /
   low / out**, per place it is kept (pantry, basement, each bathroom). No
   exact counts. *Lots* means stocked up for weeks (20+ rolls of toilet
   paper in the basement, where a WC only keeps 3-4).
3. **Check remotely.** See what any place has or lacks, from anywhere on the
   tailnet (e.g. at the shop). The catalogue's "Csak hiány" toggle lists
   everything low or out (and kept stocked), out first, each with where, and
   where there's *lots* of it to fetch from; levels change on a place's
   page. (A shortages tab of its own, by item or by place, gave its place in
   the tab bar to the meal planner.)
   Items and places show a two-tone icon (a line icon on a tile coloured
   by group: food, drinks, cleaning, hygiene, household, places), guessed
   from the name or chosen; without one, the first letter stands in. Adding an item suggests common
   supplies; only the ones picked become items.
4. **Requests with claiming.** Every report becomes a request: **open →
   claimed → done** (or cancelled). Claiming shows who is on it, so two
   people don't buy the same milk. Setting a level to *low* or *out* is the
   report for a supply; a chore is reported with one tap on its place's
   page ("Szólok"). Anyone can mark a request done, claimed or not; only
   the claimer can give a claim back. A chore done on the spot is marked
   done without a report (a request that's done from the start, so nobody
   gets notified), and its place shows who did it last and when.
   A chore can **repeat**: on chosen weekdays ("kuka: kedd") or every N days
   after it was last done ("ágynemű: 14 naponta"), set in the place's edit
   mode. It falls due at local midnight (`TIMEZONE`, default
   Europe/Budapest) and then opens a request by itself, with no creator
   ("Esedékes"). Weekly: done earlier the same day counts, done the day
   before doesn't; a cancelled occurrence is skipped. The place shows when
   it's due next. Due chores are checked whenever chores or requests are
   listed, and every minute, so the push goes out on time.
5. **Shopping list.** The *Teendők* (to-do) tab has two lists: *Szabad*,
   the pool of open requests nobody has claimed (and below it, what the
   other has claimed; a folded form there adds a one-off to-do), and *Enyém*, what I've claimed; claiming moves a row
   from one to the other. Under the other's claims an *Érdeklődöm* button
   pushes them "when will it be done?", once a (local) day per request;
   the claimer sees who asked and when. A new claim starts afresh. Each list shows reported chores, then the *buy*
   requests, one row per item however many places
   want it (its buttons act on all of them). An item another place has
   *lots* of goes under *Utántöltés* (refill: "Hozd innen: Pince", done as
   "Feltöltöttem"); the rest is the shopping list, grouped by category.
   Either way, done sets the level back to *plenty* in the places that
   wanted it and leaves the source's *lots* alone: carrying rolls upstairs
   isn't booked. A refill tells the other "feltöltötte", not "megvette". The tab counts the requests nobody has claimed.
6. **Notifications.** Web push to the other user's devices when something
   is reported (a level set to *low*/*out*, a chore reported), claimed,
   done, or refilled (a level set back to *plenty*/*lots*), and to everyone
   when a repeating chore falls due. Nobody is notified about their own
   actions; giving back a claim, cancelling and doing a chore on the spot
   notify nobody. Messages about the same item or chore replace each other
   on the phone; a tap opens the to-do list. Turned on per device: a card on
   the to-do list offers it, the nickname screen turns it on or off.
7. **Live updates.** An open page refetches the house when the other user
   changes something (SSE), and whenever the app comes back on screen.
8. **Undo.** A level, a request action (claim, give back, done, cancel, ask
   after), a chore done or reported, an item put on the list or taken off a
   place: each shows as done at once but waits six seconds behind an undo bar
   before it goes to the server (`house.ts`), so an undone slip notifies
   nobody and leaves no trace. A new change sends the waiting one; picking a
   level twice replaces it (picking back the old one is the undo). Switching
   away from the app sends it at once; a page going away (reload, close)
   keeps it in `localStorage` and the next start sends it (within ten
   minutes): once a service worker controls the page, Chrome drops a fetch
   started while it unloads, `keepalive` or not. Hence no "are you sure" on
   cancelling a request.
9. **Activity log.** The *Napló* tab: who did what, newest first, by day;
   the same action on one item in several places within ten minutes is one
   row. Every route that changes stock or requests records an entry in the
   same transaction (`activity.py`, `GET /api/v1/activity?limit=`); what
   happens by itself (a chore falling due) isn't logged.
10. **Shopping helpers.** Anything can be written on the shopping list as
   free text (*+ Vásárolnivaló* on the to-do list: "Elem", "Szülinapi
   gyertya"), for what the inventory doesn't track: no item, no place, no
   level; claimed, done and notified like any line, and gone once done. Its
   icon and group are guessed from the name. Typing the name of an item the
   inventory keeps offers it, and listing it puts *that item* on the list in
   one of its places (chosen when it has several) whatever its level: more
   for a party is still the same sugar. A written line can be taken into the
   inventory as it's bought (*Leltárba*: name, variant, place, restock off by
   default; `POST /requests/{id}/keep` makes or finds the item, sets it to
   *plenty* there and closes the line, all or nothing). An item's page has
   *+ Listára* for each place without a request, any level. The catalogue has a search box
   (ignoring case and accents), a tab per group (only the groups in use),
   and is sorted by each item's best level: most first by default (what's at
   home, for cooking), flipped with one button to least first (what to buy);
   items kept nowhere come last either way. Search and group last for the
   session, the order for good (browser storage). The shopping list has *Mindet elvállalom* per group (off to the
   grocery: take every open food row at once) and *Megosztás*: the list as
   text to the share sheet (or the clipboard).

11. **Offline reading.** The last house loaded is kept on the device
   (`localStorage`, per user), and so is who used the app last. When the
   server is out of reach (no signal, Tailscale down) the app opens with
   them, read-only in effect, under a bar saying when the data is from, and
   tries again every 30 seconds and when the phone comes back online. The
   service worker already serves the app shell offline. A change made
   offline fails with "Nem érem el a szervert", as before.

## Data model

Built: User, Location, Item, Stock, Chore, Request, PushSubscription,
Activity (tables `users`, `locations`, `items`, `stock`, `chores`,
`requests`, `push_subscriptions`, `activities`).

- **User**: Tailscale login (unique), display name. Created on first request
  from a new login.
- **Location**: a tree via `parent_id`: floor → room → spot (e.g. "Ground
  floor" → "Kitchen" → "Pantry shelf 2"), at most three deep, ordered among
  siblings by `position`. Sibling names are unique ignoring case. Keep it
  shallow: add the spot level only where a room really has several places to
  tell apart. Only a location without children can be deleted; its stock
  goes with it.
- **Item**: a supply in the catalogue: "Sugar", "Toilet paper", "Milk".
  `restock` (default on): running low puts it on the shopping list. Off for
  what's only bought now and then (ice cream, salmon): its level still says
  whether there's any, but it's no shortage (not in the shortages view or
  the badges) and goes on the list only by hand ("+ Listára" on its
  place's page, `POST .../stock/{item}/request`). Turning it off cancels
  its requests; turning it on lists what's already low or out. An item
  taken off its last place (or whose last place is deleted) stays in the
  catalogue, kept nowhere, with `restock` turned off: not keeping it means
  not restocking it. Kept somewhere again, it stays off until turned on.
  An optional `variant` tells apart kinds kept of the same supply
  ("Konzerv" kukorica / vörösbab / borsó, "Szemeteszsák" 35 l / 60 l);
  items sharing a name show as one group, each variant with its own stock.
  "Bármelyik fajta elég": any variant will do ("Konzerv"), stored as the
  variants' family named after the item (see Families; `any_variant` is
  derived from it). A place is short of it only once every variant kept there is low
  or out (`sync_variants_at` in `requests.py`; the client's
  `restockedStock` agrees, for the badges and the shortages view), and then
  it's one request, one row on the list ("Konzerv · bármelyik fajta"); one
  variant back takes it off. Done asks which variant was bought
  (`POST /requests/{id}/done` with `item_id`): that one goes to *plenty*
  there, kept there from then on if it wasn't. Turning it on merges a
  place's lines into one (or none, if a variant is still there); off splits
  them again.
  A place's add form has an optional variant field next to the name.
  Name and variant together are unique, ignoring case. Its group (or
  subgroup, see Groups) sorts the catalogue, a place's page and the
  shopping list; unset means "from the icon" (a letter tile is "Egyéb"),
  and a chosen one also colours the tile.
  Items and locations have an optional `icon`, a name from the web client's
  icon set (`web/src/icons.ts`): null means the client guesses one from the
  name, empty means none.
  Items are added from a place's page. The catalogue lists each with its
  highest level anywhere; tapping an item's name anywhere (catalogue,
  place, shortages, to-do list; a name with variants opens its first) opens
  its page (`#/items/{id}`): every place it's kept with the level (and
  who's buying it), its other variants, and an edit button. Deleting one
  removes its stock.
- **Stock**: one row per (item, location), unique on that pair: level
  (`lots` | `plenty` | `low` | `out`), updated by, updated at. A row means the item
  is kept there.
- **Chore**: a reportable job tied to a location: "Kuka ürítése" in
  "Emelet › Fürdő", or to the whole house (no location: "Porszívózás", on
  the home screen). Not stock, but reported and claimed the same way. Names
  are unique per location (or among the house's) ignoring case; icons work as for items. Added and
  deleted in a place's edit mode; deleting one deletes its requests.
  `one_off`: a to-do for once ("Szerelő hívása"), added on the to-do list
  and reported at once, not listed among a place's chores, and deleted
  with its request once that's done or cancelled; one-offs may share names.
  Optional schedule: `repeat_days` or `repeat_weekdays` (a bitmask, Monday
  = 1; the API speaks lists, Monday = 0), and `scheduled_at`, when it was
  last changed (earlier occurrences don't count). Logic in `schedule.py`.
- **Request**: kind (`buy` | `chore`), item (buy) or chore (chore), or
  for a buy request written on the list by hand only a `name` (no item, no
  location), location (unset for a chore of the whole house), status (`open` | `claimed` | `done` | `cancelled`), created by
  (unset when a scheduled chore fell due by itself),
  claimed by, closed by, timestamps. At most one open/claimed request per
  (item, location) or chore (partial unique indexes), so reporting twice
  finds the first one. Closed requests stay in the table (history, later).
  No note yet: nothing has needed typing.
- **Activity**: a log entry: when, who, action (`level`, `removed`,
  `listed`, `reported`, `claimed`, `unclaimed`, `done`, `fetched`,
  `cancelled`, `reminded`), kind (`buy` | `chore`), item or chore, its name
  and variant as they were, location, and the level for `level`. The links
  are set null when the thing goes (a one-off to-do does, once done); the
  name stays.
- **PushSubscription**: user, endpoint (unique: a device that signs in as
  the other user moves over), keys. A user can have several devices; ones
  the push service reports gone (404/410) are deleted.

Setting stock to *low* or *out* opens a *buy* request (or keeps the active
one, claim included); setting it to *plenty* or *lots* marks it done, and
taking the item off the place cancels it. Completing a buy request sets the
stock back to *plenty*; cancelling it leaves the level alone. Every state
change is a single conditional update (see `CLAUDE.md`); losing a race is
`409`.

## Groups *(agreed 2026-11-20)*

Groups sort what there is so it's quick to find; they don't change what's
short or what goes on the list (that's a family's job, "Hasonló termékek").
They are data, edited on the admin pages only (`item_groups`):

- **Two levels**: a group (Élelmiszer, Ital, Takarítás, Tisztálkodás,
  Háztartás: the old fixed categories) and its subgroups (Élelmiszer ›
  Fűszer). Each has a name, unique among its siblings ignoring case, and a
  position: the order lists show them in, the shopping list's too (roughly
  the shop's aisles). A group has a tile colour from the client's fixed
  palette (`hue`: food, drink, clean, body, home); a subgroup wears its
  group's. A subgroup lists icons that suggest it (bread → Pékáru).
- **An item** names a group or a subgroup (`group_id`), or none: then it
  follows its icon, a subgroup listing it first (in list order), else the
  group of the icon's colour, else "Egyéb".
- **Starting set**: the five groups, the items' old categories moved over,
  and under Élelmiszer: Zöldség, gyümölcs; Hús, hal; Tejtermék, tojás;
  Pékáru; Száraz áru; Konzerv, üveges; Fűszer; Édesség, nasi; Fagyasztott,
  each with the icons that suggest it. They come from a seed file
  (`server/src/homeinventory/seed/groups.json`) the migration loads, not
  from code.
- **Deleting** a subgroup moves its items up to its group; a group goes
  only once it has no subgroups and no items.
- **Shelf life** (milestone 7) will default per subgroup.

Where they show:

- **Termékek** (phone): the group chips as before; a group with subgroups
  in use gets a second row of chips (Mind, Fűszer, Pékáru, ...).
- **A place's page**: its items under group headings, subgroup
  subheadings inside where a group has more than one in use; none at all
  when everything there is in one. Each heading folds; folded ones are
  remembered per place, per phone.
- **The shopping list**: group headings as before, subgroup subheadings
  where a group has more than one in use; the shared text follows.
- **Editing an item** (phone and admin): one picker, "Automatikus (...)",
  then each group followed by its subgroups ("Élelmiszer › Fűszer").
- **Admin**: the items table's group column, filter (a group takes in its
  subgroups) and bulk change know subgroups; a **Csoportok** tab lists the
  groups with their subgroups (name, colour, suggesting icons, how many
  items, order), adds, renames, moves a subgroup to another group, deletes.
- **Families** are renamed on screen to **Hasonló termékek** (any of them
  will do, one line on the list), so the word "csoport" means only this.

## Milestones

1. **Skeleton**: server and web projects, settings, SQLite with
   migrations, identity from the Tailscale headers, deployed on
   borkai-server behind `tailscale serve`.
2. **Places and stock**: locations, items, stock levels; view and change
   them in the web client.
3. **Requests**: report, claim, done, cancel; the shopping list.
4. **Notifications and live updates**: web push, the service worker, SSE.

## Admin pages *(done 2026-11-19)*

Desktop pages for what's awkward on a phone: seeing everything at once,
setting things up, typing in recipes, moving items between places. Built
before the meal planner, so recipes are typed in there.

**The rule: everything the phone can do, the admin pages can do too**, and
more on top (bulk changes, moving, assigning, wide editors). Admin is the
only way in from the desktop, so a gap there is a thing that can't be done
at all from it. A new phone feature gets its admin side in the same change.

**Access.** The desktop that uses it isn't on the tailnet, so the admin
pages are also served on the home LAN, over plain HTTP (the LAN is trusted,
like the torrent box's apps):

- A **second port** of the same server (same process, database and live
  updates), bound to the server's LAN address only, never `0.0.0.0`. On
  that port the Tailscale identity headers are **ignored**: every device on
  the LAN (phones on the wifi included) can reach it and could forge them.
- There, one can only act as the **Admin** user, after a password login
  (set with a command on the server, stored hashed; tries rate-limited). The
  session is an `HttpOnly`, `SameSite=Strict` cookie that lasts months, with
  a log-out button. The Tailscale port never accepts it.
- Admin is a third user: what is done there shows as "Admin" in the log and
  in notifications, which then go to both users. Admin gets no
  notifications and doesn't show in the phone app.
- Over the tailnet the same pages open at `#/admin` under one's own name.

Pages (wide tables, mouse and keyboard; not in the phone tab bar):

1. **Items**: every item in a row (name, variant, group, icon, restocked,
   any variant, shelf life, where and how much), sorted, filtered, edited
   in place; several selected and changed at once. The edit row also shows
   the recipes taking it or any variant of its name, and adds another
   variant of the name ("Új fajta", with its group and icon, kept nowhere
   or at a place).
2. **Moving stock**: one item or several, from a place to another, level
   included; an active request moves with it, claim and all; at a place
   that already keeps the item the two merge, the higher level kept.
   Logged ("Kamra → Konyha"). The phone gets it too: "Áthelyezés" on the
   item's page, since things get moved standing next to them.
3. **Places**: the whole tree; rename, icon, order, move a room to
   another floor.
4. **Chores**: every chore with its schedule; and **assigning** a request
   or chore to a user (claimed for them; they're told "Admin rád osztotta",
   and can hand it back like their own claim).
5. **Recipes** (with the meal planner): a wide editor, and **pasting** an
   ingredient list ("50 dkg liszt") split into lines, each matched to an
   item to confirm or fix.
6. **Log**: searchable, filtered by who, what, which item.
7. **Users and devices**: nicknames; which devices get notifications, an
   old one deletable.

No export for now.

What the phone does that A and B left out, added in milestone C. Admin doesn't
do the work, it hands it out: so "done" or "bought" from here means a user
did it (whoever had it claimed, or one picked). Nothing is left out for
that, but it comes last:

1. **Items**: add a new item (name, variant, group, optionally a place to
   keep it at, "plenty"); its suggestions as on the phone.
2. **Stock**: keep an item at another place, drop it from one, set a level
   ("out" and "low" report it like the phone, restocked items onto the
   list); all from the items table's "where and how much", and "+ item" on
   a place's row.
3. **Chores**: add one (per place or the whole house, with its schedule).
4. **Shopping list**: add a free line or an item; keep or drop an
   out-of-stock item's request ("nem pótoljuk").
5. **Undo**: the same few seconds to undo as on the phone.
6. **Done on a user's behalf**: mark a chore done or a line bought, in the
   name of the user who did it (`by` on the done and keep calls; never Admin).
   The log and the notifications name that person.

Milestones: (A, done) the admin port, login and user, the items table, moving
stock (on the phone too: "Áthelyezés" under the item's places); (B, done) places, chores and assigning, users and
devices, the log; (C, done) the phone's actions above, so nothing needs the phone;
then the meal planner, its recipe editor here.

## Meal planner *(agreed 2026-11-18; recipes and planning done 2026-11-19)*

Plan a cooking for a day; what it needs and the house lacks goes on the
shopping list in time, but not so early that fresh food spoils, and the
buying is bunched into a few shopping trips instead of a shop every day.
The UI was tried as a clickable prototype first, so the pages don't end
up crowded (UI below; the prototype is the `proto/meal-planner` branch,
`#/proto` on the dev build).

Decisions:

- **Levels stay.** Recipes name items, not amounts the app counts; an amount
  ("50 dkg") is a note for the cook. An ingredient counts as at home at
  *plenty* or *lots*; *low* goes on the list too. Two cookings needing the
  same item only show both reservations; the app can't tell whether it's
  enough.
- **Days, no meals.** A cooking is planned for a day, not lunch or dinner.
- **One shop, no fixed shopping days.** Shopping trips are planned as
  needed; the app suggests the days.
- **Suggested recipes** *(2026-11-19, replacing "no starter recipes")*: about
  twenty common Hungarian dishes and base recipes, in the client
  (`web/src/starterRecipes.ts`). Nothing is added until picked: one tap adds
  one (with the base recipes it takes), or all at once; from then on they are
  the household's own. A suggestion shows while no recipe has its name.
- **A recipe's kind**: *főétel* (a main course: planning offers a side
  dish with it), *egytál* (whole on its own: no side dish), *leves*,
  *köret*, *desszert*, *alap* (only a part of others: Besamel, Panír), and
  *menü*: a favourite combination, whose ingredients are the recipes it
  serves (a soup, a main course and its side dish, a dessert), so a two or
  three course meal is planned at once. A menu is never an ingredient
  itself; no menus are suggested. New recipes are main courses. A side
  dish is picked when a main course is planned, not written into its
  recipe, so it can change without changing the recipe; a menu with a
  main course and no side dish asks for one the same way, and one that
  names a side dish keeps it.
- **Families** *(2026-11-19)*: an optional group of different items any of
  which will do ("Pékáru": Kenyér, Zsemle, Kifli), as "any variant will do"
  is for the kinds of one item: a place is short only once every member
  kept there is, one line on the list named after the family ("Pékáru ·
  bármelyik: Kenyér, Kifli, Zsemle"), and buying asks which. Set on the item
  (phone and admin, a column there), each variant its own *(2026-11-19:
  "Kenyér · fehér" can be Pékáru while "Kenyér · rozs" isn't)*, spelled
  once. "Any variant will do" is the same thing: a family named after the
  item ("Konzerv"), which ticking the box puts every variant into (a new
  variant joins it); one variant can still move to another family.
  Products keep their own names (Zsemle, not Pékáru · zsemle), so recipes
  and suggestions find them.
- **Substitutes**: an item names what a recipe can use instead of it
  ("Vaj": "Margarin · sütő"; "Olaj": "Zsír"), set on either item (phone
  and admin) and always both ways: a pair, since nearly every one stands in
  the other way too. A recipe's ingredient counts as at home when a
  substitute is ("helyette: Margarin"). The shopping list ignores them: an
  item restocked still goes on it. Kinds of one thing stay variants with
  "any variant will do" (Darált hús, Pirospaprika); substitutes are
  different products.
- **Recipes take recipes**: a base recipe ("Nokedli", "Besamel") is an
  ingredient of others, whole. What a recipe takes counts its parts' items
  too, each once (optional only if optional everywhere; an optional part's
  items are all optional). No recipe may take itself, directly or through
  others; a deleted recipe leaves the recipes taking it (asked first).
- **Shelf life** by the item's group, changeable per item: raw meat and
  fish at most 1 day before the cooking, other fresh food (vegetables,
  fruit, dairy, eggs, bread) at most 7 days, the rest any time. Frozen meat
  is its own variant, kept any time.

Features:

1. **Recipes**: name, icon, kind, ingredients, an optional note and link. An
   ingredient is a catalogue item (typing a new name makes an item kept
   nowhere), a variant or any variant of it, or another recipe (a part),
   with an optional amount note; optional ingredients (garnish) are never
   listed or warned about. A recipe's page lists the recipes taking it.
2. **Planning a cooking**: a recipe on a day, optionally claimed by who
   cooks. Planning shows at once what's at home, what will go on the list
   and from when, and whether a trip is needed for it.
   - **Reservations**: the ingredients of a planned cooking show it on the
     place and catalogue pages ("Lecsó, Thu"). It blocks nothing; it is
     derived from the planned cooking, not stored. An ingredient set to
     *low* or *out* goes on the list due before the cooking.
   - Missing ingredients, the not-restocked ones included, go on the list
     by themselves, each with a window: buy no earlier than its shelf life
     allows, no later than the cooking's day.
   - Cancelling or moving a cooking withdraws or reschedules its unclaimed
     lines; a claimed line stays, and whoever claimed it is told.
   - Marking it cooked asks "what's left?": a level picker per ingredient,
     so the stock stays true without visiting each place.
   - *(Built, milestone 6.)* A missing ingredient kept somewhere goes on as
     that place's line (the one already there, if it's low and restocked);
     one kept nowhere goes on with no place, and buying it sets no level: it
     counts as at home for that cooking only. One line per item however many
     cookings lack it, due for the earliest (`Request.cooking_id`); lines a
     cooking put on (`for_cooking`) go once no planned cooking lacks the item,
     unless someone has claimed them. Every change to a cooking, a level or a
     recipe settles the lines again (`server/.../cooking_lines.py`). Cancelling
     a cooking deletes it (no "cancelled" status); a cooked one keeps
     `done_at`. Days are today or later, the household's local date.
3. **Shopping trips**: a day, and who goes (claimable, claiming all its
   lines). Each line belongs to a trip inside its window: durable ones the
   earliest, perishable ones the latest (freshest); plain shortages the
   next trip. Lines with no trip in their window make the app suggest the
   fewest days covering them all (sort by the window's end, pick the day
   before it, or its first day if later; repeat). Anyone can still buy
   anything any time.
   - A trip ends when its last line is bought, or when whoever went taps
     "Végeztem" (back, something wasn't there); either is undoable. A
     trip's day passing ends it too. What's left of it moves to the next
     trip that fits, else waits for a suggestion.
4. **The shopping list by trip**: grouped by trip ("Saturday", "Later");
   lines whose window hasn't opened show greyed with their first day.
5. **Notifications**: the other planned a cooking; a trip is today; a
   fresh line's window opens with no trip in it.

Data model additions: **Item** `family`; **ItemSubstitute** (item, substitute); **Recipe** (name unique ignoring case, icon, kind, note,
link: http(s) only); **RecipeIngredient** (recipe, item or part (another
recipe), `any_variant`, amount note, optional, position; one row per item
or part in a recipe, so "any Konzerv" and "Konzerv · borsó" can't both be
in one). The API takes
ingredients by name and variant (a part by its recipe's name, `recipe`), finding the item or making one kept
nowhere (not restocked); a deleted item leaves the recipes it was in. A
name kept in variants, typed without one, means any of them will do. The
admin editor's pasted list is split client-side (`parseIngredients` in
`web/src/recipes.ts`): the amount ("50 dkg", "csipet", "ízlés szerint")
off the front or end, the name matched to the longest catalogue name or
variant found in the line, else taken as typed and marked "új termék".
**Cooking** (recipe, side dish (a main course's, or a menu's naming none), day,
cook, created by, `done_at`; a cancelled one is deleted); **Request**
`cooking_id` (the earliest planned cooking lacking it), `for_cooking`, and an
item's line may have no place (kept nowhere, bought for a cooking). Still to
come: **ShoppingTrip** (day, claimed by, status); **Item** `keeps_days` (null:
any time); **Request** `buy_from`, `trip`.

Milestones: (5, done) recipes, the Menu tab, "Csak hiány" in the
catalogue (the shortages tab is gone), the admin recipe editor; then
recipes taking recipes, recipe kinds and the suggested recipes; (6, done) planning, reservations, missing ingredients on
the list, "what's left?", the admin Főzések tab; (7) shelf life and buying windows; (8) shopping
trips and the list by trip. 5-6 are useful on their own.

UI (agreed 2026-11-19 on the prototype):

- **Tab bar**: Helyek, Teendők, Menü, Termékek, Napló. The shortages view
  merges into the catalogue as a "Csak hiány" toggle beside the search
  (the catalogue sorts by level already); its by-place view goes.
- **Menü, "A hét"**: an agenda of only the days with something on them,
  one card a day: trips (item count, who goes, "Elvállalom") and cookings
  (who cooks, one status line: "✓ minden megvan" / "2 hiányzik · pénteki
  bevásárlás" / "⚠ X: nincs rá bevásárlás"). A suggested trip is a banner
  on top with one "Felvesz" button, only while there is one. Below: "+
  Főzés", "+ Bevásárlás" (day chips).
- **Menü, "Receptek"**: search and a list grouped by kind, each with "minden megvan" or
  "N hiányzik", within a kind those with nothing missing first, then fewest
  missing ("↑ Hiány", or "↑ ABC", remembered); "Megvan" keeps only those
  with nothing missing (the admin table sorts by
  its columns, by default the same way); "+ Új recept"; below, "Receptjavaslatok" (open while there
  are no recipes), each with "+ Felvesz", and "Mindet felveszem".
- **Planning**: "+ Főzés" → pick a recipe (search) → day chips (Ma,
  Holnap, weekdays, ten days) → for a main course, "+ Köret" (the side
  dishes, optional; for a menu too, unless it names a side dish) → a preview (what's at home; each line to
  buy, from when, on which trip or none) → "Betervez".
- **A cooking's page**: day, who cooks, the ingredients with their level
  or "listán · pénteki bevásárlás" (optional ones "ha van"), a link to the
  recipe, and "Lemond", "Áthelyez" (day chips), "Megfőztem" → "Mi maradt?"
  (a level picker per ingredient kept somewhere, "Kész").
- **A recipe's page**: ingredients with amounts and levels, the note,
  "Szerkesztés", "Betervez". The editor adds ingredients one at a time
  with the item suggestions; each row has an amount box, "ha van" and ×.
- **Shopping list**: with no trip planned it stays as today. With trips,
  a row of chips picks one trip at a time ("Ma 5", "Péntek 2", "Nincs
  beosztva", "Később"), the next trip first; its head has who goes
  ("Megyek") and "Végeztem"; inside, the groups and buttons as now. A
  line put on for a cooking says which (chef's hat, "Paprikás csirke,
  szombatra"); "Később" lines are greyed with their first day.
- **Reservations** show as a small chef's hat before the level in the
  catalogue (like the not-restocked icon) and on the place page.

## Later ideas (not scheduled)

- **Drag and drop on the admin places table**: drop a row on another's top
  or bottom edge to put it before or after, on its middle to put it inside;
  a line shows where it lands, forbidden targets (itself, too deep) refuse
  it. Native HTML drag and drop, no library; the server's `PATCH
  /locations/{id}` (parent, position) already does it. The arrows and the
  parent picker stay. Not for items: the bulk move does that better.
- **Offline changes**: ticking items off in a shop with no signal, queued
  and sent once back online (someone else's claim in the meantime dropped
  quietly). Reading offline is done (feature 11); build this if the shop
  shows it's missed.

- **A general version** *(discussed 2026-11-20)*: the core (places,
  items, variants, families, levels, requests, chores, push, live updates,
  log, admin) already fits any shared stock, an office's supplies say. What
  ties it to this household: the fixed groups (become data with the
  subgroups, the next step), the icon lookup by Hungarian name and the
  common items (a seed file), the suggested recipes (already data), recipes
  and cookings (an optional module: they put lines on the list and reserve
  stock, a small seam), and Hungarian only (`strings.ts`, the notification
  text, the recipe paster's units). Running it for others also needs what
  Tailscale gives us for free: real logins, several households kept apart
  (a household on every row), public hosting and its hardening. Not until
  there's a second use; meanwhile household content goes in as data.

Considered and dropped (2026-11):

- An extra reminder before a repeating chore falls due: schedule it for the
  day it needs doing instead (the bin goes out the evening before).
- QR or NFC tags on places: two taps on the tree are as quick.
- Statistics on how often things run out: the levels are a judgement call,
  so the numbers would be too.
- A general shared to-do list: the one-off to-dos are that.
- A count on the app icon: Chrome on Android has no Badging API; the
  launcher already shows a dot for an unread notification.

## Out of scope

- Asset catalogue features: photos, warranties, manuals, purchase records.
- A native mobile app (the PWA covers Android).
- Access from outside the tailnet.

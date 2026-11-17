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
   tailnet (e.g. at the shop). The *shortages* view lists everything low or
   out, by item (with the places that have *lots* of it, to fetch from) or
   by place, as a dense read-only list (by item, each variant is a block of its own: the
   variant, then a row per place); levels change on a place's page.
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

## Data model

Built: User, Location, Item, Stock, Chore, Request, PushSubscription
(tables `users`, `locations`, `items`, `stock`, `chores`, `requests`,
`push_subscriptions`).

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
  its requests; turning it on lists what's already low or out.
  An optional `variant` tells apart kinds kept of the same supply
  ("Konzerv" kukorica / vörösbab / borsó, "Szemeteszsák" 35 l / 60 l);
  items sharing a name show as one group, each variant with its own stock.
  A place's add form has an optional variant field next to the name.
  Name and variant together are unique, ignoring case. Category, from a
  fixed set matching the icon colours (`food` Élelmiszer, `drink` Ital,
  `clean` Takarítás, `body` Tisztálkodás, `home` Háztartás), groups the
  catalogue and the shopping list; unset means "from the icon" (a letter
  tile is "Egyéb"), and a chosen one also colours the tile.
  Items and locations have an optional `icon`, a name from the web client's
  icon set (`web/src/icons.ts`): null means the client guesses one from the
  name, empty means none.
  Items are added from a place's page, and tapping one's name there opens
  its form in the catalogue (`#/items/{id}`; closing it goes back).
  Deleting one removes its stock.
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
- **Request**: kind (`buy` | `chore`), item (buy) or chore (chore),
  location (unset for a chore of the whole house), status (`open` | `claimed` | `done` | `cancelled`), created by
  (unset when a scheduled chore fell due by itself),
  claimed by, closed by, timestamps. At most one open/claimed request per
  (item, location) or chore (partial unique indexes), so reporting twice
  finds the first one. Closed requests stay in the table (history, later).
  No note yet: nothing has needed typing.
- **PushSubscription**: user, endpoint (unique: a device that signs in as
  the other user moves over), keys. A user can have several devices; ones
  the push service reports gone (404/410) are deleted.

Setting stock to *low* or *out* opens a *buy* request (or keeps the active
one, claim included); setting it to *plenty* or *lots* marks it done, and
taking the item off the place cancels it. Completing a buy request sets the
stock back to *plenty*; cancelling it leaves the level alone. Every state
change is a single conditional update (see `CLAUDE.md`); losing a race is
`409`.

## Milestones

1. **Skeleton**: server and web projects, settings, SQLite with
   migrations, identity from the Tailscale headers, deployed on
   borkai-server behind `tailscale serve`.
2. **Places and stock**: locations, items, stock levels; view and change
   them in the web client.
3. **Requests**: report, claim, done, cancel; the shopping list.
4. **Notifications and live updates**: web push, the service worker, SSE.

## Later ideas (not scheduled)

- Reminders for repeating chores beyond the push when they fall due (e.g. the evening before).
- QR stickers (or NFC tags) on bins, toilets and shelves that open that
  place's report page. Scanning isn't faster than two taps on a small tree,
  so only worth it if the tree grows past one screen.
- History: how often something runs out, to plan bigger purchases.
- A general shared to-do list not tied to a supply or a place.

## Out of scope

- Asset catalogue features: photos, warranties, manuals, purchase records.
- A native mobile app (the PWA covers Android).
- Access from outside the tailnet.

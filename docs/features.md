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
   reaching a place is a tap or two, and reporting one more.
2. **Stock levels per place.** Each supply has a level, **lots / plenty /
   low / out**, per place it is kept (pantry, basement, each bathroom). No
   exact counts. *Lots* means stocked up for weeks (20+ rolls of toilet
   paper in the basement, where a WC only keeps 3-4).
3. **Check remotely.** See what any place has or lacks, from anywhere on the
   tailnet (e.g. at the shop). The *shortages* view lists everything low or
   out, by item (with the places that have *lots* of it, to fetch from) or
   by place.
   Items and places show a two-tone icon (a line icon on a tile coloured
   by group: food, drinks, cleaning, hygiene, household, places), guessed
   from the name or chosen; without one, the first letter stands in. Adding an item suggests common
   supplies; only the ones picked become items.
4. **Requests with claiming.** Every report becomes a request: **open →
   claimed → done** (or cancelled). Claiming shows who is on it, so two
   people don't buy the same milk.
5. **Shopping list.** The open and claimed *buy* requests, grouped for the
   shop. Marking one done sets the supply's level back to *plenty*.
6. **Notifications.** Push to the other user when a request is created,
   claimed or done. Nobody is notified about their own actions.
7. **Live updates.** An open list updates itself without a refresh.

## Data model

Built so far: User, Location, Item, Stock (tables `users`, `locations`,
`items`, `stock`). The rest is a draft until its milestone.

- **User**: Tailscale login (unique), display name. Created on first request
  from a new login.
- **Location**: a tree via `parent_id`: floor → room → spot (e.g. "Ground
  floor" → "Kitchen" → "Pantry shelf 2"), at most three deep, ordered among
  siblings by `position`. Sibling names are unique ignoring case. Keep it
  shallow: add the spot level only where a room really has several places to
  tell apart. Only a location without children can be deleted; its stock
  goes with it.
- **Item**: a supply in the catalogue: "Sugar", "Toilet paper", "Milk",
  unique ignoring case. Optional category for grouping the shopping list.
  Items and locations have an optional `icon`, a name from the web client's
  icon set (`web/src/icons.ts`): null means the client guesses one from the
  name, empty means none.
  Items are added from a place's page; deleting one removes its stock.
- **Stock**: one row per (item, location), unique on that pair: level
  (`lots` | `plenty` | `low` | `out`), updated by, updated at. A row means the item
  is kept there.
- **Chore**: a reportable job tied to a location: "Empty bin" on "Floor 2
  bathroom bin". Not stock, but reported and claimed the same way.
- **Request**: kind (`buy` | `chore`), item or chore, location, optional
  note, status (`open` | `claimed` | `done` | `cancelled`), created by,
  claimed by, timestamps. At most one open/claimed request per (item,
  location) or chore, so reporting twice doesn't create duplicates.
- **PushSubscription**: user, endpoint, keys. A user can have several
  devices.

Setting stock to *low* or *out* opens a *buy* request; completing it sets the
stock back to *plenty*. Claiming is a single conditional update (see
`CLAUDE.md`).

## Milestones

1. **Skeleton**: server and web projects, settings, SQLite with
   migrations, identity from the Tailscale headers, deployed on
   borkai-server behind `tailscale serve`.
2. **Places and stock**: locations, items, stock levels; view and change
   them in the web client.
3. **Requests**: report, claim, done, cancel; the shopping list.
4. **Notifications and live updates**: web push, the service worker, SSE.

## Later ideas (not scheduled)

- Recurring chores ("bins out on Tuesday") with reminders.
- "Fetch, don't buy": when the guest WC is low but the basement has lots,
  suggest bringing some up instead of adding it to the shopping list (the
  shortages view already shows where there's lots).
- QR stickers (or NFC tags) on bins, toilets and shelves that open that
  place's report page. Scanning isn't faster than two taps on a small tree,
  so only worth it if the tree grows past one screen.
- History: how often something runs out, to plan bigger purchases.
- A general shared to-do list not tied to a supply or a place.

## Out of scope

- Asset catalogue features: photos, warranties, manuals, purchase records.
- A native mobile app (the PWA covers Android).
- Access from outside the tailnet.

# Dev environment setup on borkai-server

One-time setup of the development environment described in `CLAUDE.md`
("Development environment"). Run as your normal user on borkai-server
(Ubuntu Server); commands that need root use `sudo`.

Claude Code can't use `sudo` (it needs a password), so run the `sudo` steps
yourself over SSH. Claude can do the rest.

## 1. System packages

```bash
sudo apt update
sudo apt install -y git curl sqlite3 ca-certificates tmux
```

`sqlite3` is for inspecting the dev database and for backups.

## 2. uv (Python tooling)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc          # or open a new shell, so ~/.local/bin is on PATH
uv --version
uv python install 3.12
```

uv manages the project's Python itself, so the system Python version doesn't
matter.

## 3. Node.js LTS (web client)

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version
```

## 4. Docker (live deployment)

Check first; the torrent box may already have installed it:

```bash
docker --version && docker compose version
```

Only if that fails:

```bash
sudo apt install -y docker.io docker-compose-v2
```

Either way, your user must be in the `docker` group to run it without
`sudo`:

```bash
sudo usermod -aG docker "$USER"
```

Log out and back in, and restart Remote Control with a new tmux server
(see the notes in step 8) so it picks up the group. `docker ps` should then work without `sudo`.

## 5. GitHub access and clone

Git talks to GitHub over HTTPS, authenticated by the GitHub CLI as the
**B0rkai-Claude** account:

```bash
sudo apt install -y gh
gh auth login             # GitHub.com, HTTPS, log in as B0rkai-Claude
gh auth setup-git         # use gh as git's credential helper
git config --global user.name "B0rkai-Claude"
git config --global user.email "339515777+B0rkai-Claude@users.noreply.github.com"
```

Then clone into your home directory:

```bash
cd ~
git clone https://github.com/B0rkai/HomeInventory.git
cd HomeInventory
git push --dry-run        # should succeed without asking for a password
```

## 6. Tailscale

```bash
tailscale status
tailscale serve status    # note which HTTPS ports are already in use
```

In the Tailscale admin console (DNS page), make sure **MagicDNS** and
**HTTPS certificates** are enabled. Then record the chosen ports in
`CLAUDE.md` (the first Claude session can do this from the output above).

## 7. Claude Code

Install (native installer, auto-updates), then log in with your claude.ai
subscription. API keys and `claude setup-token` tokens can't run Remote
Control.

```bash
curl -fsSL https://claude.ai/install.sh | bash
source ~/.bashrc
claude --version
```

First run, interactively, in the project folder: log in (`/login`; on a
headless box press `c` to copy the URL, open it on another device, and paste
the code back if asked), trust the folder, then quit.

```bash
cd ~/HomeInventory
claude
```

## 8. Remote Control

Remote Control runs inside tmux so it survives SSH disconnects. The helper
`rc-start` (in `~/.local/bin`, not in this repo) starts it for a folder in
its own window of the `claude` tmux session and pre-accepts the folder
trust dialog:

```bash
rc-start ~/HomeInventory HomeInventory      # start
rc-start -r ~/HomeInventory HomeInventory   # restart that window
rc-start --restart-all                      # new tmux server, every window again
# reattach: tmux attach -t claude    detach: Ctrl+B, then D
```

The first run asks to enable Remote Control; answer `y`. Then open the
session from the Claude app on your phone or desktop.

Notes:

- **One process per folder.** A `claude remote-control` process serves
  sessions in the folder it was started in; there is no way to start a
  session in another folder from the app. For another repo, start another
  one in its own tmux window.
- Within this folder it is server mode: you can open several sessions from
  the app. `--spawn worktree` gives each one its own git worktree, so
  parallel sessions don't edit the same files.
- **Group changes need a new tmux server.** Everything started inside tmux
  inherits the tmux server's groups, so after joining a group (such as
  `docker`), `rc-start -r` is not enough. From a fresh SSH login (not
  inside tmux), run `rc-start --restart-all`: it stops every window, other
  projects included, and starts them again in a new tmux server.
- If it stops (reboot, Ctrl+C), run `claude remote-control` again in the
  same folder within about four hours to bring its sessions back. It also
  exits after about 10 minutes without network.
- When the login expires, sessions stop making progress: run `/login` again
  when the startup warning appears.

## 9. Dev servers

Once the code is cloned and `uv sync` / `npm install` have run, install the dev
API and web client as systemd user services, and expose the web client on the
tailnet: see `deploy/dev/README.md`. User services start at boot only with
lingering on (`loginctl show-user "$USER" -p Linger`; if it says `no`, run
`sudo loginctl enable-linger "$USER"` once).

## 10. Headless browser (screenshots, UI checks)

Playwright lives outside the repo, in its own folder, with a headless Chromium
in its default cache (`~/.cache/ms-playwright`):

```bash
mkdir -p ~/.local/lib/playwright && cd ~/.local/lib/playwright
npm init -y && npm i playwright@1.65.1
npx playwright install chromium-headless-shell
```

A script (CommonJS, `require('playwright')`) runs with
`NODE_PATH=~/.local/lib/playwright/node_modules node script.js`. It opens the dev
build at `http://127.0.0.1:5173/` with identity headers, since requests from the
server itself through the tailnet names carry none:

```js
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({
    viewport: { width: 393, height: 851 }, // a phone; 1400 wide for the admin pages
    extraHTTPHeaders: { 'Tailscale-User-Login': 'borkaiakos@gmail.com', 'Tailscale-User-Name': 'Akos Borkai' },
  })
  await ctx.addInitScript(() => localStorage.setItem('push-prompt-dismissed', '1'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto('http://127.0.0.1:5173/#/menu/recipes')
  await page.screenshot({ path: 'menu.png' })
  await b.close()
})()
```

The admin pages open at `#/admin` on the dev build too (there's no admin port in
dev). Data made for a check goes into the dev database: delete it afterwards.

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

Log out and back in, and restart the Remote Control session (step 8) so it
picks up the group. `docker ps` should then work without `sudo`.

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

Start Remote Control inside tmux so it survives SSH disconnects:

```bash
tmux new -s homeinventory
cd ~/HomeInventory
claude remote-control --name "HomeInventory"
# detach: Ctrl+B, then D    reattach: tmux attach -t homeinventory
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
- To restart it (for example after a group change): attach to the tmux
  session, press Ctrl+C, and run the same command again.
- If it stops (reboot, Ctrl+C), run `claude remote-control` again in the
  same folder within about four hours to bring its sessions back. It also
  exits after about 10 minutes without network.
- When the login expires, sessions stop making progress: run `/login` again
  when the startup warning appears.

# Dev environment setup on borkai-server

One-time setup of the development environment described in `CLAUDE.md`
("Development environment"). Run as your normal user on borkai-server
(Ubuntu Server); commands that need root use `sudo`.

## 1. System packages

```bash
sudo apt update
sudo apt install -y git curl sqlite3 ca-certificates
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

The torrent box probably already uses Docker. Check first:

```bash
docker --version && docker compose version
```

Only if that fails:

```bash
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"     # then log out and back in
```

## 5. GitHub access as B0rkai-Claude

Create a key for this server:

```bash
ssh-keygen -t ed25519 -C "borkai-server" -f ~/.ssh/id_ed25519_github -N ""
cat ~/.ssh/id_ed25519_github.pub
```

Add the printed public key to the **B0rkai-Claude** GitHub account (signed
in as that account: Settings → SSH and GPG keys → New SSH key). Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com     # should greet B0rkai-Claude
```

## 6. Clone the repo

```bash
mkdir -p ~/dev && cd ~/dev
git clone git@github.com:B0rkai/HomeInventory.git
cd HomeInventory
git config user.name "B0rkai"
git config user.email "<your email>"   # the one your existing commits use
```

## 7. Tailscale

```bash
tailscale status
tailscale serve status    # note which HTTPS ports the torrent box already uses
```

In the Tailscale admin console (DNS page), make sure **MagicDNS** and
**HTTPS certificates** are enabled. Then record the chosen ports in
`CLAUDE.md` (the first Claude session can do this from the output above).

## 8. Claude Code and Remote Control

Install (native installer, auto-updates), then log in with your claude.ai
subscription. API keys and `claude setup-token` tokens can't run Remote
Control.

```bash
curl -fsSL https://claude.ai/install.sh | bash
source ~/.bashrc
claude --version
sudo apt install -y tmux
```

First run, interactively, in the project folder: log in (`/login`; on a
headless box press `c` to copy the URL, open it on another device, and paste
the code back if asked), trust the folder, then quit.

```bash
cd ~/dev/HomeInventory
claude
```

Start Remote Control inside tmux so it survives SSH disconnects:

```bash
tmux new -s homeinventory
cd ~/dev/HomeInventory
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
- If it stops (reboot, Ctrl+C), run `claude remote-control` again in the
  same folder within about four hours to bring its sessions back. It also
  exits after about 10 minutes without network.
- When the login expires, sessions stop making progress: run `/login` again
  when the startup warning appears.

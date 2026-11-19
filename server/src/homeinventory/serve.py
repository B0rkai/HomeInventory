"""Runs the server in one process on two ports: the tailnet one (behind `tailscale serve`),
and, when ADMIN_PORT is set, the admin pages' LAN port. One process, as SQLite has one
writer and live updates live in its memory; the app tells the ports apart by the socket
a request arrived on (identity.on_admin_port).

    python -m homeinventory.serve --host 0.0.0.0 --port 8100 [--proxy-headers] [--reload]
"""

import argparse
import socket

import uvicorn
from uvicorn.supervisors import ChangeReload

from homeinventory.config import Settings

# Open live-update streams never end by themselves, so shutdown stops waiting after this.
GRACEFUL_SHUTDOWN_SECONDS = 5


def bind(host: str, port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET6 if ":" in host else socket.AF_INET)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    # Kept across the reloader's restarts.
    sock.set_inheritable(True)
    return sock


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument(
        "--proxy-headers", action="store_true", help="trust X-Forwarded-* from any address"
    )
    args = parser.parse_args()
    config = uvicorn.Config(
        "homeinventory.main:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        proxy_headers=args.proxy_headers,
        forwarded_allow_ips="*" if args.proxy_headers else None,
        timeout_graceful_shutdown=GRACEFUL_SHUTDOWN_SECONDS,
    )
    sockets = [bind(args.host, args.port)]
    admin_port = Settings().admin_port
    if admin_port is not None:
        sockets.append(bind(args.host, admin_port))
    server = uvicorn.Server(config)
    if config.should_reload:
        ChangeReload(config, target=server.run, sockets=sockets).run()
    else:
        server.run(sockets=sockets)


if __name__ == "__main__":
    main()

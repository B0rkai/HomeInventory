from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment variables (and a .env file in development)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Holds the SQLite database (and later other runtime files). Relative paths are
    # resolved from the working directory, so the dev default is server/data.
    data_dir: Path = Path("data")
    # Overrides the database location; defaults to <data_dir>/homeinventory.db.
    database_path: Path | None = None
    # Stands in for the Tailscale identity headers when they are missing (tests, or
    # running without `tailscale serve` in front). Never set in the live deployment.
    dev_user: str | None = None
    # The built web client (web/dist) to serve next to the API, as in the live image.
    # Unset in development, where Vite serves it.
    web_dir: Path | None = None
    # The household's time zone: scheduled chores fall due at its midnight.
    timezone: str = "Europe/Budapest"
    # Who runs this server, for the push services (a mailto: or https: URL). The VAPID
    # key pair itself is made on first use and kept in the data directory.
    vapid_subject: str = "https://spajz.tail61796b.ts.net"
    # The admin pages' port, served on the home LAN (see serve.py). Requests arriving on
    # it ignore the Tailscale headers, which any device there could forge, and act only as
    # the password-logged-in Admin user. Unset: no such port.
    admin_port: int | None = None

    @property
    def vapid_key_path(self) -> Path:
        return self.data_dir / "vapid-private.pem"

    @property
    def db_path(self) -> Path:
        return self.database_path or self.data_dir / "homeinventory.db"

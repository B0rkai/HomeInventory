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

    @property
    def db_path(self) -> Path:
        return self.database_path or self.data_dir / "homeinventory.db"

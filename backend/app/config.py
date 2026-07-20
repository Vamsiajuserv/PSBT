"""Application settings loaded from backend/.env."""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_PATH, extra="ignore")

    # Deployment environment. Defaults to "production" so that demo-only behaviour
    # (e.g. rolling mock transaction dates forward) never runs unless explicitly
    # opted in with ENVIRONMENT=development. Never let a demo path touch prod data.
    ENVIRONMENT: str = "production"

    # Database
    PGHOST: str
    PGUSER: str
    PGPORT: int = 5432
    PGDATABASE: str
    PGPASSWORD: str
    PGSSLMODE: str = "require"

    # Auth
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # App
    APP_NAME: str = "PSBT-Portal API"
    CORS_ORIGINS: str = "http://localhost:5173"

    # Payments — leave blank to use the sandbox provider (auto-success, no charge)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in ("development", "dev", "local")

    @property
    def payment_provider(self) -> str:
        return "razorpay" if (self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET) else "sandbox"

    # Translation — Azure AI Translator (leave blank to use the verified glossary only)
    AZURE_TRANSLATOR_KEY: str = ""
    AZURE_TRANSLATOR_REGION: str = ""
    AZURE_TRANSLATOR_ENDPOINT: str = "https://api.cognitive.microsofttranslator.com"

    @property
    def translator_provider(self) -> str:
        return "azure" if self.AZURE_TRANSLATOR_KEY else "glossary"

    # Notifications — leave blank to keep a channel's provider unconfigured.
    # When unconfigured, messages are recorded but never "sent" (status SKIPPED).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMS_API_URL: str = ""          # generic HTTP SMS gateway (POST {to, message})
    SMS_API_KEY: str = ""
    WHATSAPP_API_URL: str = ""     # generic HTTP WhatsApp gateway (POST {to, message})
    WHATSAPP_API_KEY: str = ""

    @property
    def email_provider(self) -> str:
        return "smtp" if self.SMTP_HOST else "none"

    @property
    def sms_provider(self) -> str:
        return "http" if self.SMS_API_URL else "none"

    @property
    def whatsapp_provider(self) -> str:
        return "http" if self.WHATSAPP_API_URL else "none"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.PGUSER}:{self.PGPASSWORD}"
            f"@{self.PGHOST}:{self.PGPORT}/{self.PGDATABASE}"
            f"?sslmode={self.PGSSLMODE}"
        )

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()

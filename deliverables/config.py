"""
SM SADI — Automated AI Trading Platform
File: config.py
Description: Centralized environment configuration, cryptographic constants,
local payment gateway settings (BDT <-> USD), Tiered Demo Bonus rules,
2% Admin Service Fee, and Firebase RTDB initializer.
"""

import os
import json
from dataclasses import dataclass
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, db

load_dotenv()


@dataclass(frozen=True)
class Settings:
    # Application Metadata
    APP_NAME: str = "SM SADI Automated AI Trading Platform"
    AI_CODE_NAME: str = "SM SADI"
    ENGINE_VERSION: str = "SM-SADI-QUANT-v4.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Database & Redis Queue (Render.com / Koyeb / Supabase / Upstash Free Tier)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://smsadi_user:password@localhost:5432/smsadi_db",
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Firebase Realtime Database Configuration
    FIREBASE_DB_URL: str = os.getenv(
        "FIREBASE_DB_URL",
        "https://sm-sadi-ai-trading-platform-default-rtdb.firebaseio.com",
    )
    FIREBASE_CREDENTIALS_JSON: str = os.getenv("FIREBASE_CREDENTIALS_JSON", "")

    # Cryptographic Keys (AES-256, SHA-256 Anti-Fraud Salt, Short-Lived JWT)
    AES_MASTER_KEY: str = os.getenv(
        "AES_MASTER_KEY",
        "smsadimtradingplatformsecretkey32",
    )
    LEDGER_HASH_SALT: str = os.getenv(
        "LEDGER_HASH_SALT",
        "smsadim_secure_salt_10_1_2026",
    )
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "jwt_smsadim_ai_trading_secorkey_99",
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 15  # Mandatory 15-minute short-lived session

    # "SM SADI" AI Trading & Wallet Specifications
    AI_CONFIDENCE_THRESHOLD: float = 98.0         # Strict >= 98% execution filter (identical in DEMO & REAL)
    DEFAULT_DEMO_BALANCE_USD: float = 10000000.00 # $10,000,000 ($1 Crore) Initial Demo Balance
    WELCOME_MAIN_BALANCE_USD: float = 1.00        # $1.00 Welcome Bonus in Main (Real) Balance
    MIN_TRADE_DURATION_MINUTES: int = 1           # Minimum 1 Minute trade duration
    MIN_TRADE_STAKE_USD: float = 1.00             # Minimum $1.00 per trade
    MIN_DEPOSIT_USD: float = 2.00                 # Minimum $2.00 Deposit
    LOCKED_BASE_WALLET_HOLD_USD: float = 2.00     # $2.00 must permanently remain in account (non-tradable & non-withdrawable)
    APP_SERVICE_FEE_PCT: float = 0.02             # 2% of every trade profit auto-transferred to Admin Account
    DEFAULT_USD_TO_BDT_RATE: float = float(os.getenv("USD_TO_BDT_RATE", "123.50"))

    # Demo Profit Bonus Tiers (Credited to Main Balance)
    # 1) First Deposit $3 - <$5   -> One-time 50% of accumulated Demo profit
    # 2) First Deposit $5 - <$50  -> Lifetime 50% of all Demo profits credited to Main Balance
    # 3) Deposit >= $50           -> Lifetime 70% of all Demo profits credited to Main Balance
    TIER1_MIN_DEPOSIT_USD: float = 3.00
    TIER2_LIFETIME_50_MIN_USD: float = 5.00
    TIER3_LIFETIME_70_MIN_USD: float = 50.00

    # Telegram Bot Ecosystem
    USER_BOT_USERNAME: str = "@SMSADIAI_Bot"
    SUPPORT_BOT_USERNAME: str = "@SMSADI_Official_Bot"
    ADMIN_BOT_USERNAME: str = "@SMSADIAIAdmin_Bot"
    USER_BOT_TOKEN: str = os.getenv(
        "USER_BOT_TOKEN",
        "8585116863:AAHBoPwLN9YwpiVDAWHUTTch6LIbJmYXEos",
    )
    ADMIN_BOT_TOKEN: str = os.getenv(
        "ADMIN_BOT_TOKEN",
        "8788358073:AAGFMhURmBOHS80WV5FYQ763_Atp22g1ipI",
    )
    ADMIN_TELEGRAM_ID: int = int(os.getenv("ADMIN_TELEGRAM_ID", "7504836023"))
    ADMIN_TELEGRAM_IDS: tuple = tuple(
        int(x.strip())
        for x in os.getenv("ADMIN_TELEGRAM_IDS", os.getenv("ADMIN_TELEGRAM_ID", "7504836023")).split(",")
        if x.strip().isdigit()
    )
    TMA_FRONTEND_URL: str = os.getenv(
        "TMA_FRONTEND_URL",
        "https://sm-sadi-ai.github.io/tma-terminal/",
    )

    # Local Payment Webhook Secrets (bKash, Nagad, Rocket)
    BKASH_WEBHOOK_SECRET: str = os.getenv("BKASH_WEBHOOK_SECRET", "bkash_s2s_hmac_secret")
    NAGAD_WEBHOOK_SECRET: str = os.getenv("NAGAD_WEBHOOK_SECRET", "nagad_s2s_hmac_secret")
    ROCKET_WEBHOOK_SECRET: str = os.getenv("ROCKET_WEBHOOK_SECRET", "rocket_s2s_hmac_secret")


settings = Settings()


def init_firebase() -> None:
    """
    Initializes Firebase Admin SDK connected to:
    https://sm-sadi-ai-trading-platform-default-rtdb.firebaseio.com
    """
    if firebase_admin._apps:
        return

    if settings.FIREBASE_CREDENTIALS_JSON:
        cred_dict = json.loads(settings.FIREBASE_CREDENTIALS_JSON)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred, {"databaseURL": settings.FIREBASE_DB_URL})
    else:
        firebase_admin.initialize_app(options={"databaseURL": settings.FIREBASE_DB_URL})


def sync_firebase_node(path: str, payload: dict) -> bool:
    """
    Synchronizes real-time user wallet state, AI trade signals, or session status
    to Firebase Realtime Database.
    """
    try:
        init_firebase()
        ref = db.reference(path)
        ref.update(payload)
        return True
    except Exception as exc:
        print(f"[FIREBASE-RTDB-SYNC-WARN] Path={path}: {exc}")
        return False

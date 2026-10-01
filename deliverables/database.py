"""
SM SADI — Automated AI Trading Platform
File: database.py
Description: Async SQLAlchemy engine & session factory for PostgreSQL,
plus Firebase Realtime Database JSON Schema definitions and sync helpers.
"""

from typing import AsyncGenerator, Dict, Any
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import settings, sync_firebase_node


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# =====================================================================
# FIREBASE REALTIME DATABASE JSON SCHEMAS
# URL: https://sm-sadi-ai-trading-platform-default-rtdb.firebaseio.com/
# =====================================================================

FIREBASE_RTDB_SCHEMA_TEMPLATE: Dict[str, Any] = {
    "system_state": {
        "engine_name": "SM SADI",
        "sadi_active": True,
        "confidence_threshold": 98.0,
        "usd_to_bdt_rate": 123.50,
        "active_feeds": ["BINANCE_WS", "KUCOIN_WS", "MT5_BRIDGE"],
        "last_heartbeat": 1759196700,
    },
    "users": {
        "tg_7504836023": {
            "wallet": {
                "active_mode": "REAL",  # REAL | DEMO
                "real_balance_usd": 245.50,
                "demo_balance_usd": 10000.00,
                "locked_bonus_usd": 0.00,
                "bonus_unlocked": True,
                "reserve_guard_usd": 5.00,
                "min_trade_usd": 10.00,
                "max_trade_usd": 200.00,
                "ledger_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "is_locked": False,
            },
            "auto_session": {
                "is_running": True,
                "duration_minutes": 30,
                "started_at": 1759195000,
                "ends_at": 1759196800,
                "kill_switch_triggered": False,
            },
        }
    },
    "live_signals": {
        "BTCUSDT": {
            "symbol": "BTCUSDT",
            "price": 94280.50,
            "rsi_14": 28.4,
            "macd_hist": 42.18,
            "bb_position": "LOWER_BAND_REVERSAL",
            "order_flow_imbalance": 0.78,
            "confidence_score": 98.6,
            "direction": "LONG",
            "qualifies_98_filter": True,
            "timestamp": 1759196700,
        }
    },
}


def sync_wallet_to_firebase(
    telegram_id: int,
    active_mode: str,
    real_balance: float,
    demo_balance: float,
    locked_bonus: float,
    ledger_hash: str,
    is_locked: bool,
) -> None:
    """
    Pushes real-time wallet state & cryptographic ledger hash to Firebase RTDB
    so the Telegram Mini App UI updates instantaneously without polling.
    """
    sync_firebase_node(
        f"users/tg_{telegram_id}/wallet",
        {
            "active_mode": active_mode,
            "real_balance_usd": round(real_balance, 2),
            "demo_balance_usd": round(demo_balance, 2),
            "locked_bonus_usd": round(locked_bonus, 2),
            "ledger_sha256": ledger_hash,
            "is_locked": is_locked,
        },
    )

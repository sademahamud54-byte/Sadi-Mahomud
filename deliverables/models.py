"""
SM SADI — Automated AI Trading Platform
File: models.py
Description: PostgreSQL SQLAlchemy ORM models (User, Wallet, AdminVault, TradeLog, Transaction)
with $10,000,000 Demo Balance, $1.00 Welcome Main Balance, $2.00 Non-Tradable/Non-Withdrawable Hold,
2% Auto Admin Service Charge, and Tiered Demo-to-Main Bonus Rules (50% One-Time, 50% Lifetime, 70% Lifetime).
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Enum as SqlEnum,
)
from sqlalchemy.orm import relationship
import enum

from database import Base
from security import compute_ledger_hash, verify_ledger_integrity


class WalletMode(str, enum.Enum):
    DEMO = "DEMO"
    REAL = "REAL"


class DemoBonusTier(str, enum.Enum):
    NONE = "NONE"                       # No qualifying deposit >= $3 yet
    ONETIME_50_CLAIMED = "ONETIME_50"   # First deposit $3 - <$5 (50% one-time bonus claimed)
    LIFETIME_50 = "LIFETIME_50"         # First deposit $5 - <$50 (50% of Demo profit forever -> Main Balance)
    LIFETIME_70 = "LIFETIME_70"         # Deposit >= $50 (70% of Demo profit forever -> Main Balance)


class TransactionType(str, enum.Enum):
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    BONUS_UNLOCK = "BONUS_UNLOCK"


class TransactionStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(64), nullable=True)
    device_fingerprint = Column(String(64), nullable=True)

    # AES-256-GCM Encrypted Exchange API Credentials (Withdrawals strictly disabled)
    exchange_name = Column(String(32), default="BINANCE")
    encrypted_api_key = Column(String(512), nullable=True)
    encrypted_api_secret = Column(String(512), nullable=True)
    whitelisted_ip = Column(String(64), nullable=True)

    is_blocked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    wallet = relationship("Wallet", back_populates="user", uselist=False, cascade="all, delete-orphan")
    trades = relationship("TradeLog", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    active_mode = Column(SqlEnum(WalletMode), default=WalletMode.DEMO, nullable=False)
    # $10,000,000 ($1 Crore) Initial Demo Balance & $1.00 Welcome Bonus in Main Balance
    demo_balance_usd = Column(Float, default=10000000.00, nullable=False)
    real_balance_usd = Column(Float, default=1.00, nullable=False)
    locked_bonus_usd = Column(Float, default=0.00, nullable=False)  # Pending Demo profit pool
    total_real_deposited_usd = Column(Float, default=0.00, nullable=False)
    first_deposit_completed = Column(Boolean, default=False, nullable=False)
    demo_bonus_tier = Column(SqlEnum(DemoBonusTier), default=DemoBonusTier.NONE, nullable=False)
    total_demo_bonus_credited_usd = Column(Float, default=0.00, nullable=False)

    # User-Configurable Auto-Trading Risk & Guardrails (Min $2 Locked Base Reserve, Min $1 Trade, Min 1m Duration)
    reserve_balance_usd = Column(Float, default=2.00, nullable=False)
    min_investment_usd = Column(Float, default=1.00, nullable=False)
    max_investment_usd = Column(Float, default=200.00, nullable=False)
    auto_trading_enabled = Column(Boolean, default=False, nullable=False)
    auto_duration_minutes = Column(Integer, default=1, nullable=False)
    auto_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Anti-Fraud SHA-256 Cryptographic Ledger Guard
    ledger_nonce = Column(Integer, default=1, nullable=False)
    ledger_sha256 = Column(String(64), nullable=False)
    is_compromised_locked = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="wallet")

    def assert_integrity(self) -> None:
        if self.is_compromised_locked:
            raise ValueError("ACCOUNT LOCKED: Cryptographic ledger tamper previously detected.")

        valid = verify_ledger_integrity(
            user_id=self.user_id,
            real_balance=self.real_balance_usd,
            demo_balance=self.demo_balance_usd,
            locked_bonus_balance=self.locked_bonus_usd,
            nonce=self.ledger_nonce,
            stored_hash=self.ledger_sha256,
        )
        if not valid:
            self.is_compromised_locked = True
            raise ValueError(
                "CRITICAL ANTI-FRAUD ALERT: SHA-256 Ledger Hash Mismatch! "
                "Unauthorized database manipulation detected. Account locked."
            )

    def seal_ledger(self) -> None:
        self.ledger_nonce += 1
        self.ledger_sha256 = compute_ledger_hash(
            user_id=self.user_id,
            real_balance=self.real_balance_usd,
            demo_balance=self.demo_balance_usd,
            locked_bonus_balance=self.locked_bonus_usd,
            nonce=self.ledger_nonce,
        )
        self.updated_at = datetime.now(timezone.utc)


class AdminVault(Base):
    """
    Stores the 2% App Service Charge automatically deducted from every user's winning trade.
    """
    __tablename__ = "admin_vault"

    id = Column(Integer, primary_key=True, index=True)
    admin_telegram_id = Column(BigInteger, default=7504836023, nullable=False)
    total_service_fee_usd = Column(Float, default=0.00, nullable=False)
    total_trades_taxed = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TradeLog(Base):
    __tablename__ = "trade_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wallet_mode = Column(SqlEnum(WalletMode), nullable=False)
    execution_mode = Column(String(16), default="AUTO")  # AUTO | MANUAL
    symbol = Column(String(24), nullable=False)          # e.g., BTCUSDT
    direction = Column(String(8), nullable=False)        # LONG | SHORT
    stake_usd = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=False)
    ai_confidence = Column(Float, nullable=False)        # Always >= 98.0% ("SM SADI")
    gross_profit_usd = Column(Float, nullable=False)
    admin_fee_2pct_usd = Column(Float, nullable=False)   # 2% App Service Charge -> Admin Account
    pnl_usd = Column(Float, nullable=False)              # Net Profit credited to User
    demo_bonus_to_main_usd = Column(Float, default=0.00, nullable=False)
    status = Column(String(16), default="WON")
    executed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="trades")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tx_type = Column(SqlEnum(TransactionType), nullable=False)
    gateway = Column(String(16), nullable=False)         # BKASH | NAGAD | ROCKET
    sender_number = Column(String(24), nullable=False)
    gateway_tx_id = Column(String(64), unique=True, nullable=False, index=True)
    amount_bdt = Column(Float, nullable=False)
    exchange_rate = Column(Float, nullable=False)
    amount_usd = Column(Float, nullable=False)
    unlocked_bonus_usd = Column(Float, default=0.00, nullable=False)
    activated_bonus_tier = Column(String(32), default="NONE", nullable=False)
    status = Column(SqlEnum(TransactionStatus), default=TransactionStatus.PENDING, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    processed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="transactions")

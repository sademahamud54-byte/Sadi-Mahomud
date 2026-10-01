"""
SM SADI — Automated AI Trading Platform
File: server.py
Description: FastAPI production backend implementing:
- Identical "SM SADI" >= 98% AI execution across both DEMO ($10,000,000) and REAL ($1 Welcome Bonus) wallets.
- Minimum Trade: 1 Minute & $1.00 USD.
- Minimum Deposit: $2.00 USD (247 BDT), which must permanently remain in the account (non-tradable & non-withdrawable).
- 2% App Service Charge automatically deducted from every trade's profit and transferred to the Admin Account.
- Tiered Demo-to-Main Profit Bonus:
  * First Deposit $3 - <$5   -> One-time 50% of Demo profits credited to Main Balance.
  * First Deposit $5 - $10+  -> Lifetime 50% of all Demo profits credited to Main Balance.
  * Deposit >= $50           -> Lifetime 70% of all Demo profits credited to Main Balance.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, Header, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import engine, Base, get_db
from models import (
    User,
    Wallet,
    AdminVault,
    TradeLog,
    Transaction,
    WalletMode,
    DemoBonusTier,
    TransactionType,
    TransactionStatus,
)
from security import (
    compute_device_fingerprint,
    create_bound_jwt,
    validate_local_gateway_payload,
)
from ai_engine import sadi_engine


class AuthInitRequest(BaseModel):
    telegram_id: int
    username: Optional[str] = "SadiTrader"


class AutoTradeConfigRequest(BaseModel):
    enabled: bool
    duration_minutes: int = Field(ge=1, description="Minimum 1 minute (1,5,10,20,30,40,50m or 1-10h)")
    reserve_balance_usd: float = Field(ge=2.0, description="Minimum $2.00 locked base balance")
    min_investment_usd: float = Field(ge=1.0, description="Minimum $1.00 per trade")
    max_investment_usd: float = Field(ge=1.0)


class ManualTradeRequest(BaseModel):
    symbol: str = "BTCUSDT"
    stake_usd: float = Field(ge=1.0, description="Minimum $1.00 stake")


class DepositRequest(BaseModel):
    gateway: str  # BKASH | NAGAD | ROCKET
    sender_number: str
    tx_id: str
    amount_bdt: float = Field(gt=0)


class WithdrawRequest(BaseModel):
    gateway: str  # BKASH | NAGAD | ROCKET
    receiver_number: str
    amount_usd: float = Field(gt=0)


def settle_trade_profit_and_bonuses(
    wallet: Wallet,
    admin_vault: AdminVault,
    stake_usd: float,
) -> tuple[float, float, float, float]:
    """
    Executes "SM SADI" profit settlement identical for both DEMO and REAL modes:
    1. Gross Profit = 86% of stake.
    2. 2% App Service Charge is automatically deducted from profit and sent to Admin Account.
    3. Net Profit (98% of gross profit) is credited to User's active wallet.
    4. If trading in DEMO mode:
       - If user has LIFETIME_70 tier ($50+ deposit): 70% of net Demo profit auto-credits to Main (REAL) Balance!
       - If user has LIFETIME_50 tier ($5-$10+ first deposit): 50% of net Demo profit auto-credits to Main (REAL) Balance!
       - Otherwise: Net Demo profit accumulates in `locked_bonus_usd` awaiting qualifying deposit.
    """
    gross_profit = round(stake_usd * 0.86, 4)
    admin_fee_2pct = round(gross_profit * settings.APP_SERVICE_FEE_PCT, 4)
    net_profit = round(gross_profit - admin_fee_2pct, 4)

    # Auto-credit 2% App Service Charge to Admin Account
    admin_vault.total_service_fee_usd = round(admin_vault.total_service_fee_usd + admin_fee_2pct, 4)
    admin_vault.total_trades_taxed += 1
    admin_vault.updated_at = datetime.now(timezone.utc)

    demo_bonus_to_main = 0.0

    if wallet.active_mode == WalletMode.REAL:
        wallet.real_balance_usd = round(wallet.real_balance_usd + net_profit, 4)
    else:
        wallet.demo_balance_usd = round(wallet.demo_balance_usd + net_profit, 4)
        if wallet.demo_bonus_tier == DemoBonusTier.LIFETIME_70:
            demo_bonus_to_main = round(net_profit * 0.70, 4)
            wallet.real_balance_usd = round(wallet.real_balance_usd + demo_bonus_to_main, 4)
            wallet.total_demo_bonus_credited_usd = round(
                wallet.total_demo_bonus_credited_usd + demo_bonus_to_main, 4
            )
        elif wallet.demo_bonus_tier == DemoBonusTier.LIFETIME_50:
            demo_bonus_to_main = round(net_profit * 0.50, 4)
            wallet.real_balance_usd = round(wallet.real_balance_usd + demo_bonus_to_main, 4)
            wallet.total_demo_bonus_credited_usd = round(
                wallet.total_demo_bonus_credited_usd + demo_bonus_to_main, 4
            )
        else:
            wallet.locked_bonus_usd = round(wallet.locked_bonus_usd + net_profit, 4)

    wallet.seal_ledger()
    return gross_profit, admin_fee_2pct, net_profit, demo_bonus_to_main


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    ws_task = asyncio.create_task(sadi_engine.consume_binance_websocket())
    yield
    ws_task.cancel()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.ENGINE_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/v1/auth/session")
async def create_session(req: AuthInitRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Creates a new user with:
    - $10,000,000.00 ($1 Crore) Demo Balance
    - $1.00 USD Welcome Bonus in Main (Real) Balance
    """
    ua = request.headers.get("user-agent", "TelegramMiniApp/1.0")
    ip = request.client.host if request.client else "127.0.0.1"
    dfp = compute_device_fingerprint(ua, ip, req.telegram_id)

    result = await db.execute(select(User).where(User.telegram_id == req.telegram_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(telegram_id=req.telegram_id, username=req.username, device_fingerprint=dfp)
        db.add(user)
        await db.flush()

        wallet = Wallet(
            user_id=user.id,
            active_mode=WalletMode.DEMO,
            demo_balance_usd=settings.DEFAULT_DEMO_BALANCE_USD,  # $10,000,000.00
            real_balance_usd=settings.WELCOME_MAIN_BALANCE_USD,  # $1.00 Welcome Bonus
            locked_bonus_usd=0.00,
            reserve_balance_usd=settings.LOCKED_BASE_WALLET_HOLD_USD,  # $2.00 Mandatory Base Hold
            min_investment_usd=settings.MIN_TRADE_STAKE_USD,           # $1.00 Min Stake
            auto_duration_minutes=settings.MIN_TRADE_DURATION_MINUTES, # 1 Minute Min Duration
            ledger_nonce=1,
            ledger_sha256="",
        )
        wallet.seal_ledger()
        db.add(wallet)
        await db.commit()
        await db.refresh(user)

    token = create_bound_jwt(user.id, user.telegram_id, dfp)
    return {
        "jwt_token": token,
        "demo_balance_usd": settings.DEFAULT_DEMO_BALANCE_USD,
        "welcome_main_balance_usd": settings.WELCOME_MAIN_BALANCE_USD,
        "usd_to_bdt_rate": settings.DEFAULT_USD_TO_BDT_RATE,
    }


@app.post("/api/v1/payments/deposit")
async def submit_deposit(
    req: DepositRequest,
    x_user_id: int = Header(default=1),
    db: AsyncSession = Depends(get_db),
):
    """
    Enforces Minimum Deposit of $2.00 USD (247 BDT) and calculates Demo Profit Bonus Tier:
    - First Deposit $3 to <$5  -> 50% One-Time Demo Profit Bonus
    - First Deposit $5 to <$50 -> 50% Lifetime Demo Profit Bonus
    - Deposit >= $50           -> 70% Lifetime Demo Profit Bonus
    """
    clean_tx = validate_local_gateway_payload(req.gateway, req.tx_id, req.sender_number)
    amount_usd = round(req.amount_bdt / settings.DEFAULT_USD_TO_BDT_RATE, 2)

    if amount_usd < settings.MIN_DEPOSIT_USD:
        min_bdt = round(settings.MIN_DEPOSIT_USD * settings.DEFAULT_USD_TO_BDT_RATE, 2)
        raise HTTPException(
            status_code=400,
            detail=f"Minimum deposit is ${settings.MIN_DEPOSIT_USD:.2f} USD ({min_bdt} BDT).",
        )

    tier_preview = "BASE_HOLD_UNLOCK"
    if amount_usd >= settings.TIER3_LIFETIME_70_MIN_USD:
        tier_preview = "LIFETIME_70_PCT_DEMO_BONUS"
    elif amount_usd >= settings.TIER2_LIFETIME_50_MIN_USD:
        tier_preview = "LIFETIME_50_PCT_DEMO_BONUS"
    elif amount_usd >= settings.TIER1_MIN_DEPOSIT_USD:
        tier_preview = "ONETIME_50_PCT_DEMO_BONUS"

    tx = Transaction(
        user_id=x_user_id,
        tx_type=TransactionType.DEPOSIT,
        gateway=req.gateway.upper(),
        sender_number=req.sender_number,
        gateway_tx_id=clean_tx,
        amount_bdt=req.amount_bdt,
        exchange_rate=settings.DEFAULT_USD_TO_BDT_RATE,
        amount_usd=amount_usd,
        activated_bonus_tier=tier_preview,
        status=TransactionStatus.PENDING,
    )
    db.add(tx)
    await db.commit()
    return {
        "status": "PENDING_ADMIN_APPROVAL",
        "tx_id": clean_tx,
        "amount_bdt": req.amount_bdt,
        "amount_usd": amount_usd,
        "bonus_tier_preview": tier_preview,
    }

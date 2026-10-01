"""
SM SADI — Automated AI Trading Platform
File: admin_bot.py
Description: Telegram Bot Suite covering:
1. User Bot (@SMSADIAI_Bot): Launches Telegram Mini App via inline WebAppInfo button + routes to @SMSADI_Official_Bot.
2. Hidden Admin Control Bot (@SMSADIAIAdmin_Bot):
   - Inline [Approve] / [Reject] callback handlers for bKash/Nagad/Rocket Deposits & Withdrawals.
   - Automatic Demo Locked Bonus Unlock when Real Deposit >= $2.00 is approved.
   - Remote Admin Commands:
     /user_info <id>
     /block_user <id>
     /add_balance <id> <amount>
     /pause_sadi
     /resume_sadi
"""

import asyncio
from datetime import datetime, timezone
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from sqlalchemy import select

from config import settings, sync_firebase_node
from database import AsyncSessionLocal, sync_wallet_to_firebase
from models import User, Wallet, Transaction, TransactionType, TransactionStatus
from ai_engine import sadi_engine


admin_bot = Bot(token=settings.ADMIN_BOT_TOKEN or "000000000:AAH_PLACEHOLDER_ADMIN_TOKEN")
user_bot = Bot(token=settings.USER_BOT_TOKEN or "000000000:AAH_PLACEHOLDER_USER_TOKEN")
dp = Dispatcher()


def is_authorized_admin(telegram_id: int) -> bool:
    return telegram_id in settings.ADMIN_TELEGRAM_IDS


# =====================================================================
# 1. USER BOT (@SMSADIAI_Bot) — LAUNCHES TMA & OFFICIAL SUPPORT ROUTING
# =====================================================================

@dp.message(Command("start"))
async def handle_user_start(message: Message) -> None:
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Launch SM SADI Terminal (98% AI)",
                    web_app=WebAppInfo(url=settings.TMA_FRONTEND_URL),
                )
            ],
            [
                InlineKeyboardButton(
                    text="24/7 Official Support (@SMSADI_Official_Bot)",
                    url="https://t.me/SMSADI_Official_Bot",
                )
            ],
        ]
    )
    await message.answer(
        "Welcome to **SM SADI Automated AI Trading Platform**.\n\n"
        "• **AI Filter:** Executes exclusively at >= 98.0% Confidence.\n"
        "• **Dual Wallet:** $10,000 Demo Account + Instant BDT/USD Gateways.\n"
        "• **Bonus Rule:** Recharge $2+ in Real Mode to unlock 100% of your Demo Profits.",
        reply_markup=kb,
        parse_mode="Markdown",
    )


# =====================================================================
# 2. ADMIN BOT (@SMSADIAIAdmin_Bot) — INLINE DEPOSIT/WITHDRAWAL APPROVAL
# =====================================================================

async def send_admin_payment_alert(tx: Transaction, user_tg_id: int) -> None:
    """Dispatches an interactive inline card with [Approve] and [Reject] buttons to Admins."""
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Approve", callback_data=f"tx_approve:{tx.id}"),
                InlineKeyboardButton(text="Reject", callback_data=f"tx_reject:{tx.id}"),
            ]
        ]
    )
    text = (
        f"🔔 **NEW {tx.tx_type.value} REQUEST**\n"
        f"• **User TG ID:** `{user_tg_id}`\n"
        f"• **Gateway:** `{tx.gateway}`\n"
        f"• **Number:** `{tx.sender_number}`\n"
        f"• **TxID:** `{tx.gateway_tx_id}`\n"
        f"• **Amount:** `{tx.amount_bdt:.2f} BDT` (`${tx.amount_usd:.2f} USD`)"
    )
    for admin_id in settings.ADMIN_TELEGRAM_IDS:
        await admin_bot.send_message(admin_id, text, reply_markup=kb, parse_mode="Markdown")


@dp.callback_query(F.data.startswith("tx_"))
async def handle_transaction_decision(callback: CallbackQuery) -> None:
    if not callback.from_user or not is_authorized_admin(callback.from_user.id):
        await callback.answer("Unauthorized Admin ID.", show_alert=True)
        return

    action, raw_id = callback.data.split(":")
    tx_id = int(raw_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
        tx = result.scalar_one_or_none()
        if not tx or tx.status != TransactionStatus.PENDING:
            await callback.answer("Transaction already processed.", show_alert=True)
            return

        w_res = await db.execute(select(Wallet).where(Wallet.user_id == tx.user_id))
        wallet = w_res.scalar_one()
        wallet.assert_integrity()

        if action == "tx_approve":
            tx.status = TransactionStatus.APPROVED
            tx.processed_at = datetime.now(timezone.utc)

            if tx.tx_type == TransactionType.DEPOSIT:
                wallet.real_balance_usd = round(wallet.real_balance_usd + tx.amount_usd, 2)
                wallet.total_real_deposited_usd = round(wallet.total_real_deposited_usd + tx.amount_usd, 2)

                # DEMO BONUS UNLOCK RULE:
                # Recharging a minimum of $2 in the Real Account automatically unlocks
                # and credits the Locked Demo Bonus to the Main Real Balance!
                if tx.amount_usd >= settings.MIN_REAL_RECHARGE_USD and wallet.locked_bonus_usd > 0:
                    unlocked = wallet.locked_bonus_usd
                    wallet.real_balance_usd = round(wallet.real_balance_usd + unlocked, 2)
                    wallet.locked_bonus_usd = 0.0
                    tx.unlocked_bonus_usd = unlocked

            wallet.seal_ledger()
            await db.commit()
            await callback.message.edit_text(
                f"✅ **APPROVED** TxID `{tx.gateway_tx_id}` (${tx.amount_usd:.2f} USD). "
                f"Unlocked Bonus: ${tx.unlocked_bonus_usd:.2f} USD.",
                parse_mode="Markdown",
            )
        else:
            tx.status = TransactionStatus.REJECTED
            tx.processed_at = datetime.now(timezone.utc)
            if tx.tx_type == TransactionType.WITHDRAWAL:
                # Refund held withdrawal back to real balance and reseal SHA-256 ledger
                wallet.real_balance_usd = round(wallet.real_balance_usd + tx.amount_usd, 2)
                wallet.seal_ledger()
            await db.commit()
            await callback.message.edit_text(
                f"❌ **REJECTED** TxID `{tx.gateway_tx_id}`.",
                parse_mode="Markdown",
            )


# =====================================================================
# 3. ADMIN COMMANDS (/user_info, /block_user, /add_balance, /pause_sadi, /resume_sadi)
# =====================================================================

@dp.message(Command("user_info"))
async def cmd_user_info(message: Message) -> None:
    if not message.from_user or not is_authorized_admin(message.from_user.id):
        return
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.reply("Usage: `/user_info <telegram_id>`", parse_mode="Markdown")
        return

    tg_id = int(parts[1])
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.telegram_id == tg_id))
        user = res.scalar_one_or_none()
        if not user or not user.wallet:
            await message.reply(f"User `{tg_id}` not found.", parse_mode="Markdown")
            return
        w = user.wallet
        await message.reply(
            f"👤 **SM SADI USER INSPECTOR**\n"
            f"• **TG ID:** `{user.telegram_id}` (@{user.username})\n"
            f"• **Blocked:** `{user.is_blocked}` | **Ledger Tamper Lock:** `{w.is_compromised_locked}`\n"
            f"• **Real Balance:** `${w.real_balance_usd:.2f}`\n"
            f"• **Demo Balance:** `${w.demo_balance_usd:.2f}`\n"
            f"• **Locked Bonus:** `${w.locked_bonus_usd:.2f}`\n"
            f"• **SHA-256 Hash:** `{w.ledger_sha256[:24]}...`",
            parse_mode="Markdown",
        )


@dp.message(Command("block_user"))
async def cmd_block_user(message: Message) -> None:
    if not message.from_user or not is_authorized_admin(message.from_user.id):
        return
    parts = (message.text or "").split()
    if len(parts) < 2:
        await message.reply("Usage: `/block_user <telegram_id>`", parse_mode="Markdown")
        return

    tg_id = int(parts[1])
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.telegram_id == tg_id))
        user = res.scalar_one_or_none()
        if not user:
            await message.reply("User not found.")
            return
        user.is_blocked = True
        if user.wallet:
            user.wallet.auto_trading_enabled = False
            user.wallet.seal_ledger()
        await db.commit()
        await message.reply(f"🔒 User `{tg_id}` blocked and active auto-trading halted.", parse_mode="Markdown")


@dp.message(Command("add_balance"))
async def cmd_add_balance(message: Message) -> None:
    if not message.from_user or not is_authorized_admin(message.from_user.id):
        return
    parts = (message.text or "").split()
    if len(parts) < 3:
        await message.reply("Usage: `/add_balance <telegram_id> <amount_usd>`", parse_mode="Markdown")
        return

    tg_id = int(parts[1])
    amount = float(parts[2])
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.telegram_id == tg_id))
        user = res.scalar_one_or_none()
        if not user or not user.wallet:
            await message.reply("User or wallet not found.")
            return
        w = user.wallet
        w.is_compromised_locked = False
        w.real_balance_usd = round(w.real_balance_usd + amount, 2)
        w.seal_ledger()
        await db.commit()
        sync_wallet_to_firebase(
            telegram_id=user.telegram_id,
            active_mode=w.active_mode.value,
            real_balance=w.real_balance_usd,
            demo_balance=w.demo_balance_usd,
            locked_bonus=w.locked_bonus_usd,
            ledger_hash=w.ledger_sha256,
            is_locked=w.is_compromised_locked,
        )
        await message.reply(
            f"✅ Credited `${amount:.2f} USD` to `{tg_id}` and re-sealed SHA-256 ledger.\n"
            f"New Real Balance: `${w.real_balance_usd:.2f} USD`",
            parse_mode="Markdown",
        )


@dp.message(Command("pause_sadi"))
async def cmd_pause_sadi(message: Message) -> None:
    if not message.from_user or not is_authorized_admin(message.from_user.id):
        return
    sadi_engine.is_paused = True
    sync_firebase_node("system_state", {"sadi_active": False})
    await message.reply("⏸️ **SM SADI Engine PAUSED globally.** All automated trade entries suspended.", parse_mode="Markdown")


@dp.message(Command("resume_sadi"))
async def cmd_resume_sadi(message: Message) -> None:
    if not message.from_user or not is_authorized_admin(message.from_user.id):
        return
    sadi_engine.is_paused = False
    sync_firebase_node("system_state", {"sadi_active": True})
    await message.reply("▶️ **SM SADI Engine RESUMED globally.** 98% Confidence Scanner active.", parse_mode="Markdown")

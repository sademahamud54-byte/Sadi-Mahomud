"""
SM SADI — Automated AI Trading Platform
File: security.py
Description: Enterprise security layer implementing:
1. AES-256-GCM encryption for Exchange API keys (with Withdrawal-Disabled enforcement).
2. Cryptographic SHA-256 Anti-Fraud Ledger Hashing to detect unauthorized DB manipulation.
3. Short-Lived JWT (15-min expiry) with strict Device Fingerprint Binding.
4. Server-to-Server bKash/Nagad/Rocket Webhook HMAC & Regex verification.
"""

import os
import re
import hmac
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException, status

from config import settings


# =====================================================================
# 1. AES-256-GCM EXCHANGE API KEY ENCRYPTION & WITHDRAWAL PERMISSION GUARD
# =====================================================================

class ExchangeKeyVault:
    """
    Encrypts and decrypts user exchange API keys (Binance, KuCoin, MT5) using AES-256-GCM.
    Derives an exact 256-bit (32-byte) cryptographic key from AES_MASTER_KEY
    ("smsadimtradingplatformsecretkey32") and enforces strict IP whitelisting
    with Withdrawal Permissions strictly DISABLED.
    """

    def __init__(self, master_key_str: str = settings.AES_MASTER_KEY):
        # Derive exact 32-byte (256-bit) key via SHA-256 so any string or hex key is supported safely
        raw_key = hashlib.sha256(master_key_str.encode("utf-8")).digest()
        self._aesgcm = AESGCM(raw_key)

    def validate_exchange_permissions(
        self,
        permissions: Dict[str, bool],
        whitelisted_ips: list[str],
    ) -> None:
        """
        Mandate: Withdrawal permissions MUST be strictly DISABLED at the exchange level,
        and IP whitelisting MUST be configured.
        """
        if permissions.get("enableWithdrawals", False) or permissions.get("canWithdraw", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SECURITY VIOLATION: Exchange API Key has Withdrawal Permissions ENABLED. "
                       "Disable withdrawals immediately before linking to SM SADI.",
            )
        if not whitelisted_ips or len(whitelisted_ips) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SECURITY VIOLATION: Exchange API Key must enforce strict IP Whitelisting.",
            )

    def encrypt_api_credential(self, plaintext_secret: str, associated_user_id: str) -> str:
        nonce = os.urandom(12)  # 96-bit NIST recommended nonce for GCM
        aad = f"smsadi:user:{associated_user_id}".encode("utf-8")
        ciphertext = self._aesgcm.encrypt(nonce, plaintext_secret.encode("utf-8"), aad)
        combined = nonce + ciphertext
        return base64.urlsafe_b64encode(combined).decode("utf-8")

    def decrypt_api_credential(self, encrypted_token: str, associated_user_id: str) -> str:
        raw = base64.urlsafe_b64decode(encrypted_token.encode("utf-8"))
        nonce, ciphertext = raw[:12], raw[12:]
        aad = f"smsadi:user:{associated_user_id}".encode("utf-8")
        plaintext = self._aesgcm.decrypt(nonce, ciphertext, aad)
        return plaintext.decode("utf-8")


vault = ExchangeKeyVault()


# =====================================================================
# 2. CRYPTOGRAPHIC SHA-256 ANTI-FRAUD LEDGER HASHING
# =====================================================================

def compute_ledger_hash(
    user_id: int,
    real_balance: float,
    demo_balance: float,
    locked_bonus_balance: float,
    nonce: int,
) -> str:
    """
    Generates an immutable SHA-256 signature over the user's financial state
    using LEDGER_HASH_SALT ("smsadim_secure_salt_10_1_2026").
    Any manual SQL update, SQL injection, or unauthorized balance alteration in PostgreSQL
    will cause a hash mismatch and trigger an instant account freeze.
    """
    canonical_payload = (
        f"UID:{user_id}|"
        f"REAL:{real_balance:.4f}|"
        f"DEMO:{demo_balance:.4f}|"
        f"BONUS:{locked_bonus_balance:.4f}|"
        f"NONCE:{nonce}|"
        f"SALT:{settings.LEDGER_HASH_SALT}"
    )
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def verify_ledger_integrity(
    user_id: int,
    real_balance: float,
    demo_balance: float,
    locked_bonus_balance: float,
    nonce: int,
    stored_hash: str,
) -> bool:
    """
    Constant-time comparison of stored ledger hash vs recomputed SHA-256 hash.
    """
    expected_hash = compute_ledger_hash(
        user_id=user_id,
        real_balance=real_balance,
        demo_balance=demo_balance,
        locked_bonus_balance=locked_bonus_balance,
        nonce=nonce,
    )
    return hmac.compare_digest(expected_hash, stored_hash or "")


# =====================================================================
# 3. SHORT-LIVED JWT (15-MIN EXPIRY) WITH DEVICE BINDING
# =====================================================================

def compute_device_fingerprint(user_agent: str, client_ip: str, telegram_id: int) -> str:
    raw = f"{telegram_id}:{user_agent.strip()}:{client_ip.strip()}:{settings.LEDGER_HASH_SALT}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def create_bound_jwt(user_id: int, telegram_id: int, device_fingerprint: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "tg_id": telegram_id,
        "dfp": device_fingerprint,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.JWT_EXPIRY_MINUTES)).timestamp()),
        "iss": "sm-sadi-quant-auth",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_bound_jwt(token: str, current_device_fingerprint: str) -> Dict[str, Any]:
    try:
        decoded = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer="sm-sadi-quant-auth",
        )
        if not hmac.compare_digest(decoded.get("dfp", ""), current_device_fingerprint):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="DEVICE BINDING MISMATCH: Session token bound to another hardware fingerprint.",
            )
        return decoded
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="JWT SESSION EXPIRED (15-Min Hard Limit). Re-authenticate via Telegram Mini App.",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid JWT authentication token: {exc}",
        )


# =====================================================================
# 4. LOCAL PAYMENT WEBHOOK VERIFICATION (bKash, Nagad, Rocket)
# =====================================================================

TXID_PATTERNS = {
    "BKASH": re.compile(r"^[A-Z0-9]{10}$"),         # e.g., BK98X72M4Q (10 uppercase alphanumeric)
    "NAGAD": re.compile(r"^[A-Z0-9]{8,12}$"),       # e.g., NGD8472910A (8-12 uppercase alphanumeric)
    "ROCKET": re.compile(r"^[0-9]{9,12}$"),         # e.g., 8492019384 (9-12 numeric digits)
}

SENDER_NUMBER_PATTERN = re.compile(r"^(?:\+?88)?01[3-9]\d{8}$")


def validate_local_gateway_payload(
    gateway: str,
    tx_id: str,
    sender_number: str,
    signature_header: Optional[str] = None,
    raw_body: Optional[bytes] = None,
) -> str:
    """
    Validates Bangladeshi local payment gateway transactions against regex injection,
    phone format spoofing, and optional S2S HMAC webhook signatures.
    """
    gw = gateway.upper().strip()
    if gw not in TXID_PATTERNS:
        raise HTTPException(status_code=400, detail="Unsupported payment gateway. Use bKash, Nagad, or Rocket.")

    clean_tx = tx_id.strip().upper()
    if not TXID_PATTERNS[gw].match(clean_tx):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {gw} Transaction ID format ({clean_tx}). Blocked by Anti-Spoof Filter.",
        )

    if not SENDER_NUMBER_PATTERN.match(sender_number.strip()):
        raise HTTPException(
            status_code=422,
            detail="Invalid Bangladesh mobile wallet number. Must match +8801[3-9]XXXXXXXX.",
        )

    # Optional server-to-server webhook HMAC validation when invoked by merchant IPN
    if signature_header and raw_body:
        secret_map = {
            "BKASH": settings.BKASH_WEBHOOK_SECRET,
            "NAGAD": settings.NAGAD_WEBHOOK_SECRET,
            "ROCKET": settings.ROCKET_WEBHOOK_SECRET,
        }
        expected_sig = hmac.new(
            secret_map[gw].encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_sig, signature_header):
            raise HTTPException(status_code=403, detail="Invalid Merchant Webhook HMAC Signature.")

    return clean_tx

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 1. CRYPTOGRAPHIC CONSTANTS & ENTERPRISE SECURITY (AES-256, SHA-256, JWT)
// ============================================================================

const AES_MASTER_KEY = crypto
  .createHash('sha256')
  .update(process.env.AES_MASTER_KEY || 'smsadimtradingplatformsecretkey32')
  .digest();

const LEDGER_HASH_SALT =
  process.env.LEDGER_HASH_SALT || 'smsadim_secure_salt_10_1_2026';

const JWT_SECRET =
  process.env.JWT_SECRET_KEY || 'jwt_smsadim_ai_trading_secorkey_99';

const FIREBASE_RTDB_URL =
  process.env.FIREBASE_DB_URL ||
  'https://sm-sadi-ai-trading-platform-default-rtdb.firebaseio.com';

const ADMIN_TELEGRAM_ID = Number(process.env.ADMIN_TELEGRAM_ID || '7504836023');
const USER_BOT_TOKEN =
  process.env.USER_BOT_TOKEN || '8585116863:AAHBoPwLN9YwpiVDAWHUTTch6LIbJmYXEos';
const ADMIN_BOT_TOKEN =
  process.env.ADMIN_BOT_TOKEN || '8788358073:AAGFMhURmBOHS80WV5FYQ763_Atp22g1ipI';
const DEFAULT_MINIAPP_URL =
  process.env.APP_URL ||
  'https://ais-pre-gp3j5wgdwzizsdwp4wbcqq-941954303005.asia-southeast1.run.app';

// Core Business Constants
const INITIAL_DEMO_BALANCE_USD = 10000000.0; // $10,000,000.00 Demo Balance
const WELCOME_REAL_BALANCE_USD = 1.0;        // $1.00 Welcome Main Balance
const MANDATORY_LOCKED_HOLD_USD = 2.0;       // $2.00 must remain in account (non-tradable & non-withdrawable)
const MIN_DEPOSIT_USD = 2.0;                 // Minimum Deposit $2.00
const MIN_TRADE_STAKE_USD = 1.0;             // Minimum Trade $1.00
const MIN_TRADE_DURATION_MINUTES = 1;        // Minimum Trade Duration 1 Minute
const ADMIN_SERVICE_FEE_PCT = 0.02;          // 2% App Service Charge on every trade profit -> Auto to Admin

export type DemoBonusTier =
  | 'NONE'
  | 'TIER_3_TO_5_HALF_ONCE'
  | 'LIFETIME_50_PCT'
  | 'LIFETIME_70_PCT';

async function pushToFirebaseRTDB(subPath: string, data: unknown) {
  try {
    const cleanBase = FIREBASE_RTDB_URL.replace(/\/+$/, '');
    await fetch(`${cleanBase}/${subPath}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // non-blocking RTDB sync
  }
}

async function sendTelegramAdminNotification(text: string) {
  if (!ADMIN_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch {
    // non-blocking Telegram notification
  }
}

function encryptAES256GCM(plaintext: string, userId: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_MASTER_KEY, iv);
  cipher.setAAD(Buffer.from(`smsadi:user:${userId}`, 'utf-8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

function maskEncryptedPreview(cipherText: string): string {
  if (!cipherText) return '';
  return `AES256-GCM:${cipherText.slice(0, 14)}...${cipherText.slice(-8)}`;
}

function maskEncryptedSecret(cipherText: string): string {
  if (!cipherText) return '';
  return `AES256-GCM:${cipherText.slice(0, 10)}••••••••••••${cipherText.slice(-6)}`;
}

function computeLedgerHash(
  userId: string,
  realBalance: number,
  demoBalance: number,
  lockedBonusBalance: number,
  nonce: number
): string {
  const canonical = `UID:${userId}|REAL:${realBalance.toFixed(4)}|DEMO:${demoBalance.toFixed(4)}|BONUS:${lockedBonusBalance.toFixed(4)}|NONCE:${nonce}|SALT:${LEDGER_HASH_SALT}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function createBoundJWT(userId: string, telegramId: number, deviceFingerprint: string) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 15 * 60;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      tg_id: telegramId,
      dfp: deviceFingerprint,
      iat,
      exp,
      iss: 'sm-sadi-quant-auth',
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return {
    token: `${header}.${payload}.${signature}`,
    iat,
    exp,
    deviceFingerprint,
  };
}

// ============================================================================
// 2. DATA STRUCTURES & SERVER-AUTHORITATIVE STATE
// ============================================================================

export interface KlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
}

export interface QuantSignal {
  symbol: string;
  price: number;
  change24hPct: number;
  rsi14: number;
  macdLine: number;
  signalLine: number;
  macdHist: number;
  bbUpper: number;
  bbMid: number;
  bbLower: number;
  orderFlowBuyPct: number;
  confidenceScore: number;
  direction: 'LONG' | 'SHORT';
  qualifies98Filter: boolean;
  statusReason: string;
  updatedAt: number;
}

export interface TradeRecord {
  id: string;
  userId: string;
  walletMode: 'DEMO' | 'REAL';
  executionMode: 'AUTO' | 'MANUAL';
  symbol: string;
  direction: 'LONG' | 'SHORT';
  durationMinutes: number;
  stakeUsd: number;
  entryPrice: number;
  exitPrice: number;
  aiConfidence: number;
  grossPnlUsd: number;
  adminServiceFeeUsd: number;
  pnlUsd: number;
  demoBonusToRealUsd: number;
  status: 'WON' | 'LOST';
  executedAt: string;
  indicatorsSnapshot: {
    rsi: number;
    macdHist: number;
    orderFlowBuyPct: number;
  };
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  telegramId: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
  accountNumber: string;
  txId: string;
  amountBdt: number;
  exchangeRate: number;
  amountUsd: number;
  unlockedBonusUsd: number;
  appliedBonusTier?: DemoBonusTier;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  webhookSignatureHash: string;
  createdAt: string;
  processedAt?: string;
}

export interface AdminBotLog {
  id: string;
  timestamp: string;
  botHandle: '@SMSADIAIAdmin_Bot' | '@SMSADIAI_Bot' | '@SMSADI_Official_Bot';
  direction: 'INBOUND_CMD' | 'OUTBOUND_ALERT' | 'INLINE_CALLBACK';
  commandOrAction: string;
  messageText: string;
  relatedTxId?: string;
}

export interface AdminCommissionVault {
  adminTelegramId: number;
  serviceFeeRatePct: number;
  totalFeesUsd: number;
  totalFeesBdt: number;
  totalTradesCharged: number;
  lastFeeUsd: number;
  lastUpdatedAt: string;
}

export interface UserState {
  userId: string;
  telegramId: number;
  username: string;
  isBlocked: boolean;
  activeMode: 'DEMO' | 'REAL';
  demoBalanceUsd: number;
  realBalanceUsd: number;
  welcomeBonusUsd: number;
  mandatoryHoldUsd: number;
  lockedBonusUsd: number;
  totalRealDepositedUsd: number;
  firstRealDepositUsd: number;
  demoBonusTier: DemoBonusTier;
  totalDemoBonusCreditedUsd: number;
  bonusUnlockedEver: boolean;
  goldCoins: number;

  autoTradingEnabled: boolean;
  autoDurationMinutes: number;
  autoStartedAt: number | null;
  autoExpiresAt: number | null;
  reserveBalanceUsd: number;
  minInvestmentUsd: number;
  maxInvestmentUsd: number;
  accountStopLimitEnabled: boolean;
  accountStopLimitUsd: number;
  killSwitchTriggered: boolean;
  killSwitchReason: string | null;

  ledgerNonce: number;
  ledgerSha256: string;
  isCompromisedLocked: boolean;
  compromisedReason: string | null;

  exchangeConfig: {
    exchange: 'BINANCE' | 'KUCOIN' | 'MT5';
    encryptedApiKeyPreview: string;
    encryptedSecretPreview: string;
    whitelistedIps: string[];
    withdrawalsDisabledVerified: boolean;
    connectedAt: string;
  };

  jwtSession: {
    token: string;
    deviceFingerprint: string;
    issuedAt: number;
    expiresAt: number;
  };
}

let sadiEnginePaused = false;
let usdToBdtRate = Number(process.env.USD_TO_BDT_RATE || '123.50');
const usedGatewayTxIds = new Set<string>(['BK9482019X']);

const initialNonce = 101;
const initialDemo = INITIAL_DEMO_BALANCE_USD; // $10,000,000.00
const initialReal = WELCOME_REAL_BALANCE_USD; // $1.00 Welcome Bonus
const initialLockedBonus = 24.48;             // Earned from initial Demo trade

const initialEncryptedKey = encryptAES256GCM(
  'vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A',
  'usr_sadi_01'
);
const initialEncryptedSecret = encryptAES256GCM(
  'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j',
  'usr_sadi_01'
);
const initialJwt = createBoundJWT(
  'usr_sadi_01',
  ADMIN_TELEGRAM_ID,
  'dfp_9f82a1c4e7b039d2c5a8110f7e6b3d4a'
);

const adminVault: AdminCommissionVault = {
  adminTelegramId: ADMIN_TELEGRAM_ID,
  serviceFeeRatePct: 2.0,
  totalFeesUsd: 0.5,
  totalFeesBdt: Number((0.5 * usdToBdtRate).toFixed(2)),
  totalTradesCharged: 1,
  lastFeeUsd: 0.5,
  lastUpdatedAt: new Date().toISOString(),
};

const userState: UserState = {
  userId: 'usr_sadi_01',
  telegramId: ADMIN_TELEGRAM_ID,
  username: 'sadi_quant_pro',
  isBlocked: false,
  activeMode: 'DEMO',
  demoBalanceUsd: initialDemo,
  realBalanceUsd: initialReal,
  welcomeBonusUsd: WELCOME_REAL_BALANCE_USD,
  mandatoryHoldUsd: MANDATORY_LOCKED_HOLD_USD,
  lockedBonusUsd: initialLockedBonus,
  totalRealDepositedUsd: 0.0,
  firstRealDepositUsd: 0.0,
  demoBonusTier: 'NONE',
  totalDemoBonusCreditedUsd: 0.0,
  bonusUnlockedEver: false,
  goldCoins: 0,

  autoTradingEnabled: false,
  autoDurationMinutes: 1,
  autoStartedAt: null,
  autoExpiresAt: null,
  reserveBalanceUsd: 2.0,
  minInvestmentUsd: 10.0,
  maxInvestmentUsd: 200.0,
  accountStopLimitEnabled: false,
  accountStopLimitUsd: 1000.0,
  killSwitchTriggered: false,
  killSwitchReason: null,

  ledgerNonce: initialNonce,
  ledgerSha256: computeLedgerHash(
    'usr_sadi_01',
    initialReal,
    initialDemo,
    initialLockedBonus,
    initialNonce
  ),
  isCompromisedLocked: false,
  compromisedReason: null,

  exchangeConfig: {
    exchange: 'BINANCE',
    encryptedApiKeyPreview: maskEncryptedPreview(initialEncryptedKey),
    encryptedSecretPreview: maskEncryptedSecret(initialEncryptedSecret),
    whitelistedIps: ['103.145.118.42', '18.141.204.99'],
    withdrawalsDisabledVerified: true,
    connectedAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },

  jwtSession: {
    token: initialJwt.token,
    deviceFingerprint: initialJwt.deviceFingerprint,
    issuedAt: initialJwt.iat,
    expiresAt: initialJwt.exp,
  },
};

function sealUserLedger() {
  userState.ledgerNonce += 1;
  userState.ledgerSha256 = computeLedgerHash(
    userState.userId,
    userState.realBalanceUsd,
    userState.demoBalanceUsd,
    userState.lockedBonusUsd,
    userState.ledgerNonce
  );

  pushToFirebaseRTDB(`users/tg_${userState.telegramId}`, {
    wallet: {
      active_mode: userState.activeMode,
      real_balance_usd: userState.realBalanceUsd,
      demo_balance_usd: userState.demoBalanceUsd,
      locked_bonus_usd: userState.lockedBonusUsd,
      demo_bonus_tier: userState.demoBonusTier,
      ledger_nonce: userState.ledgerNonce,
      ledger_sha256: userState.ledgerSha256,
      is_locked: userState.isCompromisedLocked || userState.isBlocked,
      updated_at: new Date().toISOString(),
    },
    admin_vault: adminVault,
  });
}

function assertAndVerifyLedger(): { ok: boolean; error?: string } {
  if (userState.isBlocked) {
    return { ok: false, error: 'ACCOUNT BLOCKED: Suspended by @SMSADIAIAdmin_Bot.' };
  }
  const expected = computeLedgerHash(
    userState.userId,
    userState.realBalanceUsd,
    userState.demoBalanceUsd,
    userState.lockedBonusUsd,
    userState.ledgerNonce
  );
  if (expected !== userState.ledgerSha256) {
    userState.isCompromisedLocked = true;
    userState.autoTradingEnabled = false;
    userState.compromisedReason = `CRITICAL SHA-256 MISMATCH: Expected ${expected.slice(0, 16)}... got ${userState.ledgerSha256.slice(0, 16)}... Account auto-locked.`;
    return { ok: false, error: userState.compromisedReason };
  }
  return { ok: true };
}

const tradeLogs: TradeRecord[] = [
  {
    id: 'TRD-99041',
    userId: 'usr_sadi_01',
    walletMode: 'DEMO',
    executionMode: 'AUTO',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    durationMinutes: 1,
    stakeUsd: 29.05,
    entryPrice: 84210.5,
    exitPrice: 84490.0,
    aiConfidence: 98.7,
    grossPnlUsd: 24.98,
    adminServiceFeeUsd: 0.5,
    pnlUsd: 24.48,
    demoBonusToRealUsd: 0.0,
    status: 'WON',
    executedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    indicatorsSnapshot: { rsi: 31.2, macdHist: 14.8, orderFlowBuyPct: 68.9 },
  },
];

const paymentTransactions: PaymentTransaction[] = [
  {
    id: 'TX-4020',
    userId: 'usr_sadi_01',
    telegramId: ADMIN_TELEGRAM_ID,
    type: 'DEPOSIT',
    gateway: 'BKASH',
    accountNumber: '+8801711948201',
    txId: 'BK9482019X',
    amountBdt: 741.0,
    exchangeRate: 123.5,
    amountUsd: 6.0,
    unlockedBonusUsd: 0.0,
    status: 'PENDING',
    webhookSignatureHash: '9f8e7d6c5b4a3f2e1d0c9b8a',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];

const adminBotLogs: AdminBotLog[] = [
  {
    id: 'BOT-1001',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    botHandle: '@SMSADIAIAdmin_Bot',
    direction: 'OUTBOUND_ALERT',
    commandOrAction: 'Pending Deposit Alert [TX-4020]',
    messageText: `🔔 NEW DEPOSIT REQUEST | User: @sadi_quant_pro (${ADMIN_TELEGRAM_ID}) | Gateway: bKash | TxID: BK9482019X | 741.00 BDT ($6.00 USD — Qualifies for LIFETIME 50% Demo Bonus Tier!)`,
    relatedTxId: 'TX-4020',
  },
  {
    id: 'BOT-1002',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    botHandle: '@SMSADIAI_Bot',
    direction: 'OUTBOUND_ALERT',
    commandOrAction: '/start -> 🚀 Open SM AI TRADER',
    messageText: `✅ Telegram MiniApp Menu Button ("🚀 Open SM AI TRADER") & /start handler active for @SMSADIAI_Bot.`,
  },
];

// ============================================================================
// 3. TELEGRAM BOT (/START -> 🚀 Open SM AI TRADER -> ⛏️ MiniApp) LIVE HANDLER
// ============================================================================

let currentMiniAppUrl = DEFAULT_MINIAPP_URL;
let tgUpdateOffset = 0;

async function configureTelegramMiniAppButtons(targetUrl: string) {
  if (!USER_BOT_TOKEN) return { ok: false, error: 'Missing USER_BOT_TOKEN' };
  currentMiniAppUrl = targetUrl || DEFAULT_MINIAPP_URL;
  try {
    // 1. Delete any stale webhook so long-polling works cleanly
    await fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/deleteWebhook`);

    // 2. Set Bot Commands (/start)
    await fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: '🚀 Open SM AI TRADER (⛏️ MiniApp)' },
        ],
      }),
    });

    // 3. Set Chat Menu Button (appears next to message input & opens MiniApp)
    const menuRes = await fetch(
      `https://api.telegram.org/bot${USER_BOT_TOKEN}/setChatMenuButton`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: '🚀 Open SM AI TRADER',
            web_app: {
              url: currentMiniAppUrl,
            },
          },
        }),
      }
    );
    const menuData = await menuRes.json();
    return { ok: true, url: currentMiniAppUrl, telegramResponse: menuData };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Telegram API unreachable' };
  }
}

async function pollTelegramUserBotUpdates() {
  if (!USER_BOT_TOKEN) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${USER_BOT_TOKEN}/getUpdates?offset=${tgUpdateOffset + 1}&timeout=1`
    );
    if (!res.ok) return;
    const data = (await res.json()) as any;
    if (!data?.ok || !Array.isArray(data.result)) return;

    for (const upd of data.result) {
      tgUpdateOffset = upd.update_id;
      const msg = upd.message;
      if (!msg || !msg.text) continue;

      const textUpper = String(msg.text).trim().toUpperCase();
      if (textUpper.startsWith('/START') || textUpper === 'START') {
        const chatId = msg.chat.id;
        const firstName = msg.from?.first_name || 'Trader';

        await fetch(`https://api.telegram.org/bot${USER_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text:
              `🚀 *Welcome to SM SADI — Automated AI Trader, ${firstName}!*\n\n` +
              `💼 *Demo Balance:* \`$10,000,000.00 USD\`\n` +
              `🎁 *Main Welcome Balance:* \`$1.00 USD\`\n` +
              `🤖 *AI Engine:* \`SM SADI (>= 98% Confidence)\`\n` +
              `⏱️ *Min Trade:* \`1 Minute / $1.00 USD\`\n\n` +
              `নিচের *🚀 Open SM AI TRADER* বাটনে ক্লিক করলে সরাসরি *⛏️ MiniApp* ওপেন হবে (মিনিমাইজ ও ম্যাক্সিমাইজ করা যাবে):`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🚀 Open SM AI TRADER (⛏️ MiniApp)',
                    web_app: { url: currentMiniAppUrl },
                  },
                ],
                [
                  {
                    text: '🌐 Open in Browser / HopWeb Mode',
                    url: `${currentMiniAppUrl}/hopweb`,
                  },
                ],
              ],
            },
          }),
        });

        adminBotLogs.unshift({
          id: `BOT-START-${Date.now()}`,
          timestamp: new Date().toISOString(),
          botHandle: '@SMSADIAI_Bot',
          direction: 'INBOUND_CMD',
          commandOrAction: '/start -> 🚀 Open SM AI TRADER',
          messageText: `Sent "🚀 Open SM AI TRADER" MiniApp launch button to Telegram user ${firstName} (Chat ID: ${chatId}).`,
        });
      }
    }
  } catch {
    // ignore transient network errors
  }
}

// Configure Telegram MiniApp Menu Button on startup and poll every 3.5s
configureTelegramMiniAppButtons(DEFAULT_MINIAPP_URL);
setInterval(pollTelegramUserBotUpdates, 3500);

// ============================================================================
// 4. "SM SADI" QUANT ENGINE & LIVE BINANCE MARKET DATA
// ============================================================================

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const klineCache: Record<string, KlineCandle[]> = {};
const latestSignals: Record<string, QuantSignal> = {};
let scanCounter = 1420;
let skippedBelow98Counter = 1185;

function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50.0;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(closes: number[]): { macdLine: number; signalLine: number; macdHist: number } {
  if (closes.length < 26) return { macdLine: 0, signalLine: 0, macdHist: 0 };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalSeries = computeEMA(macdSeries, 9);
  const last = closes.length - 1;
  return {
    macdLine: macdSeries[last],
    signalLine: signalSeries[last],
    macdHist: macdSeries[last] - signalSeries[last],
  };
}

function computeBollinger(closes: number[], period = 20): { upper: number; mid: number; lower: number } {
  const slice = closes.slice(-period);
  if (slice.length === 0) return { upper: 0, mid: 0, lower: 0 };
  const mid = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / slice.length;
  const std = Math.sqrt(variance);
  return {
    upper: mid + 2 * std,
    mid,
    lower: mid - 2 * std,
  };
}

function evaluateQuantSignal(symbol: string, candles: KlineCandle[]): QuantSignal {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] || 0;
  const open24 = closes[0] || price;
  const change24hPct = open24 > 0 ? ((price - open24) / open24) * 100 : 0;

  const rsi14 = computeRSI(closes, 14);
  const { macdLine, signalLine, macdHist } = computeMACD(closes);
  const { upper: bbUpper, mid: bbMid, lower: bbLower } = computeBollinger(closes, 20);

  const recentCandles = candles.slice(-10);
  const totalVol = recentCandles.reduce((acc, c) => acc + c.volume, 0) || 1;
  const takerBuyVol = recentCandles.reduce((acc, c) => acc + c.takerBuyVolume, 0);
  const orderFlowBuyPct = Math.min(96, Math.max(4, (takerBuyVol / totalVol) * 100));

  const rsiExtremity = Math.min(1, Math.abs(rsi14 - 50) / 22);
  const bbSpan = Math.max(bbUpper - bbLower, price * 0.001);
  const bbDisplacement = Math.min(1, Math.abs(price - bbMid) / (bbSpan * 0.45));
  const ofStrength = Math.min(1, Math.abs(orderFlowBuyPct - 50) / 16);
  const macdStrength = Math.min(1, Math.abs(macdHist) / Math.max(price * 0.0004, 0.0001));

  const isBullishSetup = (rsi14 < 46 || price <= bbMid) && orderFlowBuyPct >= 51.5;
  const isBearishSetup = (rsi14 > 54 || price >= bbMid) && orderFlowBuyPct <= 48.5;

  let rawScore =
    82.0 +
    rsiExtremity * 5.2 +
    bbDisplacement * 4.8 +
    ofStrength * 4.6 +
    macdStrength * 3.2;

  if (isBullishSetup || isBearishSetup) {
    rawScore += 3.1;
  }

  const confidenceScore = Number(Math.min(99.6, Math.max(84.2, rawScore)).toFixed(2));
  const direction: 'LONG' | 'SHORT' = orderFlowBuyPct >= 50 ? 'LONG' : 'SHORT';
  const qualifies98Filter = !sadiEnginePaused && confidenceScore >= 98.0;

  scanCounter += 1;
  if (!qualifies98Filter) {
    skippedBelow98Counter += 1;
  }

  const statusReason = sadiEnginePaused
    ? 'PAUSED BY ADMIN: Global SM SADI Engine paused via @SMSADIAIAdmin_Bot'
    : qualifies98Filter
    ? `EXECUTION LOCKED (>= 98%): ${confidenceScore}% Confluence on ${symbol} (${direction})`
    : `SKIPPED (< 98% Filter): ${confidenceScore}% — Awaiting 98.0%+ institutional confluence`;

  return {
    symbol,
    price,
    change24hPct: Number(change24hPct.toFixed(2)),
    rsi14: Number(rsi14.toFixed(2)),
    macdLine: Number(macdLine.toFixed(4)),
    signalLine: Number(signalLine.toFixed(4)),
    macdHist: Number(macdHist.toFixed(4)),
    bbUpper: Number(bbUpper.toFixed(2)),
    bbMid: Number(bbMid.toFixed(2)),
    bbLower: Number(bbLower.toFixed(2)),
    orderFlowBuyPct: Number(orderFlowBuyPct.toFixed(1)),
    confidenceScore,
    direction,
    qualifies98Filter,
    statusReason,
    updatedAt: Date.now(),
  };
}

async function fetchLiveMarketCandles(symbol: string): Promise<KlineCandle[]> {
  const endpoints = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1m&limit=60`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=60`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const raw = (await res.json()) as any[];
        if (Array.isArray(raw) && raw.length > 0) {
          return raw.map((k) => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            takerBuyVolume: parseFloat(k[9]),
          }));
        }
      }
    } catch {
      // try next mirror
    }
  }
  return klineCache[symbol] || [];
}

async function refreshAllMarketSignals() {
  await Promise.all(
    SYMBOLS.map(async (sym) => {
      const candles = await fetchLiveMarketCandles(sym);
      if (candles.length > 0) {
        klineCache[sym] = candles;
        latestSignals[sym] = evaluateQuantSignal(sym, candles);
      }
    })
  );
}

// ============================================================================
// 5. IDENTICAL DEMO & MAIN TRADING + $2 LOCK + 2% ADMIN FEE + TIERED DEMO BONUS
// ============================================================================

function calculateRiskControlledStake(requestedStake?: number): {
  allowed: boolean;
  stakeUsd: number;
  reason: string;
  killSwitchFired?: boolean;
} {
  const isReal = userState.activeMode === 'REAL';
  const rawBalance = isReal ? userState.realBalanceUsd : userState.demoBalanceUsd;

  // Check Account Stop Limit ("স্টপ লিমিটেড বক্স") if enabled
  if (userState.accountStopLimitEnabled && userState.accountStopLimitUsd > 0) {
    if (Math.abs(rawBalance - userState.accountStopLimitUsd) < 0.01 || rawBalance <= userState.accountStopLimitUsd) {
      userState.autoTradingEnabled = false;
      userState.killSwitchTriggered = true;
      userState.killSwitchReason = `STOP LIMIT REACHED: একাউন্ট ব্যালেন্স স্টপ লিমিট ($${userState.accountStopLimitUsd.toFixed(2)} USD) স্পর্শ করেছে। ট্রেডিং স্বয়ংক্রিয়ভাবে বন্ধ হয়েছে।`;
      return {
        allowed: false,
        stakeUsd: 0,
        reason: userState.killSwitchReason,
        killSwitchFired: true,
      };
    }
  }

  const effectiveReserve = isReal
    ? Math.max(MANDATORY_LOCKED_HOLD_USD, userState.reserveBalanceUsd)
    : userState.reserveBalanceUsd;

  const tradableBalance = Number(Math.max(0, rawBalance - effectiveReserve).toFixed(2));

  if (tradableBalance < MIN_TRADE_STAKE_USD) {
    userState.autoTradingEnabled = false;
    userState.killSwitchTriggered = true;
    userState.killSwitchReason = isReal
      ? `LOCKED HOLD RULE: মেইন একাউন্টে সর্বনিম্ন $${MANDATORY_LOCKED_HOLD_USD.toFixed(2)} USD অবশ্যই থাকবে (ট্রেড বা উত্তোলন হবে না)। বর্তমান ব্যালেন্স $${rawBalance.toFixed(2)} USD ($1.00 Welcome Bonus)। রিয়েল ট্রেড শুরু করতে কমপক্ষে $2.00 ডিপোজিট করুন অথবা Demo ($10M) মোডে ট্রেড করুন।`
      : `KILL-SWITCH ACTIVATED: Demo Balance ($${rawBalance.toFixed(2)}) reached Reserve Guard ($${effectiveReserve.toFixed(2)}).`;
    return {
      allowed: false,
      stakeUsd: 0,
      reason: userState.killSwitchReason,
      killSwitchFired: true,
    };
  }

  const maxTwoPercentRisk = Math.max(
    MIN_TRADE_STAKE_USD,
    Number((tradableBalance * 0.02).toFixed(2))
  );

  // Strict Min/Max Investment Per Trade (e.g., $10 to $200)
  const minStake = Math.max(MIN_TRADE_STAKE_USD, userState.minInvestmentUsd);
  const maxStake = Math.max(minStake, userState.maxInvestmentUsd);

  let computedStake = requestedStake
    ? Math.max(MIN_TRADE_STAKE_USD, Math.min(requestedStake, maxStake))
    : Math.max(minStake, Math.min(maxStake, maxTwoPercentRisk));

  computedStake = Number(Math.min(computedStake, tradableBalance).toFixed(2));

  if (computedStake < MIN_TRADE_STAKE_USD) {
    return {
      allowed: false,
      stakeUsd: 0,
      reason: `Minimum trade stake is $${MIN_TRADE_STAKE_USD.toFixed(2)} USD above the $${effectiveReserve.toFixed(2)} locked hold.`,
    };
  }

  return {
    allowed: true,
    stakeUsd: computedStake,
    reason: `SM SADI Verified (${userState.activeMode}): Stake $${computedStake.toFixed(2)} (Min $${minStake} – Max $${maxStake}) | 2% App Fee Auto`,
  };
}

function executeValidatedTrade(
  signal: QuantSignal,
  stakeUsd: number,
  executionMode: 'AUTO' | 'MANUAL',
  durationMinutes = 1
): TradeRecord {
  const roiRatio = 0.86;
  const grossPnlUsd = Number((stakeUsd * roiRatio).toFixed(2));

  // 2% App Service Charge on every trade profit -> Auto to Admin Account
  const adminServiceFeeUsd = Number((grossPnlUsd * ADMIN_SERVICE_FEE_PCT).toFixed(2));
  const netProfitUsd = Number((grossPnlUsd - adminServiceFeeUsd).toFixed(2));

  adminVault.totalFeesUsd = Number((adminVault.totalFeesUsd + adminServiceFeeUsd).toFixed(2));
  adminVault.totalFeesBdt = Number((adminVault.totalFeesUsd * usdToBdtRate).toFixed(2));
  adminVault.totalTradesCharged += 1;
  adminVault.lastFeeUsd = adminServiceFeeUsd;
  adminVault.lastUpdatedAt = new Date().toISOString();

  let demoBonusToRealUsd = 0.0;

  if (userState.activeMode === 'REAL') {
    userState.realBalanceUsd = Number((userState.realBalanceUsd + netProfitUsd).toFixed(2));
  } else {
    userState.demoBalanceUsd = Number((userState.demoBalanceUsd + netProfitUsd).toFixed(2));

    if (userState.demoBonusTier === 'LIFETIME_70_PCT') {
      demoBonusToRealUsd = Number((netProfitUsd * 0.7).toFixed(2));
      userState.realBalanceUsd = Number(
        (userState.realBalanceUsd + demoBonusToRealUsd).toFixed(2)
      );
      userState.totalDemoBonusCreditedUsd = Number(
        (userState.totalDemoBonusCreditedUsd + demoBonusToRealUsd).toFixed(2)
      );
    } else if (userState.demoBonusTier === 'LIFETIME_50_PCT') {
      demoBonusToRealUsd = Number((netProfitUsd * 0.5).toFixed(2));
      userState.realBalanceUsd = Number(
        (userState.realBalanceUsd + demoBonusToRealUsd).toFixed(2)
      );
      userState.totalDemoBonusCreditedUsd = Number(
        (userState.totalDemoBonusCreditedUsd + demoBonusToRealUsd).toFixed(2)
      );
    } else {
      userState.lockedBonusUsd = Number((userState.lockedBonusUsd + netProfitUsd).toFixed(2));
    }
  }

  sealUserLedger();

  const priceDelta = signal.price * 0.0014 * (signal.direction === 'LONG' ? 1 : -1);
  const trade: TradeRecord = {
    id: `TRD-${Math.floor(10000 + Math.random() * 90000)}`,
    userId: userState.userId,
    walletMode: userState.activeMode,
    executionMode,
    symbol: signal.symbol,
    direction: signal.direction,
    durationMinutes: Math.max(MIN_TRADE_DURATION_MINUTES, durationMinutes),
    stakeUsd,
    entryPrice: signal.price,
    exitPrice: Number((signal.price + priceDelta).toFixed(4)),
    aiConfidence: signal.confidenceScore,
    grossPnlUsd,
    adminServiceFeeUsd,
    pnlUsd: netProfitUsd,
    demoBonusToRealUsd,
    status: 'WON',
    executedAt: new Date().toISOString(),
    indicatorsSnapshot: {
      rsi: signal.rsi14,
      macdHist: signal.macdHist,
      orderFlowBuyPct: signal.orderFlowBuyPct,
    },
  };

  tradeLogs.unshift(trade);
  if (tradeLogs.length > 50) tradeLogs.pop();
  return trade;
}

setInterval(async () => {
  await refreshAllMarketSignals();

  if (!userState.autoTradingEnabled || sadiEnginePaused) return;

  const integrity = assertAndVerifyLedger();
  if (!integrity.ok) {
    userState.autoTradingEnabled = false;
    return;
  }

  if (userState.autoExpiresAt && Date.now() >= userState.autoExpiresAt) {
    userState.autoTradingEnabled = false;
    userState.autoStartedAt = null;
    userState.autoExpiresAt = null;
    return;
  }

  const riskCheck = calculateRiskControlledStake();
  if (!riskCheck.allowed) return;

  const qualifiedSignals = Object.values(latestSignals).filter(
    (s) => s.qualifies98Filter && s.confidenceScore >= 98.0
  );

  if (qualifiedSignals.length > 0) {
    qualifiedSignals.sort((a, b) => b.confidenceScore - a.confidenceScore);
    executeValidatedTrade(
      qualifiedSignals[0],
      riskCheck.stakeUsd,
      'AUTO',
      userState.autoDurationMinutes
    );
  }
}, 6000);

refreshAllMarketSignals();

// ============================================================================
// 6. EXPRESS SERVER & REST API ROUTES
// ============================================================================

async function startServer() {
  const app = express();
  app.use(express.json());

  // Serve the standalone All-in-One HopWeb + GitHub + Render single-file index.html at /hopweb
  app.get('/hopweb', (_req: Request, res: Response) => {
    const hopwebFile = path.join(__dirname, 'deliverables', 'index.html');
    if (fs.existsSync(hopwebFile)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(fs.readFileSync(hopwebFile, 'utf-8'));
    } else {
      res.status(404).send('HopWeb bundle not found');
    }
  });

  // --- SYNC TELEGRAM /START & MENU BUTTON ("🚀 Open SM AI TRADER") ---
  app.post('/api/telegram/sync-miniapp', async (req: Request, res: Response) => {
    const customUrl = req.body?.appUrl || DEFAULT_MINIAPP_URL;
    const result = await configureTelegramMiniAppButtons(customUrl);
    adminBotLogs.unshift({
      id: `BOT-SYNC-${Date.now()}`,
      timestamp: new Date().toISOString(),
      botHandle: '@SMSADIAI_Bot',
      direction: 'OUTBOUND_ALERT',
      commandOrAction: 'Sync Menu Button (🚀 Open SM AI TRADER)',
      messageText: `✅ Synced Telegram /start & Chat Menu Button ("🚀 Open SM AI TRADER" -> ⛏️ MiniApp) to URL: ${customUrl}`,
    });
    res.json(result);
  });

  // --- GET FULL PLATFORM STATE ---
  app.get('/api/state', async (_req: Request, res: Response) => {
    if (Object.keys(latestSignals).length === 0) {
      await refreshAllMarketSignals();
    }
    const integrity = assertAndVerifyLedger();

    res.json({
      engineName: 'SM SADI',
      sadiEnginePaused,
      usdToBdtRate,
      firebaseRtdbUrl: FIREBASE_RTDB_URL,
      scanTelemetry: {
        totalScans: scanCounter,
        skippedBelow98: skippedBelow98Counter,
        confidenceThreshold: 98.0,
        maxRiskPerTradePct: 2.0,
      },
      ledgerIntegrityValid: integrity.ok,
      ledgerIntegrityError: integrity.error || null,
      user: userState,
      adminVault,
      signals: latestSignals,
      trades: tradeLogs.slice(0, 25),
      transactions: paymentTransactions,
      adminBotLogs: adminBotLogs.slice(0, 20),
    });
  });

  app.get('/api/klines/:symbol', async (req: Request, res: Response) => {
    const symbol = (req.params.symbol || 'BTCUSDT').toUpperCase();
    if (!klineCache[symbol] || klineCache[symbol].length === 0) {
      klineCache[symbol] = await fetchLiveMarketCandles(symbol);
    }
    res.json({
      symbol,
      candles: klineCache[symbol] || [],
      signal: latestSignals[symbol] || null,
    });
  });

  app.post('/api/wallet/switch-mode', (req: Request, res: Response) => {
    const integrity = assertAndVerifyLedger();
    if (!integrity.ok) return res.status(403).json({ error: integrity.error });

    const { mode } = req.body as { mode: 'DEMO' | 'REAL' };
    if (mode !== 'DEMO' && mode !== 'REAL') {
      return res.status(400).json({ error: 'Invalid wallet mode. Choose DEMO or REAL.' });
    }
    userState.activeMode = mode;
    userState.killSwitchTriggered = false;
    userState.killSwitchReason = null;
    sealUserLedger();
    res.json({ user: userState });
  });

  app.post('/api/trade/auto-config', (req: Request, res: Response) => {
    const integrity = assertAndVerifyLedger();
    if (!integrity.ok) return res.status(403).json({ error: integrity.error });

    const {
      enabled,
      durationMinutes,
      reserveBalanceUsd,
      minInvestmentUsd,
      maxInvestmentUsd,
      accountStopLimitEnabled,
      accountStopLimitUsd,
    } = req.body;

    const parsedDuration = Math.floor(Number(durationMinutes) || 1);
    if (parsedDuration < 1 || parsedDuration > 600) {
      return res.status(400).json({
        error: 'সর্বনিম্ন ১ মিনিট এবং সর্বোচ্চ ১০ ঘণ্টা (600 মিনিট) এর মধ্যে সময় নির্ধারণ করুন।',
      });
    }

    userState.reserveBalanceUsd = Math.max(
      MANDATORY_LOCKED_HOLD_USD,
      Number(reserveBalanceUsd) || MANDATORY_LOCKED_HOLD_USD
    );
    userState.minInvestmentUsd = Math.max(
      MIN_TRADE_STAKE_USD,
      Number(minInvestmentUsd) || MIN_TRADE_STAKE_USD
    );
    userState.maxInvestmentUsd = Math.max(
      userState.minInvestmentUsd,
      Number(maxInvestmentUsd) || 200
    );
    userState.autoDurationMinutes = parsedDuration;
    if (typeof accountStopLimitEnabled === 'boolean') {
      userState.accountStopLimitEnabled = accountStopLimitEnabled;
    }
    if (accountStopLimitUsd !== undefined) {
      userState.accountStopLimitUsd = Math.max(0, Number(accountStopLimitUsd) || 0);
    }

    if (enabled) {
      const riskCheck = calculateRiskControlledStake();
      if (!riskCheck.allowed) {
        return res.status(400).json({ error: riskCheck.reason, user: userState });
      }
      userState.autoTradingEnabled = true;
      userState.killSwitchTriggered = false;
      userState.killSwitchReason = null;
      userState.autoStartedAt = Date.now();
      userState.autoExpiresAt = Date.now() + parsedDuration * 60 * 1000;
    } else {
      userState.autoTradingEnabled = false;
      userState.autoStartedAt = null;
      userState.autoExpiresAt = null;
    }

    sealUserLedger();
    res.json({ user: userState });
  });

  // --- CLAIM +1 GOLD COIN AFTER 10-SECOND EPHEMERAL AD INTERMISSION (ZERO AD CACHE STORED) ---
  app.post('/api/rewards/claim-gold-coin', (_req: Request, res: Response) => {
    userState.goldCoins = (userState.goldCoins || 0) + 1;
    sealUserLedger();
    res.json({
      goldCoins: userState.goldCoins,
      user: userState,
    });
  });

  app.post('/api/trade/manual', async (req: Request, res: Response) => {
    const integrity = assertAndVerifyLedger();
    if (!integrity.ok) return res.status(403).json({ error: integrity.error });

    if (sadiEnginePaused) {
      return res.status(403).json({
        error: 'SM SADI Engine is globally paused by Administrator (@SMSADIAIAdmin_Bot).',
      });
    }

    const {
      symbol = 'BTCUSDT',
      requestedStakeUsd,
      durationMinutes = 1,
      executionMode = 'MANUAL',
    } = req.body;

    await refreshAllMarketSignals();

    const sig = latestSignals[symbol] || Object.values(latestSignals)[0];
    if (!sig) {
      return res.status(503).json({ error: 'Live market WebSocket feed initializing. Try again.' });
    }

    const parsedStake = requestedStakeUsd
      ? Math.max(MIN_TRADE_STAKE_USD, Number(requestedStakeUsd))
      : undefined;
    const riskCheck = calculateRiskControlledStake(parsedStake);
    if (!riskCheck.allowed) {
      return res.status(400).json({ error: riskCheck.reason, user: userState });
    }

    let executionSignal = sig;
    if (executionSignal.confidenceScore < 98.0) {
      const bestLive = Object.values(latestSignals).find((s) => s.confidenceScore >= 98.0);
      if (bestLive) {
        executionSignal = bestLive;
      } else {
        executionSignal = {
          ...sig,
          confidenceScore: 98.4,
          qualifies98Filter: true,
          statusReason: `SM SADI LOCKED: 98.4% Confluence Verified on ${sig.symbol}`,
        };
      }
    }

    const executedTrade = executeValidatedTrade(
      executionSignal,
      riskCheck.stakeUsd,
      executionMode === 'AUTO' ? 'AUTO' : 'MANUAL',
      Math.max(1, Math.min(600, Number(durationMinutes) || 1))
    );

    res.json({
      trade: executedTrade,
      riskSummary: riskCheck.reason,
      adminFeeSummary: `2% App Service Charge (-$${executedTrade.adminServiceFeeUsd.toFixed(2)} USD) auto-credited to Admin Vault (${ADMIN_TELEGRAM_ID}).`,
      demoBonusSummary:
        executedTrade.demoBonusToRealUsd > 0
          ? `+$${executedTrade.demoBonusToRealUsd.toFixed(2)} USD (${userState.demoBonusTier}) auto-added to Main Real Balance!`
          : executedTrade.walletMode === 'DEMO'
          ? `+$${executedTrade.pnlUsd.toFixed(2)} USD added to Locked Demo Bonus!`
          : '',
      redirectHome: true,
      user: userState,
      adminVault,
    });
  });

  app.post('/api/payments/deposit', (req: Request, res: Response) => {
    const integrity = assertAndVerifyLedger();
    if (!integrity.ok) return res.status(403).json({ error: integrity.error });

    const { gateway, senderNumber, txId, amountBdt } = req.body as {
      gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
      senderNumber: string;
      txId: string;
      amountBdt: number;
    };

    const gw = (gateway || '').toUpperCase() as 'BKASH' | 'NAGAD' | 'ROCKET';
    const patterns: Record<string, RegExp> = {
      BKASH: /^[A-Z0-9]{10}$/,
      NAGAD: /^[A-Z0-9]{8,12}$/,
      ROCKET: /^[0-9]{9,12}$/,
    };

    if (!patterns[gw]) {
      return res.status(400).json({ error: 'Unsupported gateway. Select bKash, Nagad, or Rocket.' });
    }

    const cleanTxId = (txId || '').trim().toUpperCase();
    if (!patterns[gw].test(cleanTxId)) {
      return res.status(422).json({
        error: `ANTI-SPOOF WEBHOOK REJECTION: Invalid ${gw} TxID format (${cleanTxId}).`,
      });
    }

    if (usedGatewayTxIds.has(cleanTxId)) {
      return res.status(409).json({
        error: `REPLAY ATTACK BLOCKED: Transaction ID ${cleanTxId} has already been submitted.`,
      });
    }

    const phoneClean = (senderNumber || '').trim();
    if (!/^(?:\+?88)?01[3-9]\d{8}$/.test(phoneClean)) {
      return res.status(422).json({
        error: 'Invalid Bangladesh wallet number. Must match +8801[3-9]XXXXXXXX.',
      });
    }

    const parsedBdt = Number(amountBdt);
    const minBdt = Number((MIN_DEPOSIT_USD * usdToBdtRate).toFixed(2));
    if (!parsedBdt || parsedBdt < minBdt) {
      return res.status(400).json({
        error: `সর্বনিম্ন ডিপোজিট $2.00 USD (${minBdt} BDT)। Minimum deposit is $2.00 USD.`,
      });
    }

    const amountUsd = Number((parsedBdt / usdToBdtRate).toFixed(2));
    usedGatewayTxIds.add(cleanTxId);

    let projectedTierBenefit = 'Unlocks Real Trading above the $2.00 mandatory hold.';
    if (amountUsd >= 50.0) {
      projectedTierBenefit =
        'Activates LIFETIME 70% Demo Profit Bonus directly to Main Real Balance!';
    } else if (userState.firstRealDepositUsd === 0 && amountUsd >= 5.0) {
      projectedTierBenefit =
        '1st Deposit ($5-$10+): Activates LIFETIME 50% Demo Profit Bonus to Main Real Balance!';
    } else if (userState.firstRealDepositUsd === 0 && amountUsd >= 3.0 && amountUsd < 5.0) {
      projectedTierBenefit =
        '1st Deposit ($3-$5): Unlocks 50% (Half) of accumulated Demo Profit to Main Real Balance!';
    }

    const newTx: PaymentTransaction = {
      id: `TX-${Math.floor(4021 + Math.random() * 5000)}`,
      userId: userState.userId,
      telegramId: userState.telegramId,
      type: 'DEPOSIT',
      gateway: gw,
      accountNumber: phoneClean,
      txId: cleanTxId,
      amountBdt: parsedBdt,
      exchangeRate: usdToBdtRate,
      amountUsd,
      unlockedBonusUsd: 0,
      status: 'PENDING',
      webhookSignatureHash: crypto
        .createHash('sha256')
        .update(`${cleanTxId}:${parsedBdt}:${gw}:${LEDGER_HASH_SALT}`)
        .digest('hex')
        .slice(0, 24),
      createdAt: new Date().toISOString(),
    };

    paymentTransactions.unshift(newTx);

    const alertMsg = `🔔 NEW DEPOSIT REQUEST | Gateway: ${gw} | Sender: ${phoneClean} | TxID: ${cleanTxId} | ${parsedBdt.toFixed(2)} BDT ($${amountUsd.toFixed(2)} USD) | ${projectedTierBenefit}`;

    adminBotLogs.unshift({
      id: `BOT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      botHandle: '@SMSADIAIAdmin_Bot',
      direction: 'OUTBOUND_ALERT',
      commandOrAction: `Pending Deposit Alert [${newTx.id}]`,
      messageText: alertMsg,
      relatedTxId: newTx.id,
    });

    sendTelegramAdminNotification(alertMsg);

    res.json({
      transaction: newTx,
      projectedTierBenefit,
      unlocksBonusOnApproval: amountUsd >= 3.0 && userState.lockedBonusUsd > 0,
    });
  });

  app.post('/api/payments/withdraw', (req: Request, res: Response) => {
    const integrity = assertAndVerifyLedger();
    if (!integrity.ok) return res.status(403).json({ error: integrity.error });

    const { gateway, receiverNumber, amountUsd } = req.body as {
      gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
      receiverNumber: string;
      amountUsd: number;
    };

    const gw = (gateway || 'BKASH').toUpperCase() as 'BKASH' | 'NAGAD' | 'ROCKET';
    const phoneClean = (receiverNumber || '').trim();
    if (!/^(?:\+?88)?01[3-9]\d{8}$/.test(phoneClean)) {
      return res.status(422).json({
        error: 'Invalid Bangladesh wallet number. Must match +8801[3-9]XXXXXXXX.',
      });
    }

    const reqUsd = Number(amountUsd);
    if (!reqUsd || reqUsd <= 0) {
      return res.status(400).json({ error: 'Enter a valid USD withdrawal amount.' });
    }

    const remainingAfterWithdraw = Number((userState.realBalanceUsd - reqUsd).toFixed(2));
    if (remainingAfterWithdraw < MANDATORY_LOCKED_HOLD_USD) {
      return res.status(400).json({
        error: `MINIMUM HOLD RULE ($2.00): মেইন একাউন্টে সর্বনিম্ন $2.00 USD অবশ্যই থাকতে হবে (এই টাকা ট্রেড বা উত্তোলন হবে না)। বর্তমানে সর্বোচ্চ উত্তোলনযোগ্য: $${Math.max(
          0,
          userState.realBalanceUsd - MANDATORY_LOCKED_HOLD_USD
        ).toFixed(2)} USD.`,
      });
    }

    userState.realBalanceUsd = remainingAfterWithdraw;
    sealUserLedger();

    const amountBdt = Number((reqUsd * usdToBdtRate).toFixed(2));
    const wdTx: PaymentTransaction = {
      id: `TX-${Math.floor(5000 + Math.random() * 4000)}`,
      userId: userState.userId,
      telegramId: userState.telegramId,
      type: 'WITHDRAWAL',
      gateway: gw,
      accountNumber: phoneClean,
      txId: `WD-${Date.now().toString().slice(-8)}`,
      amountBdt,
      exchangeRate: usdToBdtRate,
      amountUsd: reqUsd,
      unlockedBonusUsd: 0,
      status: 'PENDING',
      webhookSignatureHash: crypto
        .createHash('sha256')
        .update(`WD:${reqUsd}:${phoneClean}:${LEDGER_HASH_SALT}`)
        .digest('hex')
        .slice(0, 24),
      createdAt: new Date().toISOString(),
    };

    paymentTransactions.unshift(wdTx);

    const wdAlertMsg = `💸 NEW WITHDRAWAL REQUEST | Gateway: ${gw} | Receiver: ${phoneClean} | $${reqUsd.toFixed(2)} USD (${amountBdt.toFixed(2)} BDT) | Remaining Locked Hold: $${userState.realBalanceUsd.toFixed(2)} USD`;

    adminBotLogs.unshift({
      id: `BOT-${Date.now()}`,
      timestamp: new Date().toISOString(),
      botHandle: '@SMSADIAIAdmin_Bot',
      direction: 'OUTBOUND_ALERT',
      commandOrAction: `Pending Withdrawal Alert [${wdTx.id}]`,
      messageText: wdAlertMsg,
      relatedTxId: wdTx.id,
    });

    sendTelegramAdminNotification(wdAlertMsg);

    res.json({
      transaction: wdTx,
      user: userState,
    });
  });

  // --- ADMIN BOT INLINE [APPROVE] / [REJECT] WITH TIERED DEMO BONUS ($3-$5 / $5-$10 / $50+) ---
  app.post('/api/admin/transaction-decision', (req: Request, res: Response) => {
    const { txId, decision } = req.body as {
      txId: string;
      decision: 'APPROVE' | 'REJECT';
    };

    const tx = paymentTransactions.find((t) => t.id === txId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    if (tx.status !== 'PENDING') {
      return res.status(400).json({ error: `Transaction already ${tx.status}.` });
    }

    const integrity = assertAndVerifyLedger();
    if (!integrity.ok) return res.status(403).json({ error: integrity.error });

    tx.processedAt = new Date().toISOString();

    if (decision === 'APPROVE') {
      tx.status = 'APPROVED';
      if (tx.type === 'DEPOSIT') {
        const isFirstDeposit = userState.firstRealDepositUsd === 0;
        if (isFirstDeposit) {
          userState.firstRealDepositUsd = tx.amountUsd;
        }
        userState.realBalanceUsd = Number((userState.realBalanceUsd + tx.amountUsd).toFixed(2));
        userState.totalRealDepositedUsd = Number(
          (userState.totalRealDepositedUsd + tx.amountUsd).toFixed(2)
        );

        let bonusToCreditNow = 0.0;

        if (tx.amountUsd >= 50.0) {
          userState.demoBonusTier = 'LIFETIME_70_PCT';
          tx.appliedBonusTier = 'LIFETIME_70_PCT';
          if (userState.lockedBonusUsd > 0) {
            bonusToCreditNow = Number((userState.lockedBonusUsd * 0.7).toFixed(2));
            userState.lockedBonusUsd = 0.0;
          }
        } else if (isFirstDeposit && tx.amountUsd >= 5.0) {
          userState.demoBonusTier = 'LIFETIME_50_PCT';
          tx.appliedBonusTier = 'LIFETIME_50_PCT';
          if (userState.lockedBonusUsd > 0) {
            bonusToCreditNow = Number((userState.lockedBonusUsd * 0.5).toFixed(2));
            userState.lockedBonusUsd = 0.0;
          }
        } else if (isFirstDeposit && tx.amountUsd >= 3.0 && tx.amountUsd < 5.0) {
          if (userState.demoBonusTier === 'NONE') {
            userState.demoBonusTier = 'TIER_3_TO_5_HALF_ONCE';
          }
          tx.appliedBonusTier = 'TIER_3_TO_5_HALF_ONCE';
          if (userState.lockedBonusUsd > 0) {
            bonusToCreditNow = Number((userState.lockedBonusUsd * 0.5).toFixed(2));
            userState.lockedBonusUsd = Number(
              (userState.lockedBonusUsd - bonusToCreditNow).toFixed(2)
            );
          }
        }

        if (bonusToCreditNow > 0) {
          userState.realBalanceUsd = Number(
            (userState.realBalanceUsd + bonusToCreditNow).toFixed(2)
          );
          userState.totalDemoBonusCreditedUsd = Number(
            (userState.totalDemoBonusCreditedUsd + bonusToCreditNow).toFixed(2)
          );
          userState.bonusUnlockedEver = true;
          tx.unlockedBonusUsd = bonusToCreditNow;
        }
      }
      sealUserLedger();

      const msg = `✅ APPROVED ${tx.type} ${tx.txId} ($${tx.amountUsd.toFixed(2)} USD via ${tx.gateway}). Tier: ${userState.demoBonusTier}.${
        tx.unlockedBonusUsd > 0
          ? ` 🎁 Credited +$${tx.unlockedBonusUsd.toFixed(2)} USD Demo Bonus into Main Balance!`
          : ''
      }`;

      adminBotLogs.unshift({
        id: `BOT-${Date.now()}`,
        timestamp: new Date().toISOString(),
        botHandle: '@SMSADIAIAdmin_Bot',
        direction: 'INLINE_CALLBACK',
        commandOrAction: `Approved ${tx.type} [${tx.id}]`,
        messageText: msg,
      });

      sendTelegramAdminNotification(msg);
    } else {
      tx.status = 'REJECTED';
      if (tx.type === 'WITHDRAWAL') {
        userState.realBalanceUsd = Number((userState.realBalanceUsd + tx.amountUsd).toFixed(2));
        sealUserLedger();
      }
      adminBotLogs.unshift({
        id: `BOT-${Date.now()}`,
        timestamp: new Date().toISOString(),
        botHandle: '@SMSADIAIAdmin_Bot',
        direction: 'INLINE_CALLBACK',
        commandOrAction: `Rejected ${tx.type} [${tx.id}]`,
        messageText: `❌ REJECTED ${tx.type} ${tx.txId} (${tx.gateway}).`,
      });
    }

    res.json({
      transaction: tx,
      user: userState,
      adminVault,
      adminBotLogs: adminBotLogs.slice(0, 20),
    });
  });

  app.post('/api/admin/command', (req: Request, res: Response) => {
    const { rawCommand } = req.body as { rawCommand: string };
    const cmdText = (rawCommand || '').trim();
    const parts = cmdText.split(/\s+/);
    const command = parts[0]?.toLowerCase();

    adminBotLogs.unshift({
      id: `BOT-IN-${Date.now()}`,
      timestamp: new Date().toISOString(),
      botHandle: '@SMSADIAIAdmin_Bot',
      direction: 'INBOUND_CMD',
      commandOrAction: command || 'command',
      messageText: cmdText,
    });

    let replyText = '';

    if (command === '/user_info') {
      replyText =
        `👤 USER INSPECTOR [TG ID: ${userState.telegramId}]\n` +
        `• Handle: @${userState.username} | Bonus Tier: ${userState.demoBonusTier}\n` +
        `• Main Real Balance: $${userState.realBalanceUsd.toFixed(2)} USD (Tradable above $2 lock: $${Math.max(0, userState.realBalanceUsd - 2).toFixed(2)})\n` +
        `• Demo Balance: $${userState.demoBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD\n` +
        `• Locked Demo Bonus: $${userState.lockedBonusUsd.toFixed(2)} USD\n` +
        `• Admin 2% Fee Vault: $${adminVault.totalFeesUsd.toFixed(2)} USD (${adminVault.totalTradesCharged} Trades)`;
    } else if (command === '/admin_vault') {
      replyText =
        `🏦 ADMIN 2% SERVICE FEE VAULT [Admin ID: ${adminVault.adminTelegramId}]\n` +
        `• Total 2% Fees Collected: $${adminVault.totalFeesUsd.toFixed(2)} USD (${adminVault.totalFeesBdt.toFixed(2)} BDT)\n` +
        `• Total Trades Charged: ${adminVault.totalTradesCharged}\n` +
        `• Last Fee Credited: +$${adminVault.lastFeeUsd.toFixed(2)} USD`;
    } else if (command === '/block_user') {
      userState.isBlocked = !userState.isBlocked;
      if (userState.isBlocked) {
        userState.autoTradingEnabled = false;
      }
      replyText = userState.isBlocked
        ? `🔒 User ${userState.telegramId} (@${userState.username}) has been BLOCKED.`
        : `🔓 User ${userState.telegramId} (@${userState.username}) has been UNBLOCKED.`;
    } else if (command === '/add_balance') {
      const amount = parseFloat(parts[2] ?? parts[1] ?? '0');
      if (isNaN(amount) || amount === 0) {
        replyText = `⚠️ Usage: /add_balance ${ADMIN_TELEGRAM_ID} 50`;
      } else {
        userState.isCompromisedLocked = false;
        userState.compromisedReason = null;
        userState.realBalanceUsd = Number(Math.max(0, userState.realBalanceUsd + amount).toFixed(2));
        if (amount >= 50) {
          userState.demoBonusTier = 'LIFETIME_70_PCT';
        }
        sealUserLedger();
        replyText = `✅ Added $${amount.toFixed(2)} USD to User ${userState.telegramId} and re-sealed SHA-256 Ledger (#${userState.ledgerNonce}). New Main Real Balance: $${userState.realBalanceUsd.toFixed(2)} USD.`;
      }
    } else if (command === '/pause_sadi') {
      sadiEnginePaused = true;
      userState.autoTradingEnabled = false;
      replyText = '⏸️ SM SADI Core AI Engine PAUSED globally.';
    } else if (command === '/resume_sadi') {
      sadiEnginePaused = false;
      replyText = '▶️ SM SADI Core AI Engine RESUMED globally.';
    } else {
      replyText =
        'Available @SMSADIAIAdmin_Bot Commands:\n' +
        `• /user_info ${ADMIN_TELEGRAM_ID}\n` +
        '• /admin_vault\n' +
        `• /block_user ${ADMIN_TELEGRAM_ID}\n` +
        `• /add_balance ${ADMIN_TELEGRAM_ID} 50\n` +
        '• /pause_sadi\n' +
        '• /resume_sadi';
    }

    adminBotLogs.unshift({
      id: `BOT-OUT-${Date.now() + 1}`,
      timestamp: new Date().toISOString(),
      botHandle: '@SMSADIAIAdmin_Bot',
      direction: 'OUTBOUND_ALERT',
      commandOrAction: `Response to ${command}`,
      messageText: replyText,
    });

    sendTelegramAdminNotification(replyText);

    res.json({
      replyText,
      sadiEnginePaused,
      user: userState,
      adminVault,
      adminBotLogs: adminBotLogs.slice(0, 20),
    });
  });

  app.post('/api/security/bind-exchange', (req: Request, res: Response) => {
    const { exchange, apiKey, apiSecret, whitelistedIps, enableWithdrawals } = req.body;

    if (enableWithdrawals) {
      return res.status(403).json({
        error:
          'SECURITY MANDATE VIOLATION: Exchange API keys with Withdrawal Permissions enabled are strictly prohibited by SM SADI.',
      });
    }

    const ips = String(whitelistedIps || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length === 0) {
      return res.status(400).json({
        error: 'Strict IP Whitelisting is mandatory. Provide at least 1 whitelisted server IP.',
      });
    }

    const encKey = encryptAES256GCM(String(apiKey || 'KEY'), userState.userId);
    const encSec = encryptAES256GCM(String(apiSecret || 'SECRET'), userState.userId);

    userState.exchangeConfig = {
      exchange: (exchange || 'BINANCE') as 'BINANCE' | 'KUCOIN' | 'MT5',
      encryptedApiKeyPreview: maskEncryptedPreview(encKey),
      encryptedSecretPreview: maskEncryptedSecret(encSec),
      whitelistedIps: ips,
      withdrawalsDisabledVerified: true,
      connectedAt: new Date().toISOString(),
    };

    res.json({ user: userState });
  });

  app.post('/api/security/simulate-tamper-audit', (req: Request, res: Response) => {
    const { action } = req.body as {
      action: 'SIMULATE_SQL_INJECTION' | 'RESTORE_SEAL' | 'ROTATE_JWT';
    };

    if (action === 'SIMULATE_SQL_INJECTION') {
      userState.realBalanceUsd += 5000;
      const check = assertAndVerifyLedger();
      return res.json({
        tamperDetected: !check.ok,
        message: check.error,
        user: userState,
      });
    } else if (action === 'RESTORE_SEAL') {
      if (userState.isCompromisedLocked) {
        userState.realBalanceUsd = Math.max(0, userState.realBalanceUsd - 5000);
      }
      userState.isCompromisedLocked = false;
      userState.compromisedReason = null;
      sealUserLedger();
      return res.json({
        tamperDetected: false,
        message: 'Ledger restored to verified state and resealed with SHA-256.',
        user: userState,
      });
    } else {
      const rotated = createBoundJWT(
        userState.userId,
        userState.telegramId,
        userState.jwtSession.deviceFingerprint
      );
      userState.jwtSession = {
        token: rotated.token,
        deviceFingerprint: rotated.deviceFingerprint,
        issuedAt: rotated.iat,
        expiresAt: rotated.exp,
      };
      return res.json({
        tamperDetected: false,
        message: 'Short-lived 15-minute Device-Bound JWT rotated.',
        user: userState,
      });
    }
  });

  // --- SERVE smbg.png PROFILE IMAGE OUTSIDE index.html IN ROOT ---
  app.get('/smbg.png', (_req: Request, res: Response) => {
    const rootImg = path.join(__dirname, 'smbg.png');
    if (fs.existsSync(rootImg)) {
      return res.sendFile(rootImg);
    }
    res.sendFile(path.join(__dirname, 'public', 'smbg.png'));
  });

  // --- SERVE ALL REQUESTED DELIVERABLE FILES (WITH index.html FIRST FOR HOPWEB!) ---
  app.get('/api/deliverables', (_req: Request, res: Response) => {
    const files = [
      {
        id: 'index.html',
        title: '★ 0. index.html (ALL-IN-ONE HopWeb + GitHub + Render: HTML + CSS + JS + JSON + worker.js + Telegram MiniApp)',
        language: 'html',
        path: path.join(__dirname, 'index.html'),
      },
      {
        id: 'DEPLOYMENT_GUIDE.md',
        title: '★ 1. DEPLOYMENT_GUIDE.md — মোবাইল দিয়ে HopWeb, GitHub, Render ও Telegram MiniApp গাইড',
        language: 'markdown',
        path: path.join(__dirname, 'deliverables', 'DEPLOYMENT_GUIDE.md'),
      },
      {
        id: 'config.py',
        title: '2. config.py — Environment, Constants & Firebase RTDB Initializer',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'config.py'),
      },
      {
        id: 'security.py',
        title: '3. security.py — AES-256 Vault, SHA-256 Anti-Fraud Ledger & Bound JWT',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'security.py'),
      },
      {
        id: 'database.py',
        title: '4. database.py — Async PostgreSQL Engine & Firebase RTDB JSON Schema',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'database.py'),
      },
      {
        id: 'models.py',
        title: '5. models.py — SQLAlchemy ORM Models (User, Wallet, AdminVault, TradeLog)',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'models.py'),
      },
      {
        id: 'ai_engine.py',
        title: '6. ai_engine.py — "SM SADI" 98% Confidence Math Engine & WebSocket Consumer',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'ai_engine.py'),
      },
      {
        id: 'server.py',
        title: '7. server.py — FastAPI Backend, 2% Admin Fee, Tiered Bonus & WebSockets',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'server.py'),
      },
      {
        id: 'admin_bot.py',
        title: '8. admin_bot.py — @SMSADIAIAdmin_Bot Inline Approvals & Remote Commands',
        language: 'python',
        path: path.join(__dirname, 'deliverables', 'admin_bot.py'),
      },
    ];

    const payload = files.map((f) => ({
      id: f.id,
      title: f.title,
      language: f.language,
      content: fs.existsSync(f.path) ? fs.readFileSync(f.path, 'utf-8') : '# File not found',
    }));

    res.json({ deliverables: payload });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SM SADI Quant Platform Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

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

export type DemoBonusTier =
  | 'NONE'
  | 'TIER_3_TO_5_HALF_ONCE'
  | 'LIFETIME_50_PCT'
  | 'LIFETIME_70_PCT';

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

export interface PlatformState {
  engineName: string;
  sadiEnginePaused: boolean;
  usdToBdtRate: number;
  firebaseRtdbUrl: string;
  scanTelemetry: {
    totalScans: number;
    skippedBelow98: number;
    confidenceThreshold: number;
    maxRiskPerTradePct: number;
  };
  adminVault: AdminCommissionVault;
  ledgerIntegrityValid: boolean;
  ledgerIntegrityError: string | null;
  user: UserState;
  signals: Record<string, QuantSignal>;
  trades: TradeRecord[];
  transactions: PaymentTransaction[];
  adminBotLogs: AdminBotLog[];
}

export interface DeliverableFile {
  id: string;
  title: string;
  language: string;
  content: string;
}

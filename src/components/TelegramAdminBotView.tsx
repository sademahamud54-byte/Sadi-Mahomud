import React, { useState } from 'react';
import {
  UserState,
  PaymentTransaction,
  AdminBotLog,
  QuantSignal,
  AdminCommissionVault,
} from '../types';
import { Bot, Check, X, Send, Database, PauseCircle, PlayCircle, Coins } from 'lucide-react';

interface TelegramAdminBotViewProps {
  user: UserState;
  adminVault: AdminCommissionVault;
  sadiPaused: boolean;
  firebaseRtdbUrl: string;
  transactions: PaymentTransaction[];
  adminBotLogs: AdminBotLog[];
  signals: Record<string, QuantSignal>;
  onTransactionDecision: (txId: string, decision: 'APPROVE' | 'REJECT') => Promise<void>;
  onSendAdminCommand: (rawCommand: string) => Promise<void>;
}

const PRESET_COMMANDS = [
  { label: '/user_info 7504836023', cmd: '/user_info 7504836023' },
  { label: '/admin_vault', cmd: '/admin_vault' },
  { label: '/add_balance 7504836023 50', cmd: '/add_balance 7504836023 50' },
  { label: '/block_user 7504836023', cmd: '/block_user 7504836023' },
  { label: '/pause_sadi', cmd: '/pause_sadi' },
  { label: '/resume_sadi', cmd: '/resume_sadi' },
];

export const TelegramAdminBotView: React.FC<TelegramAdminBotViewProps> = ({
  user,
  adminVault,
  sadiPaused,
  firebaseRtdbUrl,
  transactions,
  adminBotLogs,
  signals,
  onTransactionDecision,
  onSendAdminCommand,
}) => {
  const [commandInput, setCommandInput] = useState<string>('/user_info 7504836023');
  const [busy, setBusy] = useState<boolean>(false);

  const pendingTxs = transactions.filter((t) => t.status === 'PENDING');

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    setBusy(true);
    try {
      await onSendAdminCommand(commandInput);
    } finally {
      setBusy(false);
    }
  };

  const liveRtdbJson = {
    databaseURL: firebaseRtdbUrl,
    system_state: {
      engine_name: 'SM SADI',
      sadi_active: !sadiPaused,
      confidence_threshold: 98.0,
      admin_service_fee_pct: 2.0,
    },
    admin_commission_vault: {
      admin_telegram_id: adminVault.adminTelegramId,
      total_fees_usd: adminVault.totalFeesUsd,
      total_fees_bdt: adminVault.totalFeesBdt,
      fee_deductions_count: adminVault.totalTradesCharged,
    },
    users: {
      [`tg_${user.telegramId}`]: {
        wallet: {
          active_mode: user.activeMode,
          real_balance_usd: user.realBalanceUsd,
          tradable_real_usd: Math.max(0, Number((user.realBalanceUsd - 2.0).toFixed(2))),
          demo_balance_usd: user.demoBalanceUsd,
          locked_bonus_usd: user.lockedBonusUsd,
          demo_bonus_tier: user.demoBonusTier,
          ledger_sha256: user.ledgerSha256,
        },
        auto_session: {
          is_running: user.autoTradingEnabled,
          duration_minutes: user.autoDurationMinutes,
          kill_switch_triggered: user.killSwitchTriggered,
        },
      },
    },
    live_signals: {
      BTCUSDT: signals['BTCUSDT'] || null,
    },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top 4 Cards: 3 Bot Architecture + 2% Admin Service Fee Vault */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neon-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-cyan-300 font-mono">
            <span>@SMSADIAI_Bot</span>
            <span>User TMA Bot</span>
          </div>
          <div className="mt-1.5 text-sm font-bold text-slate-100">
            Telegram Mini App WebApp Launcher
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Initializes $10,000,000 Demo &amp; $1.00 Welcome Real Balance with identical SM SADI execution.
          </p>
        </div>

        <div className="neon-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-cyan-300 font-mono">
            <span>@SMSADI_Official_Bot</span>
            <span>Support Router</span>
          </div>
          <div className="mt-1.5 text-sm font-bold text-slate-100">
            24/7 Official Support &amp; Ticket Routing
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Routes bKash/Nagad/Rocket verification inquiries and bonus tier questions to support staff.
          </p>
        </div>

        <div className="neon-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
            <span>@SMSADIAIAdmin_Bot</span>
            <span>ID: {adminVault.adminTelegramId}</span>
          </div>
          <div className="mt-1.5 text-sm font-bold text-slate-100">
            Remote Admin &amp; Tiered Approval Bot
          </div>
          <p className="mt-1 text-xs text-slate-400">
            1-click [Approve]/[Reject] for Deposits ($3–$5 / $5–$10 / $50+ bonus tiers) &amp; Withdrawals.
          </p>
        </div>

        {/* 2% Admin Service Fee Auto-Vault Card */}
        <div className="neon-card-active rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-300 font-mono">
            <span className="flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" />
              <span>2% App Service Fee Vault</span>
            </span>
            <span>AUTO-CREDITED</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
            <div className="text-2xl font-bold text-emerald-400">
              ${adminVault.totalFeesUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-cyan-300">
              ≈ {adminVault.totalFeesBdt.toLocaleString('en-US', { minimumFractionDigits: 2 })} BDT
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-300">
            প্রতি ট্রেডে ইউজারের আয়ের ২% অটো কেটে এডমিন একাউন্টে জমা হয় ({adminVault.totalTradesCharged} Trades)
          </div>
        </div>
      </div>

      {/* Main Grid: Left = Inline Approval Queue + Admin Command Console, Right = Firebase RTDB Live Sync */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Inline [Approve] / [Reject] Deposit & Withdrawal Notification Cards */}
          <div className="neon-card rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-cyan-500/15 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  @SMSADIAIAdmin_Bot — Inline Payment &amp; Bonus Tier Approval Queue
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Approving a Real Deposit unlocks $3–$5 (50% Once), $5–$10 (50% Lifetime), or $50+ (70% Lifetime) Demo Bonus
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-cyan-300">
                {pendingTxs.length} Pending
              </span>
            </div>

            {pendingTxs.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 text-center text-xs text-slate-400">
                All bKash, Nagad, and Rocket requests have been processed. Submit a Deposit ($2 / $4 / $6 / $50) from the Wallet tab to test live inline approval!
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingTxs.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-cyan-300 font-bold">{tx.type}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200 font-semibold">{tx.gateway}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-400">TxID: {tx.txId}</span>
                      </div>
                      <div className="text-slate-300 font-mono tabular-nums">
                        Amount: <strong>{tx.amountBdt.toFixed(2)} BDT</strong> (
                        <strong className="text-emerald-400">${tx.amountUsd.toFixed(2)} USD</strong>) · Number:{' '}
                        {tx.accountNumber}
                      </div>
                      {tx.type === 'DEPOSIT' && tx.amountUsd >= 50 && (
                        <div className="text-emerald-400 font-semibold">
                          ★ Activates LIFETIME 70% Demo Profit Bonus to Main Balance!
                        </div>
                      )}
                      {tx.type === 'DEPOSIT' && tx.amountUsd >= 5 && tx.amountUsd < 50 && (
                        <div className="text-cyan-300">
                          ★ Activates LIFETIME 50% Demo Profit Bonus to Main Balance!
                        </div>
                      )}
                      {tx.type === 'DEPOSIT' && tx.amountUsd >= 3 && tx.amountUsd < 5 && (
                        <div className="text-cyan-300">
                          ★ Unlocks 50% (Half) of Locked Demo Profit to Main Balance!
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onTransactionDecision(tx.id, 'APPROVE')}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>[Approve]</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onTransactionDecision(tx.id, 'REJECT')}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>[Reject]</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive @SMSADIAIAdmin_Bot Command Console */}
          <div className="neon-card rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-cyan-500/15 pb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  @SMSADIAIAdmin_Bot Remote Command Console
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                {sadiPaused ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <PauseCircle className="w-3.5 h-3.5" /> SM SADI PAUSED
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <PlayCircle className="w-3.5 h-3.5" /> SM SADI ACTIVE
                  </span>
                )}
              </div>
            </div>

            {/* Quick Command Triggers */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COMMANDS.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => {
                    setCommandInput(item.cmd);
                    onSendAdminCommand(item.cmd);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-950 hover:bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 cursor-pointer transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleCommandSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="/user_info 7504836023"
                className="flex-1 bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-100 outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="neon-btn-cyan px-4 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Execute</span>
              </button>
            </form>

            {/* Bot Message Stream */}
            <div className="bg-[#03060e] border border-slate-800/90 rounded-xl p-3.5 max-h-[270px] overflow-y-auto flex flex-col gap-2.5 font-mono text-xs">
              {adminBotLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800/80"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-cyan-400 font-semibold">{log.botHandle}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-200 whitespace-pre-wrap">{log.messageText}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live Firebase Realtime Database State Mirror */}
        <div className="lg:col-span-5 neon-card rounded-xl p-5 flex flex-col gap-4">
          <div className="border-b border-cyan-500/15 pb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Firebase Realtime Database Sync</span>
              </h3>
              <span className="text-xs font-mono text-emerald-400">LIVE SYNC</span>
            </div>
            <div className="mt-1 text-xs font-mono text-cyan-300 break-all">
              {firebaseRtdbUrl}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Real-time JSON tree pushed from the backend &amp; WebSocket consumer to synchronize $10M Demo / $1 Welcome Real balances, 2% Admin Vault fees, SHA-256 ledger seals, and 98% SM SADI signals.
          </p>

          <pre className="bg-[#03060e] border border-slate-800 rounded-xl p-4 text-xs font-mono text-cyan-200 overflow-x-auto max-h-[480px] leading-relaxed">
            {JSON.stringify(liveRtdbJson, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

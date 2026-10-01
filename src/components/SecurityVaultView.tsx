import React, { useState, useEffect } from 'react';
import { UserState } from '../types';
import { ShieldCheck, ShieldAlert, KeyRound, Lock, RefreshCw, Terminal } from 'lucide-react';

interface SecurityVaultViewProps {
  user: UserState;
  ledgerIntegrityValid: boolean;
  ledgerIntegrityError: string | null;
  onBindExchange: (payload: {
    exchange: string;
    apiKey: string;
    apiSecret: string;
    whitelistedIps: string;
    enableWithdrawals: boolean;
  }) => Promise<void>;
  onAuditAction: (
    action: 'SIMULATE_SQL_INJECTION' | 'RESTORE_SEAL' | 'ROTATE_JWT'
  ) => Promise<{ message: string }>;
}

export const SecurityVaultView: React.FC<SecurityVaultViewProps> = ({
  user,
  ledgerIntegrityValid,
  ledgerIntegrityError,
  onBindExchange,
  onAuditAction,
}) => {
  const [exchange, setExchange] = useState<'BINANCE' | 'KUCOIN' | 'MT5'>(
    user.exchangeConfig.exchange
  );
  const [apiKey, setApiKey] = useState<string>('vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A');
  const [apiSecret, setApiSecret] = useState<string>('NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j');
  const [whitelistedIps, setWhitelistedIps] = useState<string>(
    user.exchangeConfig.whitelistedIps.join(', ')
  );
  const [enableWithdrawalsTest, setEnableWithdrawalsTest] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [jwtRemainingSec, setJwtRemainingSec] = useState<number>(900);

  useEffect(() => {
    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      setJwtRemainingSec(Math.max(0, user.jwtSession.expiresAt - nowSec));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [user.jwtSession.expiresAt]);

  const handleExchangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await onBindExchange({
        exchange,
        apiKey,
        apiSecret,
        whitelistedIps,
        enableWithdrawals: enableWithdrawalsTest,
      });
      setFeedback({
        type: 'ok',
        text: `AES-256-GCM Encrypted ${exchange} API Keys sealed. Withdrawal permissions verified DISABLED and IP Whitelist enforced.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Failed to bind exchange API keys.' });
    }
  };

  const handleAudit = async (action: 'SIMULATE_SQL_INJECTION' | 'RESTORE_SEAL' | 'ROTATE_JWT') => {
    setFeedback(null);
    try {
      const res = await onAuditAction(action);
      setFeedback({
        type: action === 'SIMULATE_SQL_INJECTION' ? 'err' : 'ok',
        text: res.message,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    }
  };

  const mins = Math.floor(jwtRemainingSec / 60);
  const secs = jwtRemainingSec % 60;

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <div
          className={`rounded-xl p-4 text-xs border flex items-start gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          {feedback.type === 'ok' ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Cryptographic SHA-256 Anti-Fraud Ledger Verifier */}
        <div className="lg:col-span-7 neon-card rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-cyan-500/15 pb-3.5">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Cryptographic SHA-256 Anti-Fraud Balance Ledger
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Detects manual SQL tampering or injection and locks compromised accounts instantaneously
              </p>
            </div>
            <span
              className={`text-xs font-mono font-semibold ${
                ledgerIntegrityValid && !user.isCompromisedLocked
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {ledgerIntegrityValid && !user.isCompromisedLocked
                ? 'SHA-256 SEAL VERIFIED'
                : 'TAMPER DETECTED — ACCOUNT LOCKED'}
            </span>
          </div>

          {(!ledgerIntegrityValid || user.isCompromisedLocked) && (
            <div className="bg-rose-950/70 border border-rose-500/60 rounded-lg p-3.5 text-xs text-rose-200 font-mono">
              {ledgerIntegrityError || user.compromisedReason}
            </div>
          )}

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 font-mono tabular-nums text-xs flex flex-col gap-2.5">
            <div className="flex justify-between text-slate-400">
              <span>Canonical State Vector:</span>
              <span className="text-cyan-300">Nonce #{user.ledgerNonce}</span>
            </div>
            <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-slate-300 break-all">
              UID:{user.userId}|REAL:{user.realBalanceUsd.toFixed(4)}|DEMO:
              {user.demoBalanceUsd.toFixed(4)}|BONUS:{user.lockedBonusUsd.toFixed(4)}|NONCE:
              {user.ledgerNonce}|SALT:[REDACTED_256_BIT]
            </div>
            <div className="text-slate-400 mt-1">Active SHA-256 Ledger Signature:</div>
            <div className="p-2.5 bg-cyan-950/30 rounded border border-cyan-500/30 text-cyan-300 break-all font-semibold">
              {user.ledgerSha256}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleAudit('SIMULATE_SQL_INJECTION')}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-500/40 flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulate Unauthorized SQL Tamper (+$5,000)</span>
            </button>
            <button
              type="button"
              onClick={() => handleAudit('RESTORE_SEAL')}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border border-emerald-500/40 flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Restore & Re-Seal SHA-256 Ledger</span>
            </button>
          </div>

          {/* 2. Short-Lived 15-Minute JWT Session & Device Fingerprint Binding */}
          <div className="border-t border-cyan-500/15 pt-4 mt-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-100">
                  Short-Lived JWT Session (15-Min Expiry) & Device Binding
                </h4>
                <p className="text-xs text-slate-400">
                  Hardware Fingerprint Bound (`dfp`) to prevent session hijacking
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAudit('ROTATE_JWT')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rotate JWT</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-400 block">Device Fingerprint (`dfp`)</span>
                <span className="text-slate-200">{user.jwtSession.deviceFingerprint}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block">15-Min Token TTL</span>
                <span className="text-cyan-300 font-bold">
                  {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s remaining
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. AES-256 Exchange API Key Vault (No-Withdrawal Mandate) */}
        <div className="lg:col-span-5 neon-card rounded-xl p-5 flex flex-col gap-4">
          <div className="border-b border-cyan-500/15 pb-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                <span>AES-256 Exchange Key Vault</span>
              </h3>
              <span className="text-xs font-mono text-emerald-400">AES-256-GCM</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict IP Whitelisting · Withdrawal Permissions Strictly Disabled
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Active Exchange:</span>
              <span className="text-cyan-300 font-semibold">{user.exchangeConfig.exchange}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Encrypted Key:</span>
              <span className="text-slate-300">{user.exchangeConfig.encryptedApiKeyPreview}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Withdrawal Permission:</span>
              <span className="text-emerald-400 font-semibold">DISABLED (Verified)</span>
            </div>
          </div>

          <form onSubmit={handleExchangeSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Exchange Feed</label>
              <div className="grid grid-cols-3 gap-2">
                {(['BINANCE', 'KUCOIN', 'MT5'] as const).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setExchange(ex)}
                    className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      exchange === ex
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Exchange API Key (Encrypted at Rest via AES-256-GCM)
              </label>
              <input
                type="text"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Exchange API Secret
              </label>
              <input
                type="password"
                required
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Mandatory Whitelisted Server IPs (Comma-Separated)
              </label>
              <input
                type="text"
                required
                value={whitelistedIps}
                onChange={(e) => setWhitelistedIps(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={enableWithdrawalsTest}
                onChange={(e) => setEnableWithdrawalsTest(e.target.checked)}
                className="rounded accent-rose-500"
              />
              <span>
                Test Security Guard: Simulate API Key with <strong>Withdrawal Enabled</strong> (Will be blocked)
              </span>
            </label>

            <button
              type="submit"
              className="neon-btn-cyan w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Encrypt & Seal Exchange API Key (AES-256)</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { UserState, PaymentTransaction } from '../types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface WalletGatewayViewProps {
  user: UserState;
  usdToBdtRate: number;
  transactions: PaymentTransaction[];
  onSwitchWalletMode: (mode: 'DEMO' | 'REAL') => Promise<void>;
  onSubmitDeposit: (payload: {
    gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
    senderNumber: string;
    txId: string;
    amountBdt: number;
  }) => Promise<any>;
  onSubmitWithdraw: (payload: {
    gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
    receiverNumber: string;
    amountUsd: number;
  }) => Promise<any>;
  initialTab?: 'DEPOSIT' | 'WITHDRAW';
}

const GATEWAYS: Array<{
  id: 'BKASH' | 'NAGAD' | 'ROCKET';
  name: string;
  merchantNumber: string;
  txRegexHint: string;
  sampleTxId: string;
}> = [
  {
    id: 'BKASH',
    name: 'bKash Personal / Merchant',
    merchantNumber: '+8801711009922',
    txRegexHint: '10-char Uppercase Alphanumeric (^[A-Z0-9]{10}$)',
    sampleTxId: 'BK98X72M4Q',
  },
  {
    id: 'NAGAD',
    name: 'Nagad Instant Gateway',
    merchantNumber: '+8801822994411',
    txRegexHint: '8–12 char Alphanumeric (^[A-Z0-9]{8,12}$)',
    sampleTxId: 'NGD8472910A',
  },
  {
    id: 'ROCKET',
    name: 'Rocket (DBBL Mobile)',
    merchantNumber: '+8801933881100',
    txRegexHint: '9–12 Numeric Digits (^[0-9]{9,12}$)',
    sampleTxId: '8492019384',
  },
];

const DEPOSIT_TIER_PRESETS = [
  { label: '$2 Min Deposit', usd: 2, desc: 'Unlocks Real Trading above $2 Hold' },
  { label: '$3–$5 Tier (50% Once)', usd: 4, desc: '1st Deposit $3–$5 → 50% Demo Profit Bonus' },
  { label: '$5–$10 Tier (50% Lifetime)', usd: 6, desc: '1st Deposit $5–$10 → 50% Lifetime Demo Bonus' },
  { label: '$50+ Tier (70% Lifetime)', usd: 50, desc: 'Deposit $50+ → 70% Lifetime Demo Bonus to Main' },
];

export const WalletGatewayView: React.FC<WalletGatewayViewProps> = ({
  user,
  usdToBdtRate,
  transactions,
  onSwitchWalletMode,
  onSubmitDeposit,
  onSubmitWithdraw,
  initialTab = 'DEPOSIT',
}) => {
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW'>(initialTab);
  const [selectedGateway, setSelectedGateway] = useState<'BKASH' | 'NAGAD' | 'ROCKET'>('BKASH');
  const [phoneNumber, setPhoneNumber] = useState<string>('+8801711948201');
  const [txId, setTxId] = useState<string>('BK98X72M4Q');
  const [amountBdt, setAmountBdt] = useState<string>(String((6 * usdToBdtRate).toFixed(2)));
  const [withdrawUsd, setWithdrawUsd] = useState<string>('5.00');
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(false);

  const gwMeta = GATEWAYS.find((g) => g.id === selectedGateway)!;
  const convertedDepositUsd = Number(((parseFloat(amountBdt) || 0) / usdToBdtRate).toFixed(2));
  const convertedWithdrawBdt = Number(((parseFloat(withdrawUsd) || 0) * usdToBdtRate).toFixed(2));
  const maxWithdrawableUsd = Math.max(0, Number((user.realBalanceUsd - 2.0).toFixed(2)));

  const getTierLabel = (tier: UserState['demoBonusTier']) => {
    switch (tier) {
      case 'LIFETIME_70_PCT':
        return 'LIFETIME 70% DEMO BONUS ACTIVE ($50+ Tier)';
      case 'LIFETIME_50_PCT':
        return 'LIFETIME 50% DEMO BONUS ACTIVE ($5–$10 Tier)';
      case 'TIER_3_TO_5_HALF_ONCE':
        return '50% FIRST-DEPOSIT BONUS CLAIMED ($3–$5 Tier)';
      default:
        return 'NO TIER UNLOCKED YET (Deposit $3+ / $5+ / $50+)';
    }
  };

  const handleGatewaySelect = (gw: 'BKASH' | 'NAGAD' | 'ROCKET') => {
    setSelectedGateway(gw);
    const found = GATEWAYS.find((g) => g.id === gw)!;
    setTxId(found.sampleTxId);
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);
    try {
      const res = await onSubmitDeposit({
        gateway: selectedGateway,
        senderNumber: phoneNumber,
        txId,
        amountBdt: parseFloat(amountBdt) || 0,
      });
      setStatusMessage({
        type: 'ok',
        text: `Webhook Verified! Deposit ${res.transaction.id} ($${res.transaction.amountUsd.toFixed(
          2
        )} USD) queued in @SMSADIAIAdmin_Bot. ${res.projectedTierBenefit || ''}`,
      });
      const randomSuffix = Math.floor(100 + Math.random() * 899);
      if (selectedGateway === 'BKASH') setTxId(`BK98X72${randomSuffix}`);
      if (selectedGateway === 'NAGAD') setTxId(`NGD8472${randomSuffix}A`);
      if (selectedGateway === 'ROCKET') setTxId(`8492019${randomSuffix}`);
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err.message || 'Deposit submission failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setLoading(true);
    try {
      const res = await onSubmitWithdraw({
        gateway: selectedGateway,
        receiverNumber: phoneNumber,
        amountUsd: parseFloat(withdrawUsd) || 0,
      });
      setStatusMessage({
        type: 'ok',
        text: `Withdrawal ${res.transaction.id} ($${res.transaction.amountUsd.toFixed(
          2
        )} USD / ${res.transaction.amountBdt.toFixed(
          2
        )} BDT) queued for payout! Remaining Real Wallet Hold: $${res.user.realBalanceUsd.toFixed(
          2
        )} USD (>= $2.00 Mandatory Hold Rule verified).`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err.message || 'Withdrawal request failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Dual Balance Cards + Tiered Demo Bonus Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Real Wallet Card ($1.00 Welcome + $2.00 Non-Tradable/Non-Withdrawable Hold) */}
        <div
          onClick={() => onSwitchWalletMode('REAL')}
          className={`${
            user.activeMode === 'REAL' ? 'neon-card-active' : 'neon-card'
          } rounded-xl p-5 cursor-pointer transition-all`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Main Real Account ($1.00 Welcome Bonus)</span>
            <span
              className={
                user.activeMode === 'REAL' ? 'text-cyan-300 font-semibold' : 'text-slate-500'
              }
            >
              {user.activeMode === 'REAL' ? 'ACTIVE WALLET' : 'Click to Activate'}
            </span>
          </div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-50">
            ${user.realBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-cyan-300">
            ≈ {(user.realBalanceUsd * usdToBdtRate).toLocaleString('en-US', { minimumFractionDigits: 2 })} BDT
            <span className="text-slate-400 ml-1.5">(1 USD = {usdToBdtRate.toFixed(2)} BDT)</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-amber-300">Mandatory Locked Hold: $2.00</span>
            <span className="font-mono text-emerald-400 font-semibold">
              Tradable/Withdrawable: ${maxWithdrawableUsd.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Demo Wallet Card ($10,000,000 Virtual) */}
        <div
          onClick={() => onSwitchWalletMode('DEMO')}
          className={`${
            user.activeMode === 'DEMO' ? 'neon-card-active' : 'neon-card'
          } rounded-xl p-5 cursor-pointer transition-all`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Demo Account (১,০০,০০,০০০ ডলার)</span>
            <span
              className={
                user.activeMode === 'DEMO' ? 'text-cyan-300 font-semibold' : 'text-slate-500'
              }
            >
              {user.activeMode === 'DEMO' ? 'ACTIVE WALLET' : 'Click to Activate'}
            </span>
          </div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-50">
            ${user.demoBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Identical &ldquo;SM SADI&rdquo; AI Execution · 2% App Fee Deducted on Profits
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Lifetime Demo Bonus Credited to Main:</span>
            <span className="font-mono text-cyan-300 font-semibold">
              +${user.totalDemoBonusCreditedUsd.toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Locked Demo Bonus & Tier Status Card */}
        <div className="neon-card rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-cyan-400" />
                <span>Demo Profit Bonus Vault</span>
              </span>
              <span className="font-mono text-cyan-300 flex items-center gap-1">
                {user.demoBonusTier === 'LIFETIME_70_PCT' ||
                user.demoBonusTier === 'LIFETIME_50_PCT' ? (
                  <>
                    <Unlock className="w-3 h-3 text-emerald-400" /> Auto-Streaming
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3" /> Pending Deposit Tier
                  </>
                )}
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-cyan-300">
              ${user.lockedBonusUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-xs font-mono text-emerald-400">
              {getTierLabel(user.demoBonusTier)}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-300 bg-cyan-950/40 border border-cyan-500/25 rounded-lg p-2.5 space-y-1">
            <div>
              • <strong>১ম ডিপোজিট $3–$5:</strong> ডেমো লাভের <strong>৫০% বোনাস</strong> মেইন ব্যালেন্সে যোগ হবে।
            </div>
            <div>
              • <strong>১ম ডিপোজিট $5–$10:</strong> <strong>লাইফটাইম ৫০%</strong> ডেমো লাভ সরাসরি মেইন ব্যালেন্সে যোগ হবে।
            </div>
            <div>
              • <strong>ডিপোজিট $50+:</strong> <strong>লাইফটাইম ৭০%</strong> ডেমো লাভ সরাসরি মেইন ব্যালেন্সে যোগ হবে!
            </div>
          </div>
        </div>
      </div>

      {/* Main Local Payment Gateway Form & Transaction History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: bKash / Nagad / Rocket Form */}
        <div className="lg:col-span-5 neon-card rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('DEPOSIT');
                setStatusMessage(null);
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'DEPOSIT'
                  ? 'neon-btn-cyan text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Deposit (Min $2.00)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('WITHDRAW');
                setStatusMessage(null);
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'WITHDRAW'
                  ? 'neon-btn-cyan text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Withdraw ($2 Hold)</span>
            </button>
          </div>

          {/* Gateway Selector (bKash, Nagad, Rocket) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Select Bangladesh Local Payment Gateway
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GATEWAYS.map((gw) => (
                <button
                  key={gw.id}
                  type="button"
                  onClick={() => handleGatewaySelect(gw.id)}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    selectedGateway === gw.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_15px_-3px_rgba(34,211,238,0.4)]'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {gw.id}
                </button>
              ))}
            </div>
          </div>

          {statusMessage && (
            <div
              className={`rounded-lg p-3 text-xs flex items-start gap-2 border ${
                statusMessage.type === 'ok'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              }`}
            >
              {statusMessage.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {activeTab === 'DEPOSIT' ? (
            <form onSubmit={handleDepositSubmit} className="flex flex-col gap-3.5">
              {/* Quick Tier Preset Buttons */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Quick Select Deposit Bonus Tier:</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {DEPOSIT_TIER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setAmountBdt(String((preset.usd * usdToBdtRate).toFixed(2)))}
                      className="text-left p-2 rounded-lg bg-slate-950/90 hover:bg-cyan-950/50 border border-slate-800 hover:border-cyan-500/40 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold font-mono text-cyan-300">
                        {preset.label} ({(preset.usd * usdToBdtRate).toFixed(0)} BDT)
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">{gwMeta.name} Merchant:</span>
                  <span className="font-mono text-cyan-300 font-semibold">
                    {gwMeta.merchantNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Minimum Deposit ($2.00 USD):</span>
                  <span className="font-mono text-amber-300 font-semibold">
                    {(2 * usdToBdtRate).toFixed(2)} BDT
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Sender {selectedGateway} Mobile Number (+8801XXXXXXXXX)
                </label>
                <input
                  type="text"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Deposit Amount (BDT)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={2 * usdToBdtRate}
                    required
                    value={amountBdt}
                    onChange={(e) => setAmountBdt(e.target.value)}
                    className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Converted Credit (USD)
                  </label>
                  <div className="w-full bg-slate-900/70 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-cyan-300 font-semibold">
                    ${convertedDepositUsd.toFixed(2)} USD
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Gateway Transaction ID (TxID — S2S Webhook Validated)
                </label>
                <input
                  type="text"
                  required
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-sm font-mono uppercase text-slate-100 outline-none"
                />
              </div>

              {convertedDepositUsd >= 50.0 ? (
                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-300">
                  ★ <strong>$50+ VIP Tier:</strong> Approving this deposit activates <strong>LIFETIME 70% Demo Profit Bonus</strong> directly to your Main Real Balance!
                </div>
              ) : convertedDepositUsd >= 5.0 && user.firstRealDepositUsd === 0 ? (
                <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-lg px-3 py-2 text-xs text-cyan-300">
                  ★ <strong>$5–$10 First Deposit Tier:</strong> Approving this deposit activates <strong>LIFETIME 50% Demo Profit Bonus</strong> to your Main Real Balance!
                </div>
              ) : convertedDepositUsd >= 3.0 && user.firstRealDepositUsd === 0 ? (
                <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-lg px-3 py-2 text-xs text-cyan-300">
                  ★ <strong>$3–$5 First Deposit Tier:</strong> Approving this deposit unlocks <strong>50% (Half)</strong> of your accumulated Demo Profit (+${(user.lockedBonusUsd * 0.5).toFixed(2)} USD) to Main Balance!
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="neon-btn-cyan w-full py-3 px-4 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {loading
                  ? 'Verifying Webhook Signature...'
                  : `Verify & Submit ${selectedGateway} Deposit ($${convertedDepositUsd.toFixed(2)} USD)`}
              </button>
            </form>
          ) : (
            <form onSubmit={handleWithdrawSubmit} className="flex flex-col gap-3.5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Main Real Balance:</span>
                  <span className="font-mono tabular-nums text-slate-100 font-semibold">
                    ${user.realBalanceUsd.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Non-Tradable / Non-Withdrawable Hold:</span>
                  <span className="font-mono tabular-nums text-amber-300 font-semibold">
                    $2.00 USD (অবশ্যই একাউন্টে থাকবে)
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-1 mt-1">
                  <span className="text-slate-300 font-medium">Maximum Withdrawable Now:</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-bold">
                    ${maxWithdrawableUsd.toFixed(2)} USD
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Receiver {selectedGateway} Wallet Number (+8801XXXXXXXXX)
                </label>
                <input
                  type="text"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-sm font-mono text-slate-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Withdraw Amount (USD)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    value={withdrawUsd}
                    onChange={(e) => setWithdrawUsd(e.target.value)}
                    className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Payout in BDT ({selectedGateway})
                  </label>
                  <div className="w-full bg-slate-900/70 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm font-mono tabular-nums text-emerald-400 font-semibold">
                    {convertedWithdrawBdt.toLocaleString('en-US', { minimumFractionDigits: 2 })} BDT
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="neon-btn-cyan w-full py-3 px-4 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {loading
                  ? 'Verifying SHA-256 Ledger & $2 Hold Rule...'
                  : `Request ${selectedGateway} Withdrawal (${convertedWithdrawBdt.toFixed(0)} BDT)`}
              </button>
            </form>
          )}
        </div>

        {/* Right: Real-Time Webhook Ledger & Payment History */}
        <div className="lg:col-span-7 neon-card rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-cyan-500/15 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                bKash / Nagad / Rocket Webhook &amp; Bonus Ledger
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Min Deposit $2.00 · Tiered Demo Bonus Unlock ($3–$5: 50% Once | $5–$10: 50% Lifetime | $50+: 70% Lifetime)
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {transactions.length} Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-2.5 px-3 font-medium">TxID / Gateway</th>
                  <th className="py-2.5 px-3 font-medium">Type &amp; Bonus Tier</th>
                  <th className="py-2.5 px-3 font-medium text-right">Amount (BDT)</th>
                  <th className="py-2.5 px-3 font-medium text-right">USD Value</th>
                  <th className="py-2.5 px-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100">{tx.txId}</div>
                      <div className="text-slate-400 font-sans">
                        {tx.gateway} · {tx.accountNumber}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      <div>{tx.type}</div>
                      {tx.unlockedBonusUsd > 0 && (
                        <div className="text-emerald-400 font-sans">
                          +${tx.unlockedBonusUsd.toFixed(2)} Demo Bonus → Main
                        </div>
                      )}
                      {tx.appliedBonusTier && tx.appliedBonusTier !== 'NONE' && (
                        <div className="text-cyan-300 font-sans text-[11px]">
                          Tier: {tx.appliedBonusTier}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {tx.amountBdt.toLocaleString('en-US', { minimumFractionDigits: 2 })} BDT
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-cyan-300">
                      ${tx.amountUsd.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={
                          tx.status === 'APPROVED'
                            ? 'text-emerald-400 font-semibold'
                            : tx.status === 'REJECTED'
                            ? 'text-rose-400 font-semibold'
                            : 'text-amber-300 font-semibold'
                        }
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

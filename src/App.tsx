import React, { useEffect, useState, useCallback } from 'react';
import { PlatformState, TradeRecord } from './types';
import { LiveQuantChart } from './components/LiveQuantChart';
import { TradingControlPanel } from './components/TradingControlPanel';
import { WalletGatewayView } from './components/WalletGatewayView';
import { SecurityVaultView } from './components/SecurityVaultView';
import { TelegramAdminBotView } from './components/TelegramAdminBotView';
import { DeliverablesCodeView } from './components/DeliverablesCodeView';
import { ShieldCheck, ShieldAlert, X, Search } from 'lucide-react';

type NavSection = 'TERMINAL' | 'WALLET' | 'SECURITY' | 'ADMIN_BOT' | 'DELIVERABLES';

export default function App() {
  const [state, setState] = useState<PlatformState | null>(null);
  const [activeNav, setActiveNav] = useState<NavSection>('TERMINAL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [walletModalTab, setWalletModalTab] = useState<'DEPOSIT' | 'WITHDRAW' | null>(null);
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'AUTO' | 'MANUAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [miniAppOpen, setMiniAppOpen] = useState<boolean>(false);
  const [miniAppMinimized, setMiniAppMinimized] = useState<boolean>(false);
  const [syncingBotMsg, setSyncingBotMsg] = useState<string | null>(null);

  const handleSyncTelegramMiniApp = async () => {
    setSyncingBotMsg('Syncing Telegram /start & Menu Button...');
    try {
      const res = await fetch('/api/telegram/sync-miniapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUrl: window.location.origin }),
      });
      await res.json();
      setSyncingBotMsg('✅ Telegram /start > 🚀 Open SM AI TRADER > ⛏️ MiniApp সক্রিয় হয়েছে!');
      setTimeout(() => setSyncingBotMsg(null), 5000);
    } catch {
      setSyncingBotMsg('Telegram Bot sync triggered.');
    }
  };

  const fetchPlatformState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as PlatformState;
        setState(data);
      }
    } catch {
      // ignore transient network error
    }
  }, []);

  useEffect(() => {
    fetchPlatformState();
    const interval = setInterval(fetchPlatformState, 3500);
    return () => clearInterval(interval);
  }, [fetchPlatformState]);

  const handleSwitchWalletMode = async (mode: 'DEMO' | 'REAL') => {
    const res = await fetch('/api/wallet/switch-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to switch wallet mode');
    await fetchPlatformState();
  };

  const handleUpdateAutoConfig = async (payload: {
    enabled: boolean;
    durationMinutes: number;
    reserveBalanceUsd: number;
    minInvestmentUsd: number;
    maxInvestmentUsd: number;
    accountStopLimitEnabled?: boolean;
    accountStopLimitUsd?: number;
  }) => {
    const res = await fetch('/api/trade/auto-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      await fetchPlatformState();
      throw new Error(data.error || 'Failed to update auto-trading settings');
    }
    await fetchPlatformState();
  };

  const handleExecuteManualTrade = async (
    symbol: string,
    stakeUsd: number,
    durationMinutes: number = 1,
    executionMode: 'AUTO' | 'MANUAL' = 'MANUAL'
  ): Promise<{
    trade: TradeRecord;
    riskSummary: string;
    adminFeeSummary?: string;
    demoBonusSummary?: string;
  } | null> => {
    const res = await fetch('/api/trade/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        requestedStakeUsd: stakeUsd,
        durationMinutes,
        executionMode,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      await fetchPlatformState();
      throw new Error(data.error || 'Trade execution failed');
    }
    await fetchPlatformState();
    return {
      trade: data.trade,
      riskSummary: data.riskSummary,
      adminFeeSummary: data.adminFeeSummary,
      demoBonusSummary: data.demoBonusSummary,
    };
  };

  const handleClaimGoldCoin = async () => {
    await fetch('/api/rewards/claim-gold-coin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    await fetchPlatformState();
  };

  const handleSubmitDeposit = async (payload: {
    gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
    senderNumber: string;
    txId: string;
    amountBdt: number;
  }) => {
    const res = await fetch('/api/payments/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deposit failed');
    await fetchPlatformState();
    return data;
  };

  const handleSubmitWithdraw = async (payload: {
    gateway: 'BKASH' | 'NAGAD' | 'ROCKET';
    receiverNumber: string;
    amountUsd: number;
  }) => {
    const res = await fetch('/api/payments/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Withdrawal failed');
    await fetchPlatformState();
    return data;
  };

  const handleTransactionDecision = async (txId: string, decision: 'APPROVE' | 'REJECT') => {
    const res = await fetch('/api/admin/transaction-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txId, decision }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Admin decision failed');
    await fetchPlatformState();
  };

  const handleSendAdminCommand = async (rawCommand: string) => {
    await fetch('/api/admin/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawCommand }),
    });
    await fetchPlatformState();
  };

  const handleBindExchange = async (payload: {
    exchange: string;
    apiKey: string;
    apiSecret: string;
    whitelistedIps: string;
    enableWithdrawals: boolean;
  }) => {
    const res = await fetch('/api/security/bind-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Exchange API binding failed');
    await fetchPlatformState();
  };

  const handleSecurityAuditAction = async (
    action: 'SIMULATE_SQL_INJECTION' | 'RESTORE_SEAL' | 'ROTATE_JWT'
  ) => {
    const res = await fetch('/api/security/simulate-tamper-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    await fetchPlatformState();
    return { message: data.message };
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-[#040711] text-slate-100 flex items-center justify-center p-6">
        <div className="neon-card rounded-2xl p-8 max-w-md w-full text-center space-y-3">
          <div className="text-xl font-bold font-display tracking-wider text-cyan-300">
            SM SADI
          </div>
          <div className="text-xs font-mono text-slate-400">
            Initializing 98% Confidence Quant Engine &amp; SHA-256 Anti-Fraud Ledger...
          </div>
        </div>
      </div>
    );
  }

  const { user, adminVault, signals, trades, transactions, adminBotLogs, usdToBdtRate } = state;
  const activeBalanceUsd =
    user.activeMode === 'REAL' ? user.realBalanceUsd : user.demoBalanceUsd;
  const pendingAdminCount = transactions.filter((t) => t.status === 'PENDING').length;

  const filteredTrades = trades.filter((t) => {
    if (tradeFilter !== 'ALL' && t.executionMode !== tradeFilter) return false;
    if (
      searchQuery.trim() &&
      !t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !t.id.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#040711] text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 bg-[#040711]/90 backdrop-blur-md border-b border-cyan-500/20 px-6 py-3.5 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#terminal"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('TERMINAL');
          }}
          className="text-xl font-extrabold font-display tracking-wider text-cyan-300 whitespace-nowrap"
        >
          SM SADI
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a
            href="#terminal"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('TERMINAL');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'TERMINAL'
                ? 'text-cyan-300 border-b-2 border-cyan-400'
                : 'hover:text-cyan-200'
            }`}
          >
            Terminal
          </a>
          <a
            href="#wallet"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('WALLET');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'WALLET'
                ? 'text-cyan-300 border-b-2 border-cyan-400'
                : 'hover:text-cyan-200'
            }`}
          >
            Wallet &amp; Bonus Tiers
          </a>
          <a
            href="#security"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('SECURITY');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'SECURITY'
                ? 'text-cyan-300 border-b-2 border-cyan-400'
                : 'hover:text-cyan-200'
            }`}
          >
            Security Vault
          </a>
          <a
            href="#admin-bot"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('ADMIN_BOT');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'ADMIN_BOT'
                ? 'text-cyan-300 border-b-2 border-cyan-400'
                : 'hover:text-cyan-200'
            }`}
          >
            Admin Bot ({pendingAdminCount})
          </a>
          <a
            href="#deliverables"
            onClick={(e) => {
              e.preventDefault();
              setActiveNav('DELIVERABLES');
            }}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'DELIVERABLES'
                ? 'text-cyan-300 border-b-2 border-cyan-400'
                : 'hover:text-cyan-200'
            }`}
          >
            Source &amp; Free Deploy
          </a>
        </nav>

        {/* Zone 3: 2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setWalletModalTab('DEPOSIT')}
            className="neon-btn-cyan px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
          >
            Deposit BDT/USD
          </button>
          <button
            type="button"
            onClick={() => setWalletModalTab('WITHDRAW')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 transition-colors whitespace-nowrap cursor-pointer"
          >
            Withdraw
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden flex items-center justify-around border-b border-slate-800 bg-[#060b19] px-2 py-2 text-xs font-medium text-slate-400 overflow-x-auto">
        {(
          [
            ['TERMINAL', 'Terminal'],
            ['WALLET', 'Wallet'],
            ['SECURITY', 'Security'],
            ['ADMIN_BOT', `Admin (${pendingAdminCount})`],
            ['DELIVERABLES', 'Code'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveNav(key)}
            className={`px-2.5 py-1.5 rounded whitespace-nowrap ${
              activeNav === key ? 'text-cyan-300 font-semibold bg-cyan-500/15' : ''
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Content Container */}
      <main className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Global SHA-256 Anti-Fraud Lock Banner if Tampered */}
        {(!state.ledgerIntegrityValid || user.isCompromisedLocked) && (
          <div className="bg-rose-950/80 border border-rose-500 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 text-xs text-rose-200">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-rose-100">
                  ANTI-FRAUD SHA-256 LEDGER LOCK TRIGGERED
                </div>
                <div className="mt-0.5 font-mono">
                  {state.ledgerIntegrityError || user.compromisedReason}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSecurityAuditAction('RESTORE_SEAL')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap cursor-pointer shrink-0"
            >
              Restore &amp; Reseal Ledger
            </button>
          </div>
        )}

        {activeNav === 'TERMINAL' && (
          <>
            {/* Top Glowing Status Strip: Wallet Mode Switcher, Tiered Bonus Vault, 2% Admin Fee & SHA-256 Seal */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* 1. Real ($1 Welcome) / Demo ($10,000,000) Wallet Switcher Card */}
              <div className="neon-card-active rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {user.activeMode === 'DEMO'
                      ? 'Demo Balance ($10M)'
                      : 'Main Balance ($1 Welcome)'}
                  </span>
                  <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-cyan-500/30">
                    <button
                      type="button"
                      onClick={() => handleSwitchWalletMode('DEMO')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        user.activeMode === 'DEMO'
                          ? 'bg-cyan-500/25 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Demo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchWalletMode('REAL')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        user.activeMode === 'REAL'
                          ? 'bg-emerald-500/25 text-emerald-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Main
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-50">
                    ${activeBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-cyan-300">
                    Main: ${user.realBalanceUsd.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* 2. Tiered Demo Profit Bonus Card ($3-$5: 50% | $5-$10: 50% Lifetime | $50+: 70% Lifetime) */}
              <div className="neon-card rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Demo Profit Bonus Vault</span>
                  <span className="text-cyan-300 font-mono">
                    {user.demoBonusTier === 'LIFETIME_70_PCT'
                      ? '70% Lifetime Active'
                      : user.demoBonusTier === 'LIFETIME_50_PCT'
                      ? '50% Lifetime Active'
                      : '50% / 70% Tiers'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div className="text-2xl font-bold font-mono tabular-nums text-cyan-300">
                    ${user.lockedBonusUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalletModalTab('DEPOSIT')}
                    className="text-xs text-emerald-400 hover:underline cursor-pointer"
                  >
                    {user.demoBonusTier === 'NONE'
                      ? 'Deposit $3 / $5 / $50 →'
                      : `+${user.totalDemoBonusCreditedUsd.toFixed(2)} Credited`}
                  </button>
                </div>
              </div>

              {/* 3. 2% Admin Service Fee & 98% SM SADI Filter */}
              <div
                onClick={() => setActiveNav('ADMIN_BOT')}
                className="neon-card rounded-xl p-4 flex flex-col justify-between cursor-pointer hover:border-cyan-400/50 transition-colors"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>2% App Service Fee (Admin Auto)</span>
                  <span className="font-mono text-amber-300">ID: {adminVault.adminTelegramId}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                  <div className="text-xl font-bold text-emerald-400">
                    ${adminVault.totalFeesUsd.toFixed(2)} USD
                  </div>
                  <div className="text-xs text-amber-300 font-bold">
                    🪙 {user.goldCoins || 0} Gold Coins
                  </div>
                </div>
              </div>

              {/* 4. SHA-256 Cryptographic Anti-Fraud Ledger Seal */}
              <div
                onClick={() => setActiveNav('SECURITY')}
                className="neon-card rounded-xl p-4 flex flex-col justify-between cursor-pointer hover:border-cyan-400/50 transition-colors"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>SHA-256 Anti-Fraud Ledger</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Nonce #{user.ledgerNonce}</span>
                  </span>
                </div>
                <div className="mt-2 text-xs font-mono text-cyan-300 truncate">
                  {user.ledgerSha256}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  $2.00 Mandatory Non-Tradable Hold
                </div>
              </div>
            </div>

            {/* Primary Workspace Grid: Left 8 Cols = Live Chart, Right 4 Cols = Auto/Manual Control Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8">
                <LiveQuantChart
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={setSelectedSymbol}
                  signals={signals}
                  sadiPaused={state.sadiEnginePaused}
                />
              </div>
              <div className="lg:col-span-4">
                <TradingControlPanel
                  user={user}
                  selectedSymbol={selectedSymbol}
                  currentSignal={signals[selectedSymbol]}
                  sadiPaused={state.sadiEnginePaused}
                  onUpdateConfig={handleUpdateAutoConfig}
                  onExecuteManualTrade={handleExecuteManualTrade}
                  onClaimGoldCoin={handleClaimGoldCoin}
                  onReturnHome={() => setActiveNav('TERMINAL')}
                />
              </div>
            </div>

            {/* Bottom Section: High-Density Verified Trade Execution Ledger */}
            <div className="neon-card rounded-xl p-5 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/15 pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    SM SADI [AI CODE NAME] Execution Ledger (Identical Demo &amp; Main · 2% Admin Fee Auto-Deducted)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Every trade executes at &ge;98% confidence, deducts 2% service charge to Admin Account ({adminVault.adminTelegramId}), and applies Demo Bonus Tiers
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter symbol, Trade ID, or @user..."
                      className="bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none"
                    />
                  </div>

                  {/* প্রোফাইল ছবি + ইউজার নামের ডান পাশে "🚀 Open SM AI TRADER" বাটন */}
                  <div className="flex items-center gap-2.5 bg-slate-950/95 border border-cyan-500/35 rounded-lg px-2.5 py-1">
                    <a
                      href="/src/assets/images/sm_sadi_profile_1790808035641.jpg"
                      download="sm_sadi_profile.jpg"
                      title="প্রোফাইল ছবি ডাউনলোড করতে ক্লিক করুন"
                      className="shrink-0"
                    >
                      <img
                        src="/src/assets/images/sm_sadi_profile_1790808035641.jpg"
                        alt="SM SADI Profile Avatar"
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full object-cover border border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]"
                      />
                    </a>
                    <span className="text-xs font-mono text-cyan-300 font-semibold">
                      @{user.username} ({user.telegramId})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMiniAppOpen(true);
                        setMiniAppMinimized(false);
                        handleSyncTelegramMiniApp();
                      }}
                      className="neon-btn-cyan px-3 py-1 rounded-md text-xs font-bold text-white whitespace-nowrap cursor-pointer"
                    >
                      🚀 Open SM AI TRADER
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                    {(['ALL', 'AUTO', 'MANUAL'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTradeFilter(mode)}
                        className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                          tradeFilter === mode
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400">
                      <th className="py-2.5 px-3 font-medium">Trade ID · Time</th>
                      <th className="py-2.5 px-3 font-medium">Mode · Wallet</th>
                      <th className="py-2.5 px-3 font-medium">Pair · Side · Duration</th>
                      <th className="py-2.5 px-3 font-medium text-right">Stake (USD)</th>
                      <th className="py-2.5 px-3 font-medium text-right">Gross Profit</th>
                      <th className="py-2.5 px-3 font-medium text-right">2% Admin Fee</th>
                      <th className="py-2.5 px-3 font-medium text-right">User Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
                    {filteredTrades.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                          No matching trades found. Click &ldquo;Execute 1 Trade (&ge;98% SADI)&rdquo; or enable Cloud Auto-Trading to log live executions.
                        </td>
                      </tr>
                    ) : (
                      filteredTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-100">{t.id}</div>
                            <div className="text-slate-400">
                              {new Date(t.executedAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            <span>{t.executionMode}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="text-cyan-300">{t.walletMode}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-100">{t.symbol}</span>
                            <span aria-hidden="true"> · </span>
                            <span
                              className={
                                t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                              }
                            >
                              {t.direction}
                            </span>
                            <span className="text-slate-400 ml-1">({t.durationMinutes || 1}m)</span>
                          </td>
                          <td className="py-3 px-3 text-right text-slate-200">
                            ${t.stakeUsd.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-300">
                            +${(t.grossPnlUsd ?? t.pnlUsd).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right text-amber-300">
                            -${(t.adminServiceFeeUsd ?? 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-400">
                            <div>+${t.pnlUsd.toFixed(2)} USD</div>
                            {t.demoBonusToRealUsd > 0 && (
                              <div className="text-[11px] text-cyan-300 font-normal">
                                +${t.demoBonusToRealUsd.toFixed(2)} → Main
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeNav === 'WALLET' && (
          <WalletGatewayView
            user={user}
            usdToBdtRate={usdToBdtRate}
            transactions={transactions}
            onSwitchWalletMode={handleSwitchWalletMode}
            onSubmitDeposit={handleSubmitDeposit}
            onSubmitWithdraw={handleSubmitWithdraw}
          />
        )}

        {activeNav === 'SECURITY' && (
          <SecurityVaultView
            user={user}
            ledgerIntegrityValid={state.ledgerIntegrityValid}
            ledgerIntegrityError={state.ledgerIntegrityError}
            onBindExchange={handleBindExchange}
            onAuditAction={handleSecurityAuditAction}
          />
        )}

        {activeNav === 'ADMIN_BOT' && (
          <TelegramAdminBotView
            user={user}
            adminVault={adminVault}
            sadiPaused={state.sadiEnginePaused}
            firebaseRtdbUrl={state.firebaseRtdbUrl}
            transactions={transactions}
            adminBotLogs={adminBotLogs}
            signals={signals}
            onTransactionDecision={handleTransactionDecision}
            onSendAdminCommand={handleSendAdminCommand}
          />
        )}

        {activeNav === 'DELIVERABLES' && <DeliverablesCodeView />}
      </main>

      {/* Deposit / Withdrawal Modal Popup (Triggered from Top Bar Primary CTAs) */}
      {walletModalTab && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="neon-card-active max-w-4xl w-full rounded-2xl p-6 my-8 relative">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  SM SADI Local Gateway Vault (bKash · Nagad · Rocket)
                </h3>
                <p className="text-xs text-slate-400">
                  Min Deposit $2.00 ({(2 * usdToBdtRate).toFixed(0)} BDT) · $2.00 Mandatory Hold · $3–$5 (50% Once), $5–$10 (50% Lifetime), $50+ (70% Lifetime) Demo Bonus
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWalletModalTab(null)}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <WalletGatewayView
              user={user}
              usdToBdtRate={usdToBdtRate}
              transactions={transactions}
              onSwitchWalletMode={handleSwitchWalletMode}
              onSubmitDeposit={handleSubmitDeposit}
              onSubmitWithdraw={handleSubmitWithdraw}
              initialTab={walletModalTab}
            />
          </div>
        </div>
      )}

      {/* OPENING IN ⛏️ MiniApp (Minimizable & Maximizable Telegram MiniApp Sheet) */}
      {miniAppOpen && (
        <div
          className={
            miniAppMinimized
              ? 'fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 neon-card-active rounded-2xl p-3 border-2 border-cyan-400 shadow-2xl'
              : 'fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-2 sm:p-6'
          }
        >
          <div
            className={
              miniAppMinimized
                ? 'flex items-center justify-between gap-2'
                : 'neon-card-active flex-1 rounded-2xl flex flex-col overflow-hidden border border-cyan-400/60'
            }
          >
            {/* MiniApp Top Bar with Minimize (—), Maximize (□), and Close (✕) */}
            <div className="bg-[#060d1f] border-b border-cyan-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-bold text-cyan-300">
                  START &gt; 🚀 Open SM AI TRADER &gt; OPENING IN ⛏️ MiniApp
                </span>
                {syncingBotMsg && (
                  <span className="text-[11px] text-emerald-400 font-mono hidden md:inline">
                    {syncingBotMsg}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveNav('DELIVERABLES');
                    setMiniAppOpen(false);
                  }}
                  className="px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/40 text-xs font-semibold cursor-pointer"
                >
                  Copy HopWeb 1-File index.html
                </button>
                <button
                  type="button"
                  onClick={() => setMiniAppMinimized(!miniAppMinimized)}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-mono cursor-pointer"
                >
                  {miniAppMinimized ? '□ Maximize' : '— Minimize'}
                </button>
                <button
                  type="button"
                  onClick={() => setMiniAppOpen(false)}
                  className="px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {!miniAppMinimized && (
              <iframe
                src="/hopweb"
                title="SM AI TRADER MiniApp (All-in-One HopWeb index.html)"
                className="w-full flex-1 border-0 bg-[#040711]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

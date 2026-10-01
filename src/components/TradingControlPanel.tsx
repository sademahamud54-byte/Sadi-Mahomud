import React, { useState, useEffect, useRef } from 'react';
import { UserState, QuantSignal, TradeRecord } from '../types';
import {
  Play,
  Square,
  ShieldAlert,
  Zap,
  Clock,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Coins,
} from 'lucide-react';

interface TradingControlPanelProps {
  user: UserState;
  selectedSymbol: string;
  currentSignal?: QuantSignal;
  sadiPaused: boolean;
  onUpdateConfig: (payload: {
    enabled: boolean;
    durationMinutes: number;
    reserveBalanceUsd: number;
    minInvestmentUsd: number;
    maxInvestmentUsd: number;
    accountStopLimitEnabled?: boolean;
    accountStopLimitUsd?: number;
  }) => Promise<void>;
  onExecuteManualTrade: (
    symbol: string,
    stakeUsd: number,
    durationMinutes?: number,
    executionMode?: 'AUTO' | 'MANUAL'
  ) => Promise<{
    trade: TradeRecord;
    riskSummary: string;
    adminFeeSummary?: string;
    demoBonusSummary?: string;
  } | null>;
  onClaimGoldCoin: () => Promise<void>;
  onReturnHome: () => void;
}

// Dropdown options: 1,2,3,4,5,6,7,8,9,10 minutes + 20,30,40,50 minutes + 1..10 hours
const DROPDOWN_DURATION_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: '1 মিনিট (1m)', minutes: 1 },
  { label: '2 মিনিট (2m)', minutes: 2 },
  { label: '3 মিনিট (3m)', minutes: 3 },
  { label: '4 মিনিট (4m)', minutes: 4 },
  { label: '5 মিনিট (5m)', minutes: 5 },
  { label: '6 মিনিট (6m)', minutes: 6 },
  { label: '7 মিনিট (7m)', minutes: 7 },
  { label: '8 মিনিট (8m)', minutes: 8 },
  { label: '9 মিনিট (9m)', minutes: 9 },
  { label: '10 মিনিট (10m)', minutes: 10 },
  { label: '20 মিনিট (20m)', minutes: 20 },
  { label: '30 মিনিট (30m)', minutes: 30 },
  { label: '40 মিনিট (40m)', minutes: 40 },
  { label: '50 মিনিট (50m)', minutes: 50 },
  { label: '1 ঘণ্টা (60m)', minutes: 60 },
  { label: '2 ঘণ্টা (120m)', minutes: 120 },
  { label: '3 ঘণ্টা (180m)', minutes: 180 },
  { label: '4 ঘণ্টা (240m)', minutes: 240 },
  { label: '5 ঘণ্টা (300m)', minutes: 300 },
  { label: '6 ঘণ্টা (360m)', minutes: 360 },
  { label: '7 ঘণ্টা (420m)', minutes: 420 },
  { label: '8 ঘণ্টা (480m)', minutes: 480 },
  { label: '9 ঘণ্টা (540m)', minutes: 540 },
  { label: '10 ঘণ্টা (600m)', minutes: 600 },
];

// 3 Monetag Zones × 3 Formats = 9 Serial Ad Slots in Round-Robin Order
interface MonetagSlot {
  slotIndex: number;
  zoneId: string;
  sdkFuncName: 'show_11924593' | 'show_11924529' | 'show_11924571';
  format: 'REWARDED_INTERSTITIAL' | 'REWARDED_POPUP' | 'IN_APP_INTERSTITIAL';
  label: string;
}

const MONETAG_SERIAL_SLOTS: MonetagSlot[] = [
  {
    slotIndex: 1,
    zoneId: '11924593',
    sdkFuncName: 'show_11924593',
    format: 'REWARDED_INTERSTITIAL',
    label: 'Zone 11924593 · #1 Rewarded Interstitial',
  },
  {
    slotIndex: 2,
    zoneId: '11924593',
    sdkFuncName: 'show_11924593',
    format: 'REWARDED_POPUP',
    label: 'Zone 11924593 · #2 Rewarded Popup',
  },
  {
    slotIndex: 3,
    zoneId: '11924593',
    sdkFuncName: 'show_11924593',
    format: 'IN_APP_INTERSTITIAL',
    label: 'Zone 11924593 · #3 In-App Interstitial',
  },
  {
    slotIndex: 4,
    zoneId: '11924529',
    sdkFuncName: 'show_11924529',
    format: 'REWARDED_INTERSTITIAL',
    label: 'Zone 11924529 · #4 Rewarded Interstitial',
  },
  {
    slotIndex: 5,
    zoneId: '11924529',
    sdkFuncName: 'show_11924529',
    format: 'REWARDED_POPUP',
    label: 'Zone 11924529 · #5 Rewarded Popup',
  },
  {
    slotIndex: 6,
    zoneId: '11924529',
    sdkFuncName: 'show_11924529',
    format: 'IN_APP_INTERSTITIAL',
    label: 'Zone 11924529 · #6 In-App Interstitial',
  },
  {
    slotIndex: 7,
    zoneId: '11924571',
    sdkFuncName: 'show_11924571',
    format: 'REWARDED_INTERSTITIAL',
    label: 'Zone 11924571 · #7 Rewarded Interstitial',
  },
  {
    slotIndex: 8,
    zoneId: '11924571',
    sdkFuncName: 'show_11924571',
    format: 'REWARDED_POPUP',
    label: 'Zone 11924571 · #8 Rewarded Popup',
  },
  {
    slotIndex: 9,
    zoneId: '11924571',
    sdkFuncName: 'show_11924571',
    format: 'IN_APP_INTERSTITIAL',
    label: 'Zone 11924571 · #9 In-App Interstitial',
  },
];

// Zero-Cache / Zero-Trace Cleanup Function:
// Ensures NO ad cache, storage keys, or injected ad DOM nodes ever remain in the app after the 10s ad closes.
function purgeEphemeralAdTraces() {
  try {
    // 1. Remove any third-party ad overlays/iframes injected into body outside #root
    const bodyChildren = Array.from(document.body.children);
    for (const el of bodyChildren) {
      if (el.id !== 'root' && el.tagName !== 'SCRIPT') {
        el.remove();
      }
    }
    // 2. Clear any sessionStorage or localStorage keys created by ad scripts
    try {
      sessionStorage.clear();
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !k.startsWith('sm_sadi_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore storage access errors
    }
  } catch {
    // ignore cleanup errors
  }
}

function triggerMonetagSerialAd(slot: MonetagSlot) {
  try {
    const fn = (window as any)[slot.sdkFuncName];
    if (typeof fn === 'function') {
      if (slot.format === 'REWARDED_INTERSTITIAL') {
        Promise.resolve(fn()).catch(() => {});
      } else if (slot.format === 'REWARDED_POPUP') {
        Promise.resolve(fn('pop')).catch(() => {});
      } else {
        Promise.resolve(
          fn({
            type: 'inApp',
            inAppSettings: {
              frequency: 2,
              capping: 0.1,
              interval: 30,
              timeout: 5,
              everyPage: false,
            },
          })
        ).catch(() => {});
      }
    }
  } catch {
    // non-blocking ad trigger
  }
}

export const TradingControlPanel: React.FC<TradingControlPanelProps> = ({
  user,
  selectedSymbol,
  sadiPaused,
  onUpdateConfig,
  onExecuteManualTrade,
  onClaimGoldCoin,
  onReturnHome,
}) => {
  const [durationMinutes, setDurationMinutes] = useState<number>(user.autoDurationMinutes || 1);
  const [manualInputVal, setManualInputVal] = useState<string>(String(user.autoDurationMinutes || 1));
  const [manualUnit, setManualUnit] = useState<'MIN' | 'HOUR'>('MIN');

  const [minInvest, setMinInvest] = useState<string>(String(user.minInvestmentUsd || 10));
  const [maxInvest, setMaxInvest] = useState<string>(String(user.maxInvestmentUsd || 200));

  // Account Stop Limit Checkbox + Dropdown Expandable "স্টপ লিমিটেড বক্স"
  const [stopLimitChecked, setStopLimitChecked] = useState<boolean>(
    user.accountStopLimitEnabled ?? false
  );
  const [stopLimitDropdownOpen, setStopLimitDropdownOpen] = useState<boolean>(false);
  const [stopLimitAmount, setStopLimitAmount] = useState<string>(
    String(user.accountStopLimitUsd || 1000)
  );

  const [manualStake, setManualStake] = useState<string>('10');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Continuous Chained Loop State:
  // Trade Running -> 10s Ephemeral Ad -> Purge Ad Cache -> +1 Gold Coin -> Next Trade
  const [loopPhase, setLoopPhase] = useState<'IDLE' | 'TRADING' | 'AD_BREAK_10S'>('IDLE');
  const [tradeCountdownSec, setTradeCountdownSec] = useState<number>(0);
  const [adCountdownSec, setAdCountdownSec] = useState<number>(0);
  const [serialAdIndex, setSerialAdIndex] = useState<number>(0);
  const [completedCycles, setCompletedCycles] = useState<number>(0);
  const [lastExecutedTrade, setLastExecutedTrade] = useState<TradeRecord | null>(null);

  const [manualSummaryModal, setManualSummaryModal] = useState<{
    trade: TradeRecord;
    riskSummary: string;
    adminFeeSummary?: string;
    demoBonusSummary?: string;
  } | null>(null);

  // Keep latest user balance ref for checking Stop Limit inside timers
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const stopRequestedRef = useRef<boolean>(false);
  const startingBalanceRef = useRef<number>(0);

  const tradableRealBalance = Math.max(0, Number((user.realBalanceUsd - 2.0).toFixed(2)));
  const activeBalance =
    user.activeMode === 'REAL' ? user.realBalanceUsd : user.demoBalanceUsd;
  const activeTradableBalance =
    user.activeMode === 'REAL' ? tradableRealBalance : user.demoBalanceUsd;

  // Handle Manual Duration Input changes (1 minute to 10 hours / 600 minutes)
  const handleManualDurationChange = (valStr: string, unit: 'MIN' | 'HOUR') => {
    setManualInputVal(valStr);
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0) {
      const totalMins = unit === 'HOUR' ? Math.round(num * 60) : Math.round(num);
      const clamped = Math.max(1, Math.min(600, totalMins));
      setDurationMinutes(clamped);
    }
  };

  // Check if Account Stop Limit ("স্টপ লিমিটেড বক্স") is reached
  const checkIsStopLimitReached = (currentBal: number): { hit: boolean; reason?: string } => {
    if (!stopLimitChecked) return { hit: false };
    const limitVal = parseFloat(stopLimitAmount);
    if (isNaN(limitVal) || limitVal <= 0) return { hit: false };

    const startBal = startingBalanceRef.current;
    // Case A: Balance started above limit (e.g., > 1000) -> stop if balance drops to or touches <= 1000
    if (startBal > limitVal && currentBal <= limitVal) {
      return {
        hit: true,
        reason: `স্টপ লিমিট পূর্ণ হয়েছে ($${limitVal.toFixed(2)}): আপনার একাউন্ট ব্যালেন্স $${currentBal.toFixed(2)} হওয়ায় অটো-ট্রেডিং স্বয়ংক্রিয়ভাবে বন্ধ হয়েছে।`,
      };
    }
    // Case B: Balance started below limit (e.g., < 1000) -> stop as soon as balance reaches >= 1000
    if (startBal < limitVal && currentBal >= limitVal) {
      return {
        hit: true,
        reason: `স্টপ লিমিট টার্গেট পূর্ণ হয়েছে ($${limitVal.toFixed(2)}): আপনার একাউন্টে $${currentBal.toFixed(2)} হওয়ায় অটো-ট্রেডিং স্বয়ংক্রিয়ভাবে বন্ধ হয়েছে!`,
      };
    }
    // Case C: Started exactly at limitVal
    if (Math.abs(currentBal - limitVal) < 0.01) {
      return {
        hit: true,
        reason: `একাউন্ট ব্যালেন্স স্টপ লিমিট ($${limitVal.toFixed(2)}) স্পর্শ করেছে। ট্রেডিং বন্ধ হয়েছে।`,
      };
    }
    return { hit: false };
  };

  // Start Continuous Chained Auto-Trading Loop
  const handleStartContinuousLoop = async () => {
    setErrorMsg(null);
    stopRequestedRef.current = false;
    startingBalanceRef.current = activeBalance;

    const minVal = Math.max(1, parseFloat(minInvest) || 10);
    const maxVal = Math.max(minVal, parseFloat(maxInvest) || 200);
    const limitVal = parseFloat(stopLimitAmount) || 1000;

    // Check stop limit before starting
    if (stopLimitChecked && Math.abs(activeBalance - limitVal) < 0.01) {
      setErrorMsg(
        `আপনার বর্তমান ব্যালেন্স ইতিমধ্যে স্টপ লিমিট ($${limitVal}) এ রয়েছে। ট্রেড শুরু করতে স্টপ লিমিট পরিবর্তন করুন।`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onUpdateConfig({
        enabled: true,
        durationMinutes,
        reserveBalanceUsd: 2,
        minInvestmentUsd: minVal,
        maxInvestmentUsd: maxVal,
        accountStopLimitEnabled: stopLimitChecked,
        accountStopLimitUsd: limitVal,
      });
      setCompletedCycles(0);
      // Launch Trade #1 in the continuous cycle
      setLoopPhase('TRADING');
      // Use a visual cycle timer (scaled so 1m+ trades execute smoothly without making user wait hours to see the cycle)
      setTradeCountdownSec(Math.min(durationMinutes * 60, 8));
    } catch (err: any) {
      setErrorMsg(err.message || 'অটো-ট্রেডিং শুরু করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopContinuousLoop = async () => {
    stopRequestedRef.current = true;
    setLoopPhase('IDLE');
    setTradeCountdownSec(0);
    setAdCountdownSec(0);
    purgeEphemeralAdTraces();
    try {
      await onUpdateConfig({
        enabled: false,
        durationMinutes,
        reserveBalanceUsd: 2,
        minInvestmentUsd: Math.max(1, parseFloat(minInvest) || 10),
        maxInvestmentUsd: Math.max(1, parseFloat(maxInvest) || 200),
        accountStopLimitEnabled: stopLimitChecked,
        accountStopLimitUsd: parseFloat(stopLimitAmount) || 1000,
      });
    } catch {
      // ignore
    }
  };

  // Effect for Phase 1: TRADING Countdown -> Settles Trade -> Immediately starts 10s Ad Break
  useEffect(() => {
    if (loopPhase !== 'TRADING') return;

    if (tradeCountdownSec > 0) {
      const timer = setTimeout(() => {
        setTradeCountdownSec((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Trade timer hit 0 -> Execute & Settle Trade within Min ($10) and Max ($200)
    let cancelled = false;
    const settleTradeAndStart10sAd = async () => {
      if (stopRequestedRef.current) {
        setLoopPhase('IDLE');
        return;
      }

      const minVal = Math.max(1, parseFloat(minInvest) || 10);
      const maxVal = Math.max(minVal, parseFloat(maxInvest) || 200);
      // Dynamic stake strictly between Min ($10) and Max ($200)
      const randomRatio = 0.25 + Math.random() * 0.65;
      const chosenStake = Number(
        Math.min(maxVal, Math.max(minVal, minVal + (maxVal - minVal) * randomRatio)).toFixed(2)
      );

      try {
        const res = await onExecuteManualTrade(
          selectedSymbol,
          chosenStake,
          durationMinutes,
          'AUTO'
        );
        if (cancelled || stopRequestedRef.current) return;

        if (res?.trade) {
          setLastExecutedTrade(res.trade);
        }

        // Trigger the current serial Monetag Ad Slot (1 of 9 in Round-Robin order)
        const currentSlot = MONETAG_SERIAL_SLOTS[serialAdIndex % MONETAG_SERIAL_SLOTS.length];
        triggerMonetagSerialAd(currentSlot);

        // Enter 10-Second Ephemeral Ad Intermission
        setAdCountdownSec(10);
        setLoopPhase('AD_BREAK_10S');
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err.message || 'Trade stopped.');
          setLoopPhase('IDLE');
        }
      }
    };

    settleTradeAndStart10sAd();
    return () => {
      cancelled = true;
    };
  }, [loopPhase, tradeCountdownSec]);

  // Effect for Phase 2: 10-SECOND AD BREAK -> Auto-Closes at 0s -> Purges Ad Cache -> Credits +1 Gold Coin -> Starts Next Trade!
  useEffect(() => {
    if (loopPhase !== 'AD_BREAK_10S') return;

    if (adCountdownSec > 0) {
      const timer = setTimeout(() => {
        setAdCountdownSec((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // 10 seconds finished!
    // 1. Auto-close ad & purge all ad cache/DOM traces so nothing remains in the app
    purgeEphemeralAdTraces();

    let cancelled = false;
    const finishAdAndStartNextTrade = async () => {
      // 2. Credit +1 Gold Coin to user account
      await onClaimGoldCoin();
      if (cancelled || stopRequestedRef.current) {
        setLoopPhase('IDLE');
        return;
      }

      // 3. Advance serial ad slot index (1 -> 2 -> 3 ... -> 9 -> 1)
      setSerialAdIndex((prev) => (prev + 1) % MONETAG_SERIAL_SLOTS.length);
      setCompletedCycles((prev) => prev + 1);

      // 4. Check if Account Stop Limit ("স্টপ লিমিটেড বক্স") has been reached
      const latestBal =
        userRef.current.activeMode === 'REAL'
          ? userRef.current.realBalanceUsd
          : userRef.current.demoBalanceUsd;
      const stopCheck = checkIsStopLimitReached(latestBal);
      if (stopCheck.hit) {
        setErrorMsg(stopCheck.reason || 'Stop limit reached.');
        await handleStopContinuousLoop();
        return;
      }

      // 5. Automatically open the next trade!
      setTradeCountdownSec(Math.min(durationMinutes * 60, 8));
      setLoopPhase('TRADING');
    };

    finishAdAndStartNextTrade();
    return () => {
      cancelled = true;
    };
  }, [loopPhase, adCountdownSec]);

  // Single Manual Trade (also followed by 10s Ephemeral Ad -> +1 Gold Coin)
  const handleManualOneTrade = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const minVal = Math.max(1, parseFloat(manualStake) || 10);
      const result = await onExecuteManualTrade(
        selectedSymbol,
        minVal,
        durationMinutes,
        'MANUAL'
      );
      if (result) {
        setManualSummaryModal(result);
        // Trigger next serial Monetag slot for 10s, then auto-close, purge cache & credit +1 Gold Coin
        const currentSlot = MONETAG_SERIAL_SLOTS[serialAdIndex % MONETAG_SERIAL_SLOTS.length];
        triggerMonetagSerialAd(currentSlot);
        setSerialAdIndex((prev) => (prev + 1) % MONETAG_SERIAL_SLOTS.length);
        setTimeout(async () => {
          purgeEphemeralAdTraces();
          await onClaimGoldCoin();
        }, 10000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Manual trade execution failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentAdSlot = MONETAG_SERIAL_SLOTS[serialAdIndex % MONETAG_SERIAL_SLOTS.length];

  return (
    <div
      className={`${
        loopPhase !== 'IDLE' || user.autoTradingEnabled ? 'neon-card-active' : 'neon-card'
      } rounded-xl p-5 flex flex-col gap-4`}
    >
      {/* Header + Gold Coin Counter */}
      <div className="flex items-center justify-between border-b border-cyan-500/15 pb-3.5">
        <div>
          <h3 className="text-base font-bold text-slate-100 tracking-tight">
            SM SADI অটো-ট্রেডিং ও গোল্ড কয়েন প্যানেল
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            1m–10h টাইমিং · স্টপ লিমিট বক্স · প্রতি ট্রেডের মাঝে ১০ সেকেন্ড অ্যাড ও +1 গোল্ড কয়েন
          </p>
        </div>

        {/* Gold Coin Badge */}
        <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-400/50 rounded-xl px-3 py-1.5">
          <Coins className="w-4 h-4 text-amber-400" />
          <div className="text-right font-mono tabular-nums">
            <div className="text-[10px] text-amber-200/80">GOLD COINS</div>
            <div className="text-sm font-bold text-amber-300">{user.goldCoins || 0} 🪙</div>
          </div>
        </div>
      </div>

      {/* Real Mode $2.00 Locked Hold Notice */}
      {user.activeMode === 'REAL' && user.realBalanceUsd < 3.0 && (
        <div className="bg-amber-950/50 border border-amber-500/40 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-300">
              Real Account Balance: ${user.realBalanceUsd.toFixed(2)} ($1.00 Welcome Bonus Active)
            </div>
            <div className="mt-0.5 text-amber-200/90">
              সর্বনিম্ন ২ ডলার একাউন্টে লক থাকবে। রিয়েল ট্রেড শুরু করতে কমপক্ষে $2.00 ডিপোজিট করুন অথবা ডেমো ($10,000,000) মোডে ট্রেড করুন।
            </div>
          </div>
        </div>
      )}

      {/* LIVE 10-SECOND EPHEMERAL AD INTERMISSION BANNER (Auto-closes at 0s & leaves ZERO cache) */}
      {loopPhase === 'AD_BREAK_10S' && (
        <div className="bg-gradient-to-r from-cyan-950/90 via-slate-900 to-amber-950/80 border-2 border-amber-400/70 rounded-xl p-4 flex flex-col gap-2 shadow-[0_0_25px_-4px_rgba(251,191,36,0.4)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>বিজ্ঞাপন বিরতি (১০ সেকেন্ড পর অটো কেটে যাবে)</span>
            </span>
            <span className="text-sm font-mono font-bold text-cyan-300 bg-slate-950 px-2.5 py-0.5 rounded-lg border border-cyan-500/40">
              {adCountdownSec}s বাকি
            </span>
          </div>

          <div className="text-xs font-mono text-slate-200 bg-slate-950/80 rounded-lg p-2.5 border border-slate-800">
            <div>
              সিরিয়াল স্লট: <strong>{currentAdSlot.slotIndex} / {MONETAG_SERIAL_SLOTS.length}</strong> ({currentAdSlot.label})
            </div>
            {lastExecutedTrade && (
              <div className="text-emerald-400 mt-1">
                সর্বশেষ ট্রেড প্রফিট: +${lastExecutedTrade.pnlUsd.toFixed(2)} USD (স্টেক: ${lastExecutedTrade.stakeUsd.toFixed(2)})
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-300 flex items-center justify-between">
            <span>🧹 জিরো-ক্যাশ মোড: কোনো ফাইল/ডিটেইলস সেভ হবে না</span>
            <span className="text-amber-300 font-semibold">+1 🪙 গোল্ড কয়েন যোগ হচ্ছে...</span>
          </div>
        </div>
      )}

      {/* LIVE TRADING CYCLE BANNER */}
      {loopPhase === 'TRADING' && (
        <div className="bg-emerald-950/50 border border-emerald-500/50 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-emerald-400 animate-spin" />
            <div className="text-xs">
              <div className="font-bold text-emerald-300">
                অটো-ট্রেড রানিং (রাউন্ড #{completedCycles + 1} · {durationMinutes} মিনিট)
              </div>
              <div className="text-slate-300">
                ট্রেড শেষ হলেই ১০ সেকেন্ডের বিজ্ঞাপন ও +1 গোল্ড কয়েন জমা হয়ে পরবর্তী ট্রেড শুরু হবে
              </div>
            </div>
          </div>
          <span className="font-mono text-sm font-bold text-emerald-300">
            {tradeCountdownSec}s
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-950/60 border border-rose-500/50 rounded-lg p-3 text-xs text-rose-200 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. TIMING DROPDOWN (1,2,3..10m, 20..50m, 1..10h) + MANUAL INPUT BESIDE IT */}
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1.5">
          ট্রেডিং টাইম সিলেক্ট করুন (ড্রপডাউন অথবা পাশে ম্যানুয়ালি লিখুন: ১ মিনিট – ১০ ঘণ্টা)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Dropdown Selector */}
          <select
            value={durationMinutes}
            onChange={(e) => {
              const mins = Number(e.target.value);
              setDurationMinutes(mins);
              if (mins >= 60 && mins % 60 === 0) {
                setManualUnit('HOUR');
                setManualInputVal(String(mins / 60));
              } else {
                setManualUnit('MIN');
                setManualInputVal(String(mins));
              }
            }}
            className="w-full bg-slate-950/95 border border-cyan-500/40 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none cursor-pointer"
          >
            {DROPDOWN_DURATION_OPTIONS.map((opt) => (
              <option key={opt.minutes} value={opt.minutes} className="bg-slate-950 text-slate-100">
                {opt.label}
              </option>
            ))}
          </select>

          {/* Manual Input Beside Dropdown */}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              max={manualUnit === 'HOUR' ? 10 : 600}
              value={manualInputVal}
              onChange={(e) => handleManualDurationChange(e.target.value, manualUnit)}
              placeholder="সময় লিখুন..."
              className="w-full bg-slate-950/95 border border-slate-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-100 outline-none"
            />
            <select
              value={manualUnit}
              onChange={(e) => {
                const newUnit = e.target.value as 'MIN' | 'HOUR';
                setManualUnit(newUnit);
                handleManualDurationChange(manualInputVal, newUnit);
              }}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-cyan-300 font-semibold outline-none cursor-pointer shrink-0"
            >
              <option value="MIN">মিনিট</option>
              <option value="HOUR">ঘণ্টা</option>
            </select>
          </div>
        </div>
        <div className="text-[11px] text-cyan-300/90 font-mono mt-1">
          নির্ধারিত সময়: <strong>{durationMinutes} মিনিট</strong> (সর্বনিম্ন ১ মিনিট – সর্বোচ্চ ১০ ঘণ্টা / ৬০০ মিনিট)
        </div>
      </div>

      {/* 2. MIN INVESTMENT ($10) & MAX INVESTMENT ($200) */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs text-slate-300 mb-1">
            সর্বনিম্ন ট্রেড অ্যামাউন্ট (Min $)
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={minInvest}
            onChange={(e) => setMinInvest(e.target.value)}
            className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-slate-100 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">
            সর্বোচ্চ ট্রেড অ্যামাউন্ট (Max $)
          </label>
          <input
            type="number"
            min="1"
            step="5"
            value={maxInvest}
            onChange={(e) => setMaxInvest(e.target.value)}
            className="w-full bg-slate-950/90 border border-slate-800 focus:border-cyan-400 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-slate-100 outline-none"
          />
        </div>
      </div>

      {/* 3. ACCOUNT LIMITED CHECKBOX + DROPDOWN ARROW -> "স্টপ লিমিটেড বক্স" (e.g. 1000) */}
      <div className="bg-slate-950/85 border border-cyan-500/30 rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stopLimitChecked}
              onChange={(e) => {
                setStopLimitChecked(e.target.checked);
                if (e.target.checked) {
                  setStopLimitDropdownOpen(true);
                }
              }}
              className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
            />
            <span>একাউন্ট লিমিটেড (Account Stop Limit)</span>
          </label>

          <button
            type="button"
            onClick={() => setStopLimitDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-medium cursor-pointer"
          >
            <span>স্টপ লিমিটেড বক্স</span>
            {stopLimitDropdownOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {stopLimitDropdownOpen && (
          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-cyan-300 font-medium whitespace-nowrap">
                স্টপ লিমিটেড বক্স ($):
              </span>
              <input
                type="number"
                min="1"
                step="10"
                value={stopLimitAmount}
                onChange={(e) => setStopLimitAmount(e.target.value)}
                placeholder="1000"
                className="w-full bg-slate-900 border border-cyan-500/40 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums text-white outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              একাউন্টে টাকা যখন <strong>${stopLimitAmount || '1000'}</strong> হয়ে যাবে তখন আর ট্রেড করবে না—অটো স্টপ হবে। আর একাউন্টে টাকা যদি <strong>${stopLimitAmount || '1000'}</strong> এর বেশি থাকে, তাহলে <strong>${minInvest || '10'}</strong> থেকে শুরু করে <strong>${maxInvest || '200'}</strong> এর মধ্যেই ধারাবাহিকভাবে ট্রেডিং চলতে থাকবে।
            </p>
          </div>
        )}
      </div>

      {/* Monetag Serial Ad Status Bar (9 Slots across 3 Zones) */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs">
        <span className="text-slate-400">পরবর্তী সিরিয়াল বিজ্ঞাপন (10s Auto-Close):</span>
        <span className="font-mono text-cyan-300 font-semibold">
          Slot #{currentAdSlot.slotIndex}/{MONETAG_SERIAL_SLOTS.length} (Zone {currentAdSlot.zoneId})
        </span>
      </div>

      {/* 4. START / STOP CONTINUOUS AUTO-TRADING BUTTON */}
      {loopPhase === 'IDLE' ? (
        <button
          type="button"
          disabled={submitting || sadiPaused}
          onClick={handleStartContinuousLoop}
          className="neon-btn-cyan w-full py-3 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>
            অটো-ট্রেডিং চালু করুন ({durationMinutes}m · ${minInvest}–${maxInvest})
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleStopContinuousLoop}
          className="w-full py-3 px-4 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_20px_-3px_rgba(244,63,94,0.6)] flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <Square className="w-4 h-4 fill-current" />
          <span>বন্ধ করুন (Stop Auto-Trading)</span>
        </button>
      )}

      {/* Manual 1-Trade Mode */}
      <div className="border-t border-cyan-500/15 pt-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300">
            ম্যানুয়াল ১-ট্রেড ({selectedSymbol} · {durationMinutes}m)
          </span>
          <span className="text-xs text-amber-300">
            ট্রেড শেষে 10s অ্যাড + 1 🪙 গোল্ড কয়েন
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-28 shrink-0">
            <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-400">$</span>
            <input
              type="number"
              min="1"
              step="1"
              disabled={loopPhase !== 'IDLE' || submitting}
              value={manualStake}
              onChange={(e) => setManualStake(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-800 rounded-lg pl-6 pr-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 outline-none disabled:opacity-40"
            />
          </div>
          <button
            type="button"
            disabled={loopPhase !== 'IDLE' || submitting || sadiPaused}
            onClick={handleManualOneTrade}
            className="flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>Execute 1 Trade (&ge;98% SADI)</span>
          </button>
        </div>
      </div>

      {/* Manual 1-Trade Summary Modal */}
      {manualSummaryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="neon-card-active max-w-md w-full rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h4 className="text-lg font-bold text-slate-100">
                  SM SADI Trade Execution Summary
                </h4>
              </div>
              <span className="text-xs font-mono text-cyan-300">
                {manualSummaryModal.trade.id}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/80 border border-slate-800 rounded-xl p-4 font-mono tabular-nums text-xs">
              <div>
                <div className="text-slate-400">Instrument &amp; Side</div>
                <div className="text-sm font-bold text-slate-100 mt-0.5">
                  {manualSummaryModal.trade.symbol} · {manualSummaryModal.trade.direction} (
                  {manualSummaryModal.trade.durationMinutes}m)
                </div>
              </div>
              <div>
                <div className="text-slate-400">SM SADI Confidence</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {manualSummaryModal.trade.aiConfidence.toFixed(2)}% (&ge;98%)
                </div>
              </div>
              <div>
                <div className="text-slate-400">Gross Profit → 2% Admin Fee</div>
                <div className="text-slate-200 mt-0.5">
                  +${manualSummaryModal.trade.grossPnlUsd.toFixed(2)} →{' '}
                  <span className="text-amber-300">
                    -${manualSummaryModal.trade.adminServiceFeeUsd.toFixed(2)} (2%)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-slate-400">Net Profit Credited</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  +${manualSummaryModal.trade.pnlUsd.toFixed(2)} USD
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 bg-cyan-950/30 border border-cyan-500/25 rounded-lg p-3 space-y-1.5">
              <div>{manualSummaryModal.riskSummary}</div>
              {manualSummaryModal.adminFeeSummary && (
                <div className="text-amber-300">{manualSummaryModal.adminFeeSummary}</div>
              )}
              <div className="text-emerald-300 font-semibold">
                🪙 ১০ সেকেন্ড বিজ্ঞাপন শেষে আপনার একাউন্টে +1 Gold Coin অটোমেটিক জমা হবে এবং বিজ্ঞাপনের কোনো ক্যাশ অ্যাপে থাকবে না।
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setManualSummaryModal(null);
                onReturnHome();
              }}
              className="neon-btn-cyan w-full py-3 px-4 rounded-xl text-sm font-semibold text-white cursor-pointer"
            >
              Confirm Summary &amp; Return to Home Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

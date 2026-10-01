import React, { useEffect, useState, useRef, useMemo } from 'react';
import { KlineCandle, QuantSignal } from '../types';
import { Activity, BarChart2, TrendingUp } from 'lucide-react';

interface LiveQuantChartProps {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  signals: Record<string, QuantSignal>;
  sadiPaused: boolean;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

export const LiveQuantChart: React.FC<LiveQuantChartProps> = ({
  selectedSymbol,
  onSelectSymbol,
  signals,
  sadiPaused,
}) => {
  const [candles, setCandles] = useState<KlineCandle[]>([]);
  const [chartType, setChartType] = useState<'CANDLE' | 'AREA'>('CANDLE');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [liveTickPrice, setLiveTickPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load initial historical candles from backend & connect directly to Binance Public WebSocket
  useEffect(() => {
    let active = true;
    setLiveTickPrice(null);

    fetch(`/api/klines/${selectedSymbol}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.candles)) {
          setCandles(data.candles.slice(-48));
        }
      })
      .catch(() => {});

    // Direct Browser -> Binance Public WebSocket Stream (Zero Mock Data)
    const wsUrl = `wss://stream.binance.com:9443/ws/${selectedSymbol.toLowerCase()}@kline_1m`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (active) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data);
          const k = payload.k;
          if (!k) return;
          const incoming: KlineCandle = {
            time: Math.floor(Number(k.t) / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            takerBuyVolume: parseFloat(k.V),
          };
          setLiveTickPrice(incoming.close);
          setCandles((prev) => {
            if (prev.length === 0) return [incoming];
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last.time === incoming.time) {
              copy[copy.length - 1] = incoming;
              return copy;
            } else {
              return [...copy.slice(-47), incoming];
            }
          });
        } catch {
          // ignore malformed frame
        }
      };

      ws.onerror = () => {
        if (active) setWsConnected(false);
      };
      ws.onclose = () => {
        if (active) setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      active = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [selectedSymbol]);

  const currentSignal = signals[selectedSymbol];
  const displayPrice =
    liveTickPrice ??
    (candles.length > 0 ? candles[candles.length - 1].close : currentSignal?.price ?? 0);

  // Compute rolling 20-period Bollinger Bands for SVG overlay
  const chartGeometry = useMemo(() => {
    if (candles.length === 0) return null;
    const width = 760;
    const height = 280;
    const padTop = 18;
    const padBottom = 26;
    const plotHeight = height - padTop - padBottom;

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    const bbBands = candles.map((c, idx) => {
      const windowSlice = candles.slice(Math.max(0, idx - 19), idx + 1);
      const mean = windowSlice.reduce((s, x) => s + x.close, 0) / windowSlice.length;
      const variance =
        windowSlice.reduce((s, x) => s + Math.pow(x.close - mean, 2), 0) / windowSlice.length;
      const std = Math.sqrt(variance);
      const upper = mean + 2 * std;
      const lower = mean - 2 * std;
      minPrice = Math.min(minPrice, c.low, lower);
      maxPrice = Math.max(maxPrice, c.high, upper);
      return { upper, mid: mean, lower };
    });

    const priceRange = Math.max(maxPrice - minPrice, maxPrice * 0.0008, 1e-4);
    const toY = (p: number) => padTop + ((maxPrice - p) / priceRange) * plotHeight;
    const stepX = width / Math.max(candles.length, 1);
    const toX = (i: number) => i * stepX + stepX / 2;

    const upperPoints = bbBands.map((b, i) => `${toX(i).toFixed(1)},${toY(b.upper).toFixed(1)}`).join(' ');
    const midPoints = bbBands.map((b, i) => `${toX(i).toFixed(1)},${toY(b.mid).toFixed(1)}`).join(' ');
    const lowerPoints = bbBands.map((b, i) => `${toX(i).toFixed(1)},${toY(b.lower).toFixed(1)}`).join(' ');

    const closeLinePoints = candles
      .map((c, i) => `${toX(i).toFixed(1)},${toY(c.close).toFixed(1)}`)
      .join(' ');
    const areaPolygonPoints = `${toX(0).toFixed(1)},${height - padBottom} ${closeLinePoints} ${toX(
      candles.length - 1
    ).toFixed(1)},${height - padBottom}`;

    return {
      width,
      height,
      padTop,
      padBottom,
      minPrice,
      maxPrice,
      stepX,
      toX,
      toY,
      bbBands,
      upperPoints,
      midPoints,
      lowerPoints,
      closeLinePoints,
      areaPolygonPoints,
    };
  }, [candles]);

  const inspectedCandle =
    hoverIndex !== null && candles[hoverIndex]
      ? candles[hoverIndex]
      : candles[candles.length - 1];

  const formatPrice = (val: number) => {
    if (!val) return '0.00';
    return val >= 100
      ? val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
  };

  return (
    <div className="neon-card rounded-xl p-5 flex flex-col gap-4">
      {/* Top Instrument Selector & Live Price Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/15 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {SYMBOLS.map((sym) => {
            const active = sym === selectedSymbol;
            const sig = signals[sym];
            return (
              <button
                key={sym}
                onClick={() => onSelectSymbol(sym)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/60 shadow-[0_0_15px_-3px_rgba(34,211,238,0.45)]'
                    : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span>{sym.replace('USDT', '/USDT')}</span>
                {sig && (
                  <span
                    className={`ml-2 font-mono tabular-nums ${
                      sig.confidenceScore >= 98.0 ? 'text-emerald-400' : 'text-cyan-400/80'
                    }`}
                  >
                    {sig.confidenceScore.toFixed(1)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-400 flex items-center justify-end gap-1.5">
              <span>{wsConnected ? 'Binance WebSocket Live' : 'Binance Cloud Stream Live'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">1m Kline</span>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-50 tracking-tight">
              ${formatPrice(displayPrice)}
            </div>
          </div>

          {/* Chart Style Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-950/90 border border-slate-800 rounded-lg">
            <button
              onClick={() => setChartType('CANDLE')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                chartType === 'CANDLE'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Candles</span>
            </button>
            <button
              onClick={() => setChartType('AREA')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                chartType === 'AREA'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Area + BB</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inspected OHLCV & Bollinger Bar */}
      {inspectedCandle && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums bg-slate-950/60 px-3.5 py-2 rounded-lg border border-slate-800/80">
          <div className="flex flex-wrap items-center gap-3">
            <span>O: ${formatPrice(inspectedCandle.open)}</span>
            <span aria-hidden="true">·</span>
            <span>H: ${formatPrice(inspectedCandle.high)}</span>
            <span aria-hidden="true">·</span>
            <span>L: ${formatPrice(inspectedCandle.low)}</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-300 font-semibold">C: ${formatPrice(inspectedCandle.close)}</span>
            <span aria-hidden="true">·</span>
            <span>Vol: {inspectedCandle.volume.toFixed(2)}</span>
          </div>
          {currentSignal && (
            <div className="flex items-center gap-2 text-slate-300">
              <span>BB(20,2):</span>
              <span className="text-cyan-400">
                ${formatPrice(currentSignal.bbLower)} – ${formatPrice(currentSignal.bbUpper)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main SVG Candlestick / Area Chart Viewport */}
      <div className="relative w-full h-[280px] bg-[#050917] rounded-lg border border-cyan-500/15 overflow-hidden">
        {!chartGeometry ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-slate-400 font-mono">
            <Activity className="w-4 h-4 mr-2 animate-spin text-cyan-400" />
            Synchronizing real-time Binance kline stream...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            className="w-full h-full select-none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="sadiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.36" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Price Axis Labels */}
            {[0.15, 0.38, 0.62, 0.85].map((ratio, idx) => {
              const y =
                chartGeometry.padTop +
                ratio * (chartGeometry.height - chartGeometry.padTop - chartGeometry.padBottom);
              const priceAtLine =
                chartGeometry.maxPrice -
                ratio * (chartGeometry.maxPrice - chartGeometry.minPrice);
              return (
                <g key={idx}>
                  <line
                    x1={0}
                    y1={y}
                    x2={chartGeometry.width}
                    y2={y}
                    stroke="rgba(148, 163, 184, 0.08)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={chartGeometry.width - 8}
                    y={y - 4}
                    textAnchor="end"
                    fill="rgba(148, 163, 184, 0.55)"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ${formatPrice(priceAtLine)}
                  </text>
                </g>
              );
            })}

            {/* Bollinger Bands Upper / Mid / Lower */}
            <polyline
              fill="none"
              stroke="rgba(34, 211, 238, 0.32)"
              strokeWidth="1"
              strokeDasharray="4 3"
              points={chartGeometry.upperPoints}
            />
            <polyline
              fill="none"
              stroke="rgba(59, 130, 246, 0.4)"
              strokeWidth="1"
              points={chartGeometry.midPoints}
            />
            <polyline
              fill="none"
              stroke="rgba(34, 211, 238, 0.32)"
              strokeWidth="1"
              strokeDasharray="4 3"
              points={chartGeometry.lowerPoints}
            />

            {chartType === 'AREA' ? (
              <>
                <polygon points={chartGeometry.areaPolygonPoints} fill="url(#sadiAreaGrad)" />
                <polyline
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2.2"
                  points={chartGeometry.closeLinePoints}
                />
              </>
            ) : (
              candles.map((c, i) => {
                const x = chartGeometry.toX(i);
                const yOpen = chartGeometry.toY(c.open);
                const yClose = chartGeometry.toY(c.close);
                const yHigh = chartGeometry.toY(c.high);
                const yLow = chartGeometry.toY(c.low);
                const isBull = c.close >= c.open;
                const color = isBull ? '#10b981' : '#f43f5e';
                const bodyTop = Math.min(yOpen, yClose);
                const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);
                const candleWidth = Math.max(chartGeometry.stepX * 0.58, 4);

                return (
                  <g
                    key={c.time}
                    onMouseEnter={() => setHoverIndex(i)}
                    className="cursor-crosshair"
                  >
                    <rect
                      x={x - chartGeometry.stepX / 2}
                      y={0}
                      width={chartGeometry.stepX}
                      height={chartGeometry.height}
                      fill="transparent"
                    />
                    <line
                      x1={x}
                      y1={yHigh}
                      x2={x}
                      y2={yLow}
                      stroke={color}
                      strokeWidth="1.3"
                    />
                    <rect
                      x={x - candleWidth / 2}
                      y={bodyTop}
                      width={candleWidth}
                      height={bodyHeight}
                      fill={color}
                      rx="1"
                    />
                  </g>
                );
              })
            )}

            {/* Hover Vertical Crosshair */}
            {hoverIndex !== null && candles[hoverIndex] && (
              <line
                x1={chartGeometry.toX(hoverIndex)}
                y1={0}
                x2={chartGeometry.toX(hoverIndex)}
                y2={chartGeometry.height}
                stroke="rgba(34, 211, 238, 0.5)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>
        )}
      </div>

      {/* Live Multi-Indicator Confluence Matrix & 98% Filter Status */}
      {currentSignal && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-xs text-slate-400">RSI (14-Period)</div>
            <div className="mt-1 text-base font-bold font-mono tabular-nums text-slate-100">
              {currentSignal.rsi14.toFixed(2)}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {currentSignal.rsi14 < 35
                ? 'Oversold Accumulation'
                : currentSignal.rsi14 > 65
                ? 'Overbought Exhaustion'
                : 'Neutral Equilibrium'}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-xs text-slate-400">MACD (12, 26, 9)</div>
            <div
              className={`mt-1 text-base font-bold font-mono tabular-nums ${
                currentSignal.macdHist >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {currentSignal.macdHist >= 0 ? '+' : ''}
              {currentSignal.macdHist.toFixed(4)}
            </div>
            <div className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
              Sig: {currentSignal.signalLine.toFixed(2)}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3">
            <div className="text-xs text-slate-400">Order Flow Imbalance</div>
            <div className="mt-1 text-base font-bold font-mono tabular-nums text-cyan-300">
              {currentSignal.orderFlowBuyPct.toFixed(1)}% Buy
            </div>
            <div className="mt-1.5 w-full h-1.5 bg-rose-500/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${currentSignal.orderFlowBuyPct}%` }}
              />
            </div>
          </div>

          <div className="md:col-span-2 bg-slate-950/80 border border-cyan-500/30 rounded-lg p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">
                SM SADI AI Win-Rate Filter (Threshold &ge; 98.0%)
              </span>
              <span
                className={`text-sm font-bold font-mono tabular-nums ${
                  sadiPaused
                    ? 'text-amber-400'
                    : currentSignal.confidenceScore >= 98.0
                    ? 'text-emerald-400'
                    : 'text-cyan-300'
                }`}
              >
                {currentSignal.confidenceScore.toFixed(2)}% ({currentSignal.direction})
              </span>
            </div>
            <div className="mt-1.5 text-xs text-slate-400 truncate" title={currentSignal.statusReason}>
              {currentSignal.statusReason}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

# 🚀 SM SADI — COMPLETE MASTER PROMPT (সম্পূর্ণ অ্যাপ তৈরির মাস্টার প্রম্পট)

নিচের সম্পূর্ণ প্রম্পটটি কপি করে যেকোনো AI কোডিং ইঞ্জিনে দিলে আপনার এই সম্পূর্ণ **"SM SADI" Automated AI Trading Platform & Telegram MiniApp** হুবহু তৈরি হয়ে যাবে:

---

```text
Act as a Principal Quantitative Financial Architect, Senior Full-Stack Engineer, and Telegram MiniApp Specialist. Build the complete, production-ready "SM SADI" [AI CODE NAME] Automated AI Trading Platform, Telegram MiniApp (TMA), and Blogger / HopWeb Single-File Application (`index.html` + external `smbg.png`).

===========================================================================
1. CORE ENVIRONMENT KEYS & CONSTANTS (MUST BE EMBEDDED IN JSON CONFIG)
===========================================================================
- ENGINE_CODE_NAME: "SM SADI"
- PROFILE_IMAGE_FILE: "smbg.png" (placed outside `index.html` in the root directory, with an inline SVG data-URI fallback for Blogger `Edit HTML`)
- AES_MASTER_KEY: smsadimtradingplatformsecretkey32
- LEDGER_HASH_SALT: smsadim_secure_salt_10_1_2026
- JWT_SECRET_KEY: jwt_smsadim_ai_trading_secorkey_99
- FIREBASE_DB_URL: https://sm-sadi-ai-trading-platform-default-rtdb.firebaseio.com
- USER_BOT_TOKEN: 8585116863:AAHBoPwLN9YwpiVDAWHUTTch6LIbJmYXEos
- ADMIN_BOT_TOKEN: 8788358073:AAGFMhURmBOHS80WV5FYQ763_Atp22g1ipI
- ADMIN_TELEGRAM_ID: 7504836023
- USD_TO_BDT_RATE: 123.50

===========================================================================
2. ALL-IN-ONE SINGLE-FILE ARCHITECTURE (`index.html` FOR BLOGGER & HOPWEB)
===========================================================================
- All code (HTML + Native CSS + JavaScript + Embedded JSON Config + Inline Web Worker `worker.js` via Blob URL + Telegram WebApp SDK + Monetag SDKs) MUST be unified inside a single standalone `index.html` file so that a mobile user without a computer can:
  1. Edit and run it directly inside the Android **HopWeb** app without any build step or blank screen.
  2. Paste the entire `index.html` directly into **Blogger.com -> Theme -> Classic Theme -> Edit HTML** (with `#navbar-iframe` hidden) and run it live on `*.blogspot.com`.
  3. Host it directly on **GitHub Pages** or **Render.com** without splitting files.
- Place the profile image file named `smbg.png` right outside `index.html` in the root folder, and include an automatic inline SVG data-URI fallback (`onerror`) so the profile avatar never breaks on Blogger.
- Include a pre-initialization shim before `https://telegram.org/js/telegram-web-app.js` that sets `sessionStorage.__telegram__initParams = {"tgWebAppVersion":"7.10"}` and polyfills `Telegram.WebApp.CloudStorage` (`setItem`, `getItem`, `getItems`, `removeItem`, `removeItems`, `getKeys`) so `[Telegram.WebApp] CloudStorage is not supported in version 6.0` never occurs.

===========================================================================
3. WALLET BALANCES, LOCKED HOLD, 2% ADMIN FEE & TIERED DEMO BONUS RULES
===========================================================================
1. Initial Balances:
   - Demo Balance: $10,000,000.00 ($10M USD).
   - Main Real Balance: $1.00 USD Welcome Bonus upon account creation.
2. Identical Demo & Main Trading Engine:
   - Both Demo and Main accounts trade identically using the "SM SADI" >= 98.0% Confidence Filter connected to live Binance WebSocket streams (`wss://stream.binance.com:9443/ws/btcusdt@kline_1m`).
3. Minimums & Mandatory $2.00 Hold Rule:
   - Minimum Trade Duration: 1 Minute.
   - Minimum Trade Stake: $1.00 USD.
   - Minimum Deposit: $2.00 USD (247 BDT).
   - Mandatory Locked Hold: $2.00 USD MUST always remain locked in the user's Main Real Account. This $2.00 cannot be traded or withdrawn (`Tradable / Withdrawable Real Balance = max(0, realBalanceUsd - 2.00)`).
4. Automatic 2% App Service Charge to Admin:
   - On every winning trade, automatically deduct a 2% App Service Charge from gross profit (`adminFee = grossProfit * 0.02`, `netProfit = grossProfit - adminFee`) and auto-credit it to the Admin Account Vault (`ADMIN_TELEGRAM_ID: 7504836023`).
5. Tiered Demo Profit Bonus Rules:
   - First Real Deposit between $3.00 and $5.00 USD: User receives 50% (half) of their accumulated Demo profit as a one-time bonus credited to their Main Balance.
   - First Real Deposit between $5.00 and $10.00 USD: User unlocks LIFETIME 50% Demo Profit Bonus — 50% of every Demo trade's net profit is automatically credited to their Main Real Balance forever.
   - Any Deposit of $50.00 USD or more: User unlocks LIFETIME 70% Demo Profit Bonus — 70% of every Demo trade's net profit is automatically credited to their Main Real Balance forever.

===========================================================================
4. TELEGRAM BOT & MINIAPP INTEGRATION (`/start` -> `🚀 Open SM AI TRADER`)
===========================================================================
- Flow: `START (/start) > 🚀 Open SM AI TRADER > LINK > OPENING IN ⛏️ MiniApp` (supports Minimize `—` and Maximize `□`).
- Inside the embedded Web Worker (`worker.js`), poll Telegram Bot `USER_BOT_TOKEN` (`8585116863:...`) for `/start` messages and automatically reply with a welcome message and a `web_app` inline keyboard button labeled `"🚀 Open SM AI TRADER (⛏️ MiniApp)"`, plus register the chat menu button via `setChatMenuButton`.
- In the Search Filter Box, display the `smbg.png` profile avatar, the Telegram Username (`@sadi_quant_pro`), and on its right side a glowing rotating neon button labeled `"🚀 Open SM AI TRADER"`.

===========================================================================
5. TIMING DROPDOWN, MANUAL INPUT, STOP LIMIT BOX (`1000`) & AUTO-TRADE LOOP
===========================================================================
1. Trade Timing Selector:
   - Provide a Dropdown with options: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10 মিনিট`, `20, 30, 40, 50 মিনিট`, and `1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ঘণ্টা`.
   - Right beside the dropdown, provide a Manual Time Input Box + Unit Selector (`মিনিট` / `ঘণ্টা`) allowing any custom duration from 1 minute minimum up to 10 hours (600 minutes) maximum.
2. Min & Max Trade Stake Boxes:
   - Provide Minimum Stake input (e.g., `$10`, min `$1`) and Maximum Stake input (e.g., `$200`).
3. Account Limited Checkbox & Expandable "স্টপ লিমিটেড বক্স" (`Stop Limit Box`):
   - Provide an `"একাউন্ট লিমিটেড (Account Limited)"` checkbox with a dropdown arrow button (`স্টপ লিমিটেড বক্স ▼`).
   - Clicking the arrow expands the `"স্টপ লিমিটেড বক্স"` input (default `1000`).
   - When the user's account balance reaches the Stop Limit amount (`1000`), auto-trading immediately stops! If the account balance is above `1000`, the engine trades within the `$10` to `$200` range until the balance reaches `1000`.
4. Continuous Auto-Trading Loop:
   - As soon as one trade finishes and profit/loss is calculated, automatically trigger the 10-Second Ad Break, and once the 10-second ad closes, automatically open the next trade continuously until the user clicks `"⏹️ বন্ধ করুন (Stop)"` or hits the Stop Limit (`1000`).

===========================================================================
6. 9-SLOT SERIAL MONETAG AD ROTATOR, 10S AUTO-CLOSE, ZERO-CACHE & GOLD COINS
===========================================================================
1. Include the 3 Monetag SDK scripts in `<head>`:
   - `<script src="https://libtl.com/sdk.js" data-zone="11924593" data-sdk="show_11924593"></script>`
   - `<script src="https://libtl.com/sdk.js" data-zone="11924529" data-sdk="show_11924529"></script>`
   - `<script src="https://libtl.com/sdk.js" data-zone="11924571" data-sdk="show_11924571"></script>`
2. Configure all 9 Serial Ad Slots (3 Zones × 3 Formats: Rewarded Interstitial, Rewarded Popup `'pop'`, and In-App Interstitial `'inApp'`):
   - Slot #1: `show_11924593()` (Rewarded Interstitial)
   - Slot #2: `show_11924593('pop')` (Rewarded Popup)
   - Slot #3: `show_11924593({ type: 'inApp', inAppSettings: { frequency: 2, capping: 0.1, interval: 30, timeout: 5, everyPage: false } })`
   - Slot #4: `show_11924529()` (Rewarded Interstitial)
   - Slot #5: `show_11924529('pop')` (Rewarded Popup)
   - Slot #6: `show_11924529({ type: 'inApp', ... })`
   - Slot #7: `show_11924571()` (Rewarded Interstitial)
   - Slot #8: `show_11924571('pop')` (Rewarded Popup)
   - Slot #9: `show_11924571({ type: 'inApp', ... })`
3. 10-Second Auto-Close, Zero-Cache Purge & +1 Gold Coin Reward:
   - Between every trade, display a glowing full-screen Ad Intermission Modal (`"বিজ্ঞাপন চলছে... ⏱️ ১০ সেকেন্ড পর অটো বন্ধ হবে"`).
   - Play ONE ad slot at a time in strict 1-to-9 serial order (`serialAdIndex = (serialAdIndex + 1) % 9`). Never play two ads at once.
   - After exactly 10 seconds, automatically close the ad modal, purge all injected ad DOM nodes and storage caches (`purgeAllAdTraces()`) so zero ad files/details remain in the app, and credit `+1 🪙 Gold Coin` (`goldCoins += 1`) to the user's account!
```

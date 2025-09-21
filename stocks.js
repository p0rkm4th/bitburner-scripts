/** @param {NS} ns **/
export async function main(ns) {
  // =======================================================
  // SUPER-COMPOUNDING ULTRA-AGGRESSIVE STOCK TRADER
  // =======================================================
  // This script dynamically buys and sells stocks based on forecast and volatility.
  // Aggressiveness level controls how much capital is used per trade, when to enter/exit positions,
  // and how much risk the script takes. It reinvests profits automatically, maximizing compounding.
  // -------------------------------------------------------
  // Aggressiveness levels (1-10):
  // 1: Conservative - only invests small fractions, high profit thresholds, wide hysteresis.
  // 5: Balanced - moderate allocation, standard thresholds.
  // 10: Wolf of Wall Street - invests nearly all available cash, small hysteresis, immediate max shares.
  // >10: Ultra-aggressive (optional) - ignores cash floor entirely, buys max shares for all profitable forecasts.
  // =======================================================

  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");

  // -------------------------
  // CONFIGURATION
  // -------------------------
  const COMMISSION = 100_000;             // Stock transaction fee
  const LOOP_SLEEP = 200;                 // Delay between each trading loop (ms)
  const MIN_FORECAST_LONG = 0.6;          // Forecast threshold to consider buying long
  const MAX_FORECAST_SHORT = 0.4;         // Forecast threshold to consider buying short
  const AGGRESSIVENESS = 10;              // Scale 1-10: higher = more capital + smaller hysteresis
  const CASH_FLOOR = AGGRESSIVENESS < 10 ? 250_000_000 : 0; // Ultra-aggressive ignores cash floor
  const MAX_CASH_FRACTION = AGGRESSIVENESS / 10; // % of available cash used per trade
  const EXIT_HYSTERESIS_BASE = 0.03;      // Base buffer for forecast to prevent flip-flopping
  const EXPECTED_PROFIT_MULTIPLIER = 1;   // Multiplier over commission to consider trade worth it

  // Adjust hysteresis based on aggressiveness
  const EXIT_HYSTERESIS = Math.max(EXIT_HYSTERESIS_BASE * (11 - AGGRESSIVENESS) / 10, 0.005);
  // High aggressiveness -> smaller hysteresis (exits sooner), Low -> larger buffer

  // -------------------------
  // INITIALIZATION
  // -------------------------
  const symbols = ns.stock.getSymbols();
  const holdings = {}; // Tracks purchase prices and share counts

  for (const sym of symbols) {
    holdings[sym] = { longPrice: 0, longShares: 0, shortPrice: 0, shortShares: 0 };
  }

  ns.print("=== Super-Compounding Stock Trader Initialized ===");
  ns.print(`Aggressiveness level: ${AGGRESSIVENESS}/10`);

  // -------------------------
  // MAIN LOOP
  // -------------------------
  while (true) {
    // Get available cash, respecting floor and aggressiveness
    const homeCash = ns.getServerMoneyAvailable("home");
    let availableCash = Math.max(homeCash - CASH_FLOOR, 0);
    availableCash = Math.min(availableCash, homeCash * MAX_CASH_FRACTION);

    const stockData = [];

    // Gather stock data and calculate priority weights
    for (const sym of symbols) {
      const forecast = ns.stock.getForecast(sym);
      const price = ns.stock.getAskPrice(sym);
      const volatility = ns.stock.getVolatility(sym);
      const maxShares = ns.stock.getMaxShares(sym);

      const deviation = forecast - 0.5; // Forecast deviation from neutral
      // Weight incorporates deviation, volatility, max shares, and aggressiveness
      const weight = Math.abs(deviation) * volatility * maxShares * AGGRESSIVENESS;

      stockData.push({ sym, forecast, price, volatility, maxShares, deviation, weight });
    }

    // Sort stocks by potential (weight) descending
    stockData.sort((a, b) => b.weight - a.weight);

    for (const stock of stockData) {
      const { sym, forecast, price, volatility, maxShares, deviation } = stock;
      const { longShares, longPrice, shortShares, shortPrice } = holdings[sym];

      // Determine trade size based on aggressiveness and forecast deviation
      let desiredShares = Math.floor(availableCash / price * (AGGRESSIVENESS / 10));
      if (desiredShares > maxShares) desiredShares = maxShares;

      // -------------------------
      // EXIT LONG POSITIONS
      // -------------------------
      if (longShares > 0) {
        const longProfit = (ns.stock.getBidPrice(sym) - longPrice) * longShares;
        if (forecast < 0.5 - EXIT_HYSTERESIS && longProfit > COMMISSION * EXPECTED_PROFIT_MULTIPLIER) {
          ns.stock.sell(sym, longShares);
          ns.print(`💰 Sold LONG ${longShares} ${sym} at $${ns.stock.getBidPrice(sym)} (profit: $${longProfit.toFixed(0)})`);
          holdings[sym].longShares = 0;
          holdings[sym].longPrice = 0;
        }
      }

      // -------------------------
      // EXIT SHORT POSITIONS
      // -------------------------
      if (shortShares > 0) {
        const shortProfit = (shortPrice - ns.stock.getBidPrice(sym)) * shortShares;
        if (forecast > 0.5 + EXIT_HYSTERESIS && shortProfit > COMMISSION * EXPECTED_PROFIT_MULTIPLIER) {
          ns.stock.buyToCover(sym, shortShares);
          ns.print(`💰 Covered SHORT ${shortShares} ${sym} at $${ns.stock.getBidPrice(sym)} (profit: $${shortProfit.toFixed(0)})`);
          holdings[sym].shortShares = 0;
          holdings[sym].shortPrice = 0;
        }
      }

      // -------------------------
      // BUY LONG POSITIONS
      // -------------------------
      if (forecast > MIN_FORECAST_LONG && desiredShares > 0 && longShares < maxShares) {
        const buyShares = Math.min(desiredShares, maxShares - longShares);
        const expectedProfit = Math.abs(deviation) * 2 * volatility * price * buyShares;

        if (expectedProfit > COMMISSION * EXPECTED_PROFIT_MULTIPLIER) {
          ns.stock.buy(sym, buyShares);
          holdings[sym].longShares += buyShares;
          holdings[sym].longPrice = (longShares + buyShares) > 0
            ? ((longPrice * longShares) + (price * buyShares)) / (longShares + buyShares)
            : price;
          ns.print(`🟢 Bought LONG ${buyShares} ${sym} at $${price}`);
        }
      }

      // -------------------------
      // BUY SHORT POSITIONS
      // -------------------------
      if (forecast < MAX_FORECAST_SHORT && desiredShares > 0 && shortShares < maxShares) {
        const buyShares = Math.min(desiredShares, maxShares - shortShares);
        const expectedProfit = Math.abs(deviation) * 2 * volatility * price * buyShares;

        if (expectedProfit > COMMISSION * EXPECTED_PROFIT_MULTIPLIER) {
          ns.stock.sellShort(sym, buyShares);
          holdings[sym].shortShares += buyShares;
          holdings[sym].shortPrice = (shortShares + buyShares) > 0
            ? ((shortPrice * shortShares) + (price * buyShares)) / (shortShares + buyShares)
            : price;
          ns.print(`🔴 Bought SHORT ${buyShares} ${sym} at $${price}`);
        }
      }
    }

    await ns.sleep(LOOP_SLEEP);
  }
}

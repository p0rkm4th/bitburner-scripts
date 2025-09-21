/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");

  const cashReserve = 1e6;        // Keep a cash buffer
  const minForecastLong = 0.55;   // Buy long if forecast > this
  const maxForecastShort = 0.45;  // Short if forecast < this
  const loopSleep = 50;           // Fast trading loop in ms

  const symbols = ns.stock.getSymbols();

  while (true) {
    const availableCash = ns.getServerMoneyAvailable("home") - cashReserve;

    // Calculate total forecast weight for proportional allocation
    let totalWeight = 0;
    const weights = {};
    for (const sym of symbols) {
      const forecast = ns.stock.getForecast(sym);
      let weight = 0;
      if (forecast > minForecastLong) {
        weight = (forecast - 0.5); // weighted for long positions
      } else if (forecast < maxForecastShort) {
        weight = (0.5 - forecast); // weighted for shorts
      }
      weights[sym] = weight;
      totalWeight += weight;
    }

    for (const sym of symbols) {
      const forecast = ns.stock.getForecast(sym);
      const price = ns.stock.getAskPrice(sym);
      const maxShares = ns.stock.getMaxShares(sym);
      const [sharesLong, sharesShort] = ns.stock.getPosition(sym);

      // Calculate desired allocation based on forecast weight
      const desiredCash = totalWeight > 0 ? (weights[sym] / totalWeight) * availableCash : 0;
      const desiredShares = Math.floor(desiredCash / price);

      // ---- LONG POSITIONS ----
      if (forecast > minForecastLong) {
        // Buy more if we don’t already have max shares
        const buyShares = Math.min(desiredShares - sharesLong, maxShares - sharesLong);
        if (buyShares > 0) {
          ns.stock.buy(sym, buyShares);
          ns.print(`Bought LONG ${buyShares} shares of ${sym} at $${price}`);
        }
      }

      // ---- SHORT POSITIONS ----
      if (forecast < maxForecastShort) {
        const buyShares = Math.min(desiredShares - sharesShort, maxShares - sharesShort);
        if (buyShares > 0) {
          ns.stock.sellShort(sym, buyShares);
          ns.print(`Bought SHORT ${buyShares} shares of ${sym} at $${ns.stock.getAskPrice(sym)}`);
        }
      }

      // ---- EXIT LONG POSITIONS ----
      if (forecast <= 0.5 && sharesLong > 0) {
        ns.stock.sell(sym, sharesLong);
        ns.print(`Sold LONG ${sharesLong} shares of ${sym} at $${ns.stock.getBidPrice(sym)}`);
      }

      // ---- EXIT SHORT POSITIONS ----
      if (forecast >= 0.5 && sharesShort > 0) {
        ns.stock.buyToCover(sym, sharesShort);
        ns.print(`Covered SHORT ${sharesShort} shares of ${sym} at $${ns.stock.getBidPrice(sym)}`);
      }
    }

    await ns.sleep(loopSleep); // pros trade extremely fast
  }
}

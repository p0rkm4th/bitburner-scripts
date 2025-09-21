/** 
 * stock.js
 * Automated stock trading script for Bitburner
 * Compatible with loader/worker setup
 * 
 * Logic:
 * - Buy if forecast > buyThreshold
 * - Sell if forecast < sellThreshold
 * - Calculate max affordable shares
 */

export async function main(ns) {
    ns.disableLog("sleep"); // Reduce log spam
    ns.disableLog("stock.buy");
    ns.disableLog("stock.sell");

    // Configurable thresholds
    const buyThreshold = 0.6;   // Forecast above this => buy
    const sellThreshold = 0.5;  // Forecast below this => sell
    const refreshTime = 1000;   // 1 second delay between checks

    const symbols = ns.stock.getSymbols(); // List of all stocks

    while (true) {
        const moneyAvailable = ns.getServerMoneyAvailable("home");

        for (const sym of symbols) {
            const position = ns.stock.getPosition(sym); // [shares, avgPrice, ...]
            const forecast = ns.stock.getForecast(sym); // 0-1
            const price = ns.stock.getAskPrice(sym);

            // SELL logic
            if (position[0] > 0 && forecast < sellThreshold) {
                const sharesToSell = position[0];
                const sale = ns.stock.sell(sym, sharesToSell);
                if (sale) ns.print(`Sold ${sharesToSell} shares of ${sym} at ${price}`);
            }

            // BUY logic
            if (forecast > buyThreshold) {
                const maxSharesAffordable = Math.floor(moneyAvailable / price);
                const sharesToBuy = Math.min(maxSharesAffordable, ns.stock.getMaxShares(sym) - position[0]);
                if (sharesToBuy > 0) {
                    const purchase = ns.stock.buy(sym, sharesToBuy);
                    if (purchase) ns.print(`Bought ${sharesToBuy} shares of ${sym} at ${price}`);
                }
            }
        }

        await ns.sleep(refreshTime);
    }
}

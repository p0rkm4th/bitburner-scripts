/** @param {NS} ns **/
export async function main(ns) {
  // =======================================================
  // BITBURNER STOCK DASHBOARD WITH REAL-TIME PROFIT GRAPH
  // =======================================================
  // Displays live updates of portfolio, cash, unrealized profit,
  // total net worth, top performing stocks, and a net worth growth graph.
  // The graph updates dynamically and is purple-themed.
  // Run alongside your stock trader script.
  // =======================================================

  ns.disableLog("sleep");

  const REFRESH_INTERVAL = 500; // ms
  const GRAPH_WIDTH = 50;       // Number of characters for graph width

  // Colors
  const PURPLE = [180, 100, 255];
  const LIGHT_PURPLE = [220, 180, 255];
  const GREEN = [0, 255, 0];
  const RED = [255, 50, 50];
  const ORANGE = [255, 165, 0];

  function colorize(text, color) {
    return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${text}\x1b[0m`;
  }

  const symbols = ns.stock.getSymbols();
  const netWorthHistory = []; // Stores last N net worth values for graph

  while (true) {
    const homeCash = ns.getServerMoneyAvailable("home");
    let portfolioValue = 0;
    const stockSummaries = [];

    for (const sym of symbols) {
      const position = ns.stock.getPosition(sym);
      const longShares = position[0];
      const longPrice = position[1];
      const shortShares = position[2];
      const shortPrice = position[3];

      const bidPrice = ns.stock.getBidPrice(sym);

      const longValue = longShares * bidPrice;
      const shortValue = shortShares * (2 * shortPrice - bidPrice);

      const totalValue = longValue + shortValue;
      portfolioValue += totalValue;

      stockSummaries.push({
        sym,
        longShares,
        longValue,
        shortShares,
        shortValue,
        totalValue
      });
    }

    const netWorth = homeCash + portfolioValue;
    netWorthHistory.push(netWorth);
    if (netWorthHistory.length > GRAPH_WIDTH) netWorthHistory.shift();

    ns.clear();

    // Header info
    ns.print(colorize("=== BITBURNER STOCK DASHBOARD ===", PURPLE));
    ns.print(colorize(`Net Worth: $${ns.nFormat(netWorth, "0.00a")}`, LIGHT_PURPLE));
    ns.print(colorize(`Cash: $${ns.nFormat(homeCash, "0.00a")}`, LIGHT_PURPLE));
    ns.print(colorize(`Portfolio Value: $${ns.nFormat(portfolioValue, "0.00a")}`, LIGHT_PURPLE));
    ns.print(colorize(`Top Performing Stocks:`, ORANGE));

    // Top 5 stocks by value
    stockSummaries.sort((a, b) => b.totalValue - a.totalValue);
    for (let i = 0; i < Math.min(5, stockSummaries.length); i++) {
      const s = stockSummaries[i];
      ns.print(`${colorize(s.sym, PURPLE)} | LONG: ${colorize(s.longShares + " ($" + ns.nFormat(s.longValue, "0.00a") + ")", GREEN)} | SHORT: ${colorize(s.shortShares + " ($" + ns.nFormat(s.shortValue, "0.00a") + ")", RED)} | TOTAL: $${ns.nFormat(s.totalValue, "0.00a")}`);
    }

    // Draw net worth graph
    const minWorth = Math.min(...netWorthHistory);
    const maxWorth = Math.max(...netWorthHistory);
    const range = Math.max(maxWorth - minWorth, 1);

    let graphLine = "";
    for (const value of netWorthHistory) {
      const pos = Math.floor(((value - minWorth) / range) * (GRAPH_WIDTH - 1));
      graphLine += colorize("█", PURPLE);
    }

    ns.print("\n" + colorize("Net Worth Growth (latest " + GRAPH_WIDTH + " points):", LIGHT_PURPLE));
    ns.print(graphLine);

    await ns.sleep(REFRESH_INTERVAL);
  }
}

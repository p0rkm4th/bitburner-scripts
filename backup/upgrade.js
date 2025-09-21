/** @param {NS} ns */
export async function main(ns) {
  const spendFraction = 0.2;  // % of total money to spend
  const incomeFraction = 0.5; // % of recent income to spend
  const loopDelay = 30_000;   // 30 seconds between upgrade checks

  while (true) {
    // Determine if we’re using income-based or total-money-based cap
    const args = ns.args;
    const useIncomeCap = args[0] === "income";
    const recentIncome = args[1] || 0;

    let totalMoney = ns.getServerMoneyAvailable("home");
    let budget = useIncomeCap ? recentIncome * incomeFraction : totalMoney * spendFraction;
    let spent = 0;

    // Hacknet upgrades
    const nodes = ns.hacknet.numNodes();
    for (let i = 0; i < nodes; i++) {
      const levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
      const ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
      const coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);

      if (spent + levelCost <= budget && totalMoney >= levelCost) {
        ns.hacknet.upgradeLevel(i, 1);
        spent += levelCost;
        totalMoney -= levelCost;
      } else if (spent + ramCost <= budget && totalMoney >= ramCost) {
        ns.hacknet.upgradeRam(i, 1);
        spent += ramCost;
        totalMoney -= ramCost;
      } else if (spent + coreCost <= budget && totalMoney >= coreCost) {
        ns.hacknet.upgradeCore(i, 1);
        spent += coreCost;
        totalMoney -= coreCost;
      }
    }

    // Purchased server upgrades
    const servers = ns.getPurchasedServers();
    const maxRam = ns.getPurchasedServerMaxRam();
    for (const s of servers) {
      const curRam = ns.getServerMaxRam(s);
      if (curRam >= maxRam) continue;
      const cost = ns.getPurchasedServerCost(curRam * 2);
      if (spent + cost <= budget && totalMoney >= cost) {
        ns.deleteServer(s);
        ns.purchaseServer(s, curRam * 2);
        spent += cost;
        totalMoney -= cost;
      }
    }

    ns.print(`Upgrade.js spent $${ns.nFormat(spent, "0.0a")} / $${ns.nFormat(budget, "0.0a")} budget.`);
    await ns.sleep(loopDelay);
  }
}

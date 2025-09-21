/** @param {NS} ns */
export async function main(ns) {
  const loopDelay = 30_000; // 30 seconds between upgrade checks
  const minCash = 1_000_000; // minimum cash to start spending

  // Incremental spending thresholds
  const tiers = [1_000_000, 5_000_000, 10_000_000, 20_000_000, 40_000_000, 80_000_000];
  const tierMultipliers = [0.0, 0.1, 0.125, 0.15, 0.2, 0.25]; // fraction of total money to spend at each tier

  while (true) {
    let totalMoney = ns.getServerMoneyAvailable("home");
    if (totalMoney < minCash) {
      await ns.sleep(loopDelay);
      continue;
    }

    // Determine budget based on current money tier
    let budget = 0;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (totalMoney >= tiers[i]) {
        budget = totalMoney * tierMultipliers[i];
        break;
      }
    }

    let spent = 0;

    // --- HACKNET UPGRADES ---
    const nodes = ns.hacknet.numNodes();
    for (let i = 0; i < nodes; i++) {
      // Cache upgrade costs
      const levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
      const ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
      const coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);

      // Determine best bang for buck
      const upgrades = [
        { cost: levelCost, func: () => ns.hacknet.upgradeLevel(i, 1) },
        { cost: ramCost, func: () => ns.hacknet.upgradeRam(i, 1) },
        { cost: coreCost, func: () => ns.hacknet.upgradeCore(i, 1) }
      ].filter(u => totalMoney >= u.cost && spent + u.cost <= budget);

      if (upgrades.length > 0) {
        // Choose cheapest upgrade (good approximation for bang-for-buck)
        upgrades.sort((a, b) => a.cost - b.cost);
        upgrades[0].func();
        spent += upgrades[0].cost;
        totalMoney -= upgrades[0].cost;
      }
    }

    // --- PURCHASED SERVER UPGRADES ---
    const servers = ns.getPurchasedServers();
    const maxRam = ns.getPurchasedServerMaxRam();
    for (const s of servers) {
      const curRam = ns.getServerMaxRam(s);
      if (curRam >= maxRam) continue;
      const cost = ns.getPurchasedServerCost(curRam * 2);
      if (totalMoney >= cost && spent + cost <= budget) {
        ns.deleteServer(s);
        ns.purchaseServer(s, curRam * 2);
        spent += cost;
        totalMoney -= cost;
      }
    }

    // --- HACKNET NODE PURCHASES (if any nodes missing) ---
    const maxNodes = ns.hacknet.maxNumNodes();
    if (nodes < maxNodes) {
      const nodeCost = ns.hacknet.getPurchaseNodeCost();
      if (totalMoney >= nodeCost && spent + nodeCost <= budget) {
        ns.hacknet.purchaseNode();
        spent += nodeCost;
        totalMoney -= nodeCost;
      }
    }

    ns.print(`Upgrade.js spent $${ns.nFormat(spent, "0.0a")} / $${ns.nFormat(budget, "0.0a")} budget.`);
    await ns.sleep(loopDelay);
  }
}

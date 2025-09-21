/** @param {NS} ns */
export async function main(ns) {
  const refreshMin = 60_000;  // 1 minute
  const refreshMax = 90_000;  // 1.5 minutes
  const reservedForUpgrade = 12; // GB reserved for upgrade.js
  const batchDelay = 200; // ms between batch launches
  const workerScript = "worker.js";
  const upgradeScript = "upgrade.js";

  // Flag to skip upgrade.js
  const skipUpgrade = ns.args.includes("--no-upgrade");

  let lastMoney = ns.getServerMoneyAvailable("home");

  // Launch upgrade.js once at the start if enabled
  if (!skipUpgrade) {
    const homeAvailableRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    if (homeAvailableRam >= reservedForUpgrade && !ns.isRunning(upgradeScript, "home")) {
      ns.exec(upgradeScript, "home", 1, "income", 0);
    }
  }

  while (true) {
    const currentMoney = ns.getServerMoneyAvailable("home");
    const recentIncome = Math.max(0, currentMoney - lastMoney);
    lastMoney = currentMoney;

    // Scan all root-access servers (excluding home)
    const servers = scanAll(ns, "home").filter(s => ns.hasRootAccess(s) && s !== "home");

    // Pick highest estimated money/sec target
    const target = servers
      .map(s => {
        const hackTime = ns.getHackTime(s);
        const growTime = ns.getGrowTime(s);
        const weakenTime = ns.getWeakenTime(s);
        const hackChance = ns.hackAnalyzeChance(s);
        const hackPercent = ns.hackAnalyze(s);
        const batchDuration = Math.max(hackTime, growTime, weakenTime);
        const estMoney = hackPercent * ns.getServerMoneyAvailable(s) * hackChance;
        const moneyPerSec = estMoney / (batchDuration / 1000);
        return { name: s, moneyPerSec };
      })
      .sort((a, b) => b.moneyPerSec - a.moneyPerSec)[0]?.name;

    if (!target) {
      await ns.sleep(batchDelay);
      continue;
    }

    const workerRam = ns.getScriptRam(workerScript);
    const homeAvailableRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");

    // Launch upgrade.js if enabled and enough RAM
    if (!skipUpgrade && !ns.isRunning(upgradeScript, "home") && homeAvailableRam >= reservedForUpgrade) {
      ns.exec(upgradeScript, "home", 1, "income", recentIncome);
    }

    // Launch HWGW batches
    for (const server of servers) {
      const totalRam = ns.getServerMaxRam(server);
      const usedRam = ns.getServerUsedRam(server);
      let availableRam = totalRam - usedRam - (server === "home" ? reservedForUpgrade : 0);

      if (availableRam < workerRam) continue;

      const hackThreads = Math.max(1, Math.floor(availableRam * 0.3 / workerRam));
      const growThreads = Math.max(1, Math.floor(availableRam * 0.3 / workerRam));
      const weakenThreads = Math.max(1, Math.floor(availableRam * 0.4 / workerRam));

      if (hackThreads > 0) ns.exec(workerScript, server, hackThreads, target, "hack");
      await ns.sleep(batchDelay);
      if (growThreads > 0) ns.exec(workerScript, server, growThreads, target, "grow");
      await ns.sleep(batchDelay);
      if (weakenThreads > 0) ns.exec(workerScript, server, weakenThreads, target, "weaken");
    }

    // Randomized refresh delay
    const delay = Math.floor(Math.random() * (refreshMax - refreshMin) + refreshMin);
    await ns.sleep(delay);
  }
}

// Recursive network scan
function scanAll(ns, host, found = new Set()) {
  found.add(host);
  for (const s of ns.scan(host)) {
    if (!found.has(s)) scanAll(ns, s, found);
  }
  return Array.from(found);
}

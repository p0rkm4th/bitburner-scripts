/** @param {NS} ns */
export async function main(ns) {
  const refreshDelay = 60_000;   // 1 minute
  const batchDelay = 200;        // ms between batch launches
  const secBuffer = 0.05;        // security buffer
  const reservedForUpgrade = 12; // GB reserved for upgrade.js
  const extraHomeBuffer = 4;     // Extra 4 GB buffer on home
  const upgradeScript = "upgrade.js";
  const workerScript = "worker.js";

  const forceCopy = ns.args.includes("--force-copy");
  const skipUpgrade = ns.args.includes("--no-upgrade");

  ns.disableLog("ALL");

  // --- Recursive network scan ---
  function scanAll(host = "home", found = new Set()) {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
    return [...found];
  }

  // --- Safe upgrade.js launcher ---
  function startUpgrade() {
    const homeFree = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    if (!skipUpgrade && homeFree >= reservedForUpgrade) {
      if (!ns.isRunning(upgradeScript, "home", "income", 0)) {
        ns.exec(upgradeScript, "home", 1, "income", 0);
      }
    }
  }

  startUpgrade();

  while (true) {
    startUpgrade();

    const playerHack = ns.getHackingLevel();

    // 🎯 Arg target override
    let targetArg = ns.args.find(a => typeof a === "string" && !a.startsWith("--"));
    let target;
    if (targetArg) {
      if (!ns.serverExists(targetArg)) {
        ns.tprint(`❌ Target ${targetArg} does not exist.`);
        return;
      }
      target = targetArg;
    } else {
      const servers = scanAll()
        .filter(s => ns.hasRootAccess(s) &&
          ns.getServerMaxMoney(s) > 0 &&
          ns.getServerRequiredHackingLevel(s) <= playerHack &&
          s !== "home");

      if (!servers.length) {
        ns.tprint("No hackable targets");
        await ns.sleep(refreshDelay);
        continue;
      }

      target = servers.map(s => {
        const curM = ns.getServerMoneyAvailable(s);
        const hChance = ns.hackAnalyzeChance(s);
        const cycleTime = (
          ns.getHackTime(s) +
          ns.getWeakenTime(s) +
          ns.getGrowTime(s) +
          ns.getWeakenTime(s)
        ) / 1000;
        const moneyPerHack = ns.hackAnalyze(s) * curM;
        return { s, score: moneyPerHack * hChance / cycleTime };
      }).sort((a, b) => b.score - a.score)[0].s;
    }

    ns.tprint(`🚀 Deploying HWGW batches to target: ${target}`);

    const hosts = scanAll().filter(h => ns.hasRootAccess(h));
    const ramPerThread = ns.getScriptRam(workerScript);
    let totalThreads = 0, totalHack = 0, totalGrow = 0, totalWeaken = 0;

    const reservedRam = reservedForUpgrade + extraHomeBuffer;

    for (let hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
      const host = hosts[hostIndex];

      if (host !== "home" && (forceCopy || !ns.fileExists(workerScript, host))) {
        await ns.scp(workerScript, host);
      }

      if (host === "home") {
        for (const proc of ns.ps(host)) {
          if (proc.filename === workerScript) ns.kill(proc.pid);
        }
      } else {
        ns.killall(host);
      }

      let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      if (host === "home") freeRam -= reservedRam;

      const threads = Math.floor(freeRam / ramPerThread);
      if (threads <= 0) continue;

      const cycles = Math.floor(threads / 4);
      const leftoverThreads = threads - cycles * 4;
      const minSec = ns.getServerMinSecurityLevel(target);
      const offsetBase = hostIndex * 50;

      if (cycles > 0) {
        for (let i = 0; i < cycles; i++) {
          const o = i * batchDelay + offsetBase;
          if (ns.getServerSecurityLevel(target) > minSec * (1 + secBuffer)) {
            ns.exec(workerScript, host, 1, target, "weaken", o + 50);
            totalWeaken++;
          }
          ns.exec(workerScript, host, 1, target, "hack", o);
          totalHack++;
          if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * 0.8) {
            ns.exec(workerScript, host, 1, target, "grow", o + 100);
            totalGrow++;
          }
          if (ns.getServerSecurityLevel(target) > minSec * (1 + secBuffer)) {
            ns.exec(workerScript, host, 1, target, "weaken", o + 150);
            totalWeaken++;
          }
        }
      }

      totalThreads += threads;

      if (leftoverThreads > 0) {
        const actions = [];
        for (let i = 0; i < leftoverThreads; i++) {
          let action = "hack";
          const sec = ns.getServerSecurityLevel(target);
          const money = ns.getServerMoneyAvailable(target);
          const maxM = ns.getServerMaxMoney(target);

          if (sec > minSec * (1 + secBuffer)) action = "weaken";
          else if (money < maxM * 0.8) action = "grow";

          actions.push(action);
          ns.exec(workerScript, host, 1, target, action);
        }

        const actionSummary = actions.reduce((acc, a) => {
          acc[a] = (acc[a] || 0) + 1;
          return acc;
        }, {});
        const smartString = Object.entries(actionSummary).map(([k, v]) => `${v} ${k}`).join(" | ");
        ns.tprint(`| ${host.padEnd(15)} | ${cycles} full HWGW cycles | ${smartString}`);
      } else {
        ns.tprint(`| ${host.padEnd(15)} | ${cycles} full HWGW cycles`);
      }
    }

    // 💰 Income estimation
    const hackMoneyPerThread = ns.hackAnalyze(target) * ns.getServerMaxMoney(target);
    const expectedHackMoney = hackMoneyPerThread * totalHack * ns.hackAnalyzeChance(target);
    const avgCycleTime = (
      ns.getHackTime(target) + ns.getGrowTime(target) + 2 * ns.getWeakenTime(target)
    ) / 4000; // ms → sec, /4 ops
    const incomePerSec = expectedHackMoney / avgCycleTime;

    ns.tprint(`Summary: ${totalThreads} threads → hack:${totalHack} | grow:${totalGrow} | weaken:${totalWeaken}`);
    ns.tprint(`💰 Estimated income/sec: ${ns.formatNumber(incomePerSec, 3)}/s @ ${target}`);
    await ns.sleep(refreshDelay);
  }
}

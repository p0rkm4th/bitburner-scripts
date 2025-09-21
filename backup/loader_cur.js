/** @param {NS} ns */
export async function main(ns) {
  const refreshDelay = 60000; // 1 minute
  const batchDelay = 200;
  const secBuffer = 0.05;

  // Flag to control forced copy
  const forceCopy = ns.args.includes("--force-copy");

  function scanAll(host = "home", found = new Set()) {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
    return [...found];
  }

  while (true) {
    const playerHack = ns.getHackingLevel();
    const servers = scanAll().filter(s =>
      ns.hasRootAccess(s) &&
      ns.getServerMaxMoney(s) > 0 &&
      ns.getServerRequiredHackingLevel(s) <= playerHack
    );

    if (!servers.length) {
      ns.tprint("No hackable targets");
      await ns.sleep(refreshDelay);
      continue;
    }

    // Pick best target by $/sec score
    const target = servers.map(s => {
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

    ns.tprint(`Deploying HWGW batches to target: ${target}`);

    const hosts = scanAll().filter(h => ns.hasRootAccess(h));
    const ramPerThread = ns.getScriptRam("worker.js");
    let totalThreads = 0, totalHack = 0, totalGrow = 0, totalWeaken = 0;

    for (let hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
      const host = hosts[hostIndex];

      // Copy worker.js if missing or forced
      if (host !== "home" && (forceCopy || !ns.fileExists("worker.js", host))) {
        await ns.scp("worker.js", host);
      }

      ns.killall(host);

      const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      const threads = Math.floor(freeRam / ramPerThread);
      if (threads === 0) continue;

      const cycles = Math.floor(threads / 4);
      const leftoverThreads = threads - cycles * 4;
      const minSec = ns.getServerMinSecurityLevel(target);
      const offsetBase = hostIndex * 50;

      // Full HWGW cycles
      if (cycles > 0) {
        for (let i = 0; i < cycles; i++) {
          const o = i * batchDelay + offsetBase;
          if (ns.getServerSecurityLevel(target) > minSec * (1 + secBuffer)) {
            ns.exec("worker.js", host, 1, target, "weaken", o + 50);
            totalWeaken++;
          }

          ns.exec("worker.js", host, 1, target, "hack", o);
          totalHack++;

          if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * 0.8) {
            ns.exec("worker.js", host, 1, target, "grow", o + 100);
            totalGrow++;
          }

          if (ns.getServerSecurityLevel(target) > minSec * (1 + secBuffer)) {
            ns.exec("worker.js", host, 1, target, "weaken", o + 150);
            totalWeaken++;
          }
        }
      }

      totalThreads += threads;

      // Smart leftover threads assignment and immediate exec
      if (leftoverThreads > 0) {
        const actions = [];
        for (let i = 0; i < leftoverThreads; i++) {
          let action = "hack";
          const sec = ns.getServerSecurityLevel(target);
          const money = ns.getServerMoneyAvailable(target);
          const maxM = ns.getServerMaxMoney(target);

          if (sec > minSec * (1 + secBuffer)) {
            action = "weaken";
            totalWeaken++;
          } else if (money < maxM * 0.8) {
            action = "grow";
            totalGrow++;
          } else {
            totalHack++;
          }

          actions.push(action);
          ns.exec("worker.js", host, 1, target, action);
        }
        // Build the smart threads description
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

    ns.tprint(`Summary: ${totalThreads} threads → hack:${totalHack} | grow:${totalGrow} | weaken:${totalWeaken}`);
    await ns.sleep(refreshDelay);
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const refreshDelay = 60_000; // 1 minute
  const batchDelay = 200;      // ms between batch launches
  const secBuffer = 0.05;      // security buffer
  const homeRamBuffer = 8;     // 4 GB buffer on home

  const forceCopy = ns.args.includes("--force-copy");
  const workerScript = "worker.js";

  ns.disableLog("ALL");

  // Scan function
  function scanAll(host = "home", found = new Set()) {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
    return [...found];
  }

  //Scans for all available targets and picks best determined from the math below
  while (true) {
    const playerHack = ns.getHackingLevel();

    let targetArg = ns.args.find(a => typeof a === "string" && a !== "--force-copy");
    let target;
    if (targetArg) { //Arg verification if used
      if (!ns.serverExists(targetArg)) {
        ns.tprint(`❌ Target ${targetArg} does not exist.`);
        return;
      }
      target = targetArg;

      // Filtering all that are within hacking level, have root access, and have more than $0
    } else {
      const servers = scanAll()
        .filter(s => ns.hasRootAccess(s) &&
          ns.getServerMaxMoney(s) > 0 &&
          ns.getServerRequiredHackingLevel(s) <= playerHack &&
          s !== "home");

      // A Bad Day
      if (!servers.length) {
        ns.tprint("No hackable targets");
        await ns.sleep(refreshDelay);
        continue;
      }

      // Target Selection process
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

    // This entire section (69-135) handles thread and HWGW cycle logic
    for (let hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
      const host = hosts[hostIndex];

      // SCP worker files with --force-copy arg
      if (host !== "home" && (forceCopy || !ns.fileExists(workerScript, host))) {
        await ns.scp(workerScript, host);
      }
      ns.killall(host);

      // Ram math logic
      let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      if (host === "home") freeRam = Math.max(0, freeRam - homeRamBuffer);

      const threads = Math.floor(freeRam / ramPerThread);
      if (threads === 0) continue;

      const cycles = Math.floor(threads / 4);
      const leftoverThreads = threads - cycles * 4;
      const minSec = ns.getServerMinSecurityLevel(target);
      const offsetBase = hostIndex * 50;

      // Calculating HWGW cycles based on available RAM
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

      // Thread math to ensure no ram waste
      // (Workers are aprox 2gb, a cycle is 8gb, so 4 threads)
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
        const smartString = Object.entries(actions.reduce((a, b) => (a[b] = (a[b] || 0) + 1, a), {}))
          .map(([k, v]) => `${v} ${k}`).join(" | ");
        ns.tprint(`| ${host.padEnd(15)} | ${cycles} full HWGW cycles | ${smartString}`);
      } else {
        ns.tprint(`| ${host.padEnd(15)} | ${cycles} full HWGW cycles`);
      }
    }

    // 💰 Income calculation
    const hackMoneyPerThread = ns.hackAnalyze(target) * ns.getServerMaxMoney(target);
    const expectedHackMoney = hackMoneyPerThread * totalHack * ns.hackAnalyzeChance(target);
    const avgCycleTime = (
      ns.getHackTime(target) + ns.getGrowTime(target) + 2 * ns.getWeakenTime(target)
    ) / 4000; // ms → sec, /4 cycles
    const incomePerSec = expectedHackMoney / avgCycleTime;

    // Outputs
    ns.tprint(`Summary: ${totalThreads} threads → hack:${totalHack} | grow:${totalGrow} | weaken:${totalWeaken}`);
    ns.tprint(`💰 Estimated income/sec: ${ns.formatNumber(incomePerSec, 3)}/s @ ${target}`);
    await ns.sleep(refreshDelay);
  }
}

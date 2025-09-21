/** @param {NS} ns */
export async function main(ns) {
  // ---------- Config (tweak these) ----------
  const refreshDelay = 60_000;   // 1 minute between target-selection refreshes
  const batchSpacing = 200;      // ms between launching distinct micro-batches from same host
  const secBuffer = 0.05;        // allowed buffer above server minSecurity before forcing weaken-only
  const homeRamBuffer = 8;       // GB to reserve on home
  const workerScript = "worker.js"; // worker the loader will exec on hosts
  const forceCopy = ns.args.includes("--force-copy"); // flag to force scp of worker to hosts

  // Micro-batch specific tuning:
  const hackPercent = 0.01;      // fraction of server money to steal per batch (0.01 = 1%)
  const maxBatchDurationPad = 100; // ms pad added to batch end target for safety
  const staggerMs = {            // small ordering offsets to guarantee ordering of finishing times
    hack: -15,                   // hack finishes a touch earlier than weaken1
    weaken1: -10,
    grow: 0,
    weaken2: 10
  };

  ns.disableLog("ALL"); // silence noisy logs

  // ---------- utility: full network scan ----------
  function scanAll(host = "home", found = new Set()) {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
    return [...found];
  }

  // ---------- main loop: pick a target, deploy batches, sleep then repeat ----------
  while (true) {
    const playerHack = ns.getHackingLevel(); // player's hacking level

    // target argument handling (if provided)
    let targetArg = ns.args.find(a => typeof a === "string" && a !== "--force-copy");
    let target;
    if (targetArg) {
      if (!ns.serverExists(targetArg)) { ns.tprint(`❌ Target ${targetArg} does not exist.`); return; }
      target = targetArg;
    } else {
      // pick best target from accessible servers (root, has money, level <= player)
      const servers = scanAll()
        .filter(s => ns.hasRootAccess(s) &&
          ns.getServerMaxMoney(s) > 0 &&
          ns.getServerRequiredHackingLevel(s) <= playerHack &&
          s !== "home");

      if (!servers.length) { ns.tprint("No hackable targets"); await ns.sleep(refreshDelay); continue; }

      // score servers: expected money per second heuristic (current money * hackChance * hackPercent / cycleTime)
      target = servers.map(s => {
        const curM = ns.getServerMoneyAvailable(s);
        const hChance = ns.hackAnalyzeChance(s);
        const hackTime = ns.getHackTime(s);
        const growTime = ns.getGrowTime(s);
        const weakenTime = ns.getWeakenTime(s);
        // estimate cycle time in seconds (end-to-end)
        const cycleTime = (hackTime + weakenTime + growTime + weakenTime) / 1000;
        const moneyPerHack = ns.hackAnalyze(s) * curM;
        return { s, score: moneyPerHack * hChance * hackPercent / cycleTime };
      }).sort((a, b) => b.score - a.score)[0].s;
    }

    ns.tprint(`🚀 Deploying micro HWGW batches to target: ${target}`);

    const hosts = scanAll().filter(h => ns.hasRootAccess(h));
    const ramPerThread = ns.getScriptRam(workerScript); // ram cost per thread of worker.js
    let totalThreads = 0, totalHack = 0, totalGrow = 0, totalWeaken = 0;

    // For each host, compute how many micro-batches we can run and launch them.
    for (let hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
      const host = hosts[hostIndex];

      // copy worker if needed
      if (host !== "home" && (forceCopy || !ns.fileExists(workerScript, host))) {
        await ns.scp(workerScript, host);
      }

      // kill any running workers on host to free RAM (caller choice)
      ns.killall(host);

      // compute available RAM on host (subtract home buffer if home)
      let freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      if (host === "home") freeRam = Math.max(0, freeRam - homeRamBuffer);

      // threads we can run of workerScript on this host
      const threads = Math.floor(freeRam / ramPerThread);
      if (threads === 0) continue; // nothing to run here

      // How many micro-batches can this host run in parallel? We will budget threads per micro-batch.
      // We'll attempt to run several small batches: compute an optimistic batchesCount based on needing NthreadsPerBatch
      // but first compute per-batch threads based on current server state
      const minSec = ns.getServerMinSecurityLevel(target);
      const curSec = ns.getServerSecurityLevel(target);
      const curMoney = ns.getServerMoneyAvailable(target);
      const maxMoney = ns.getServerMaxMoney(target);

      // If security is too high, fallback to weaken-only behavior to bring security down
      if (curSec > minSec * (1 + secBuffer)) {
        // compute required weaken threads to bring to minSec (conservative)
        const secToRemove = curSec - minSec;
        const reqWeakenThreads = Math.ceil(secToRemove / 0.05);
        const usableThreads = Math.min(reqWeakenThreads, threads);   // <- new
        const batches = Math.max(1, Math.floor(threads / usableThreads));
        // launch weaken-only jobs split across available batches
        for (let b = 0; b < batches; b++) {
          const baseOffset = hostIndex * 50 + b * batchSpacing;
          // schedule single weaken that runs and ends roughly same time (we just run immediate; worker handles sleep 0)
          // Exec signature: ns.exec(script, host, threads, ...args)
          // Worker expects args: target, action, offset
          ns.exec(workerScript, host, usableThreads, target, "weaken", baseOffset);
          totalWeaken += usableThreads;
        }
        totalThreads += threads;
        ns.tprint(`| ${host.padEnd(15)} | weaken-only fallback | threads:${threads} | reqWeaken:${usableThreads}`);
        continue;
      }

      // ---------- Compute per-batch threads for a single micro-batch ----------
      // 1) hackThreads: how many threads to steal ~hackPercent of server
      // ns.hackAnalyze(target) returns fraction stolen per single thread (at current conditions)
      const hackPerThread = ns.hackAnalyze(target); // fraction of current money stolen per thread
      // if hackPerThread is 0 (e.g., too high level mismatch) fallback to 1 thread
      const hackThreads = Math.max(1, Math.ceil(hackPercent / Math.max(1e-12, hackPerThread)));

      // 2) growThreads: threads required to regrow the money stolen back to previous level
      // desired multiplier = currentMoney / (currentMoney - stolenAmount) => but simpler: we want to restore money to max
      // required multiplier = maxMoney / (curMoney - hackPercent*curMoney) = maxMoney / (curMoney*(1 - hackPercent))
      const stolenAmount = curMoney * Math.min(hackPercent, 0.999);
      const postHackMoney = Math.max(1, curMoney - stolenAmount); // avoid divide by 0
      const desiredMultiplier = Math.max(1 + 1e-9, maxMoney / postHackMoney);
      // growthAnalyze returns threads required to multiply by multiplier
      const growThreads = Math.ceil(ns.growthAnalyze(target, desiredMultiplier));

      // 3) security increases caused by hack+grow; then compute weaken threads to offset them
      // hack increases sec by 0.002 per hack thread; grow increases sec by 0.004 per grow thread.
      const secIncreaseFromHack = hackThreads * 0.002;
      const secIncreaseFromGrow = growThreads * 0.004;
      const totalSecIncrease = secIncreaseFromHack + secIncreaseFromGrow;
      // weaken reduces 0.05 per thread -> threads needed:
      const weakenThreads = Math.ceil(totalSecIncrease / 0.05);

      // threads required to run one full HWGW micro-batch:
      const threadsPerBatch = hackThreads + growThreads + weakenThreads;

      // how many batches can this host run in parallel given its threads budget?
      const maxBatches = Math.max(1, Math.floor(threads / threadsPerBatch));
      // clamp to practical number to avoid oversubscription (optional)
      const batchesToLaunch = maxBatches;

      // get action durations (ms)
      const hackTime = ns.getHackTime(target);
      const growTime = ns.getGrowTime(target);
      const weakenTime = ns.getWeakenTime(target);

      // compute a single batch's "end time" offset base so all actions end near the same time
      // choose end = baseOffset + max(hackTime, growTime, weakenTime) + pad
      // for each batch we will choose baseOffset = hostIndex*50 + batchIndex*batchSpacing
      for (let b = 0; b < batchesToLaunch; b++) {
        const baseOffset = hostIndex * 50 + b * batchSpacing; // per-host per-batch launch offset

        // align ends to this batchEnd (relative offset)
        const maxActionTime = Math.max(hackTime, growTime, weakenTime);
        const batchEnd = baseOffset + maxActionTime + maxBatchDurationPad;

        // compute start delays so that action finishes near batchEnd plus a small per-action stagger
        const hackDelay = Math.max(0, Math.floor(batchEnd - hackTime + staggerMs.hack));
        const weaken1Delay = Math.max(0, Math.floor(batchEnd - weakenTime + staggerMs.weaken1));
        const growDelay = Math.max(0, Math.floor(batchEnd - growTime + staggerMs.grow));
        const weaken2Delay = Math.max(0, Math.floor(batchEnd - weakenTime + staggerMs.weaken2));

        // FIRE the worker scripts with computed threads and delays (worker will sleep for delayMs)
        // Note: ordering of these exec calls doesn't matter, the worker sleeps until its start time.
        // Exec arguments: ns.exec(script, host, threads, ...args)
        // Worker expects args: target, action, offset
        ns.exec(workerScript, host, hackThreads, target, "hack", hackDelay);
        ns.exec(workerScript, host, weakenThreads, target, "weaken", weaken1Delay);
        ns.exec(workerScript, host, growThreads, target, "grow", growDelay);
        ns.exec(workerScript, host, weakenThreads, target, "weaken", weaken2Delay);

        totalHack += hackThreads;
        totalGrow += growThreads;
        totalWeaken += 2 * weakenThreads;
      }

      totalThreads += threads;

      // informative print for this host
      ns.tprint(`| ${host.padEnd(15)} | batches:${batchesToLaunch} | perBatchThreads:${threadsPerBatch} (hack:${hackThreads} grow:${growThreads} weak:${weakenThreads})`);
    }

    // income estimate (coarse)
    const hackMoneyPerThread = ns.hackAnalyze(target) * ns.getServerMaxMoney(target);
    const expectedHackMoney = hackMoneyPerThread * totalHack * ns.hackAnalyzeChance(target);
    const avgCycleTime = (ns.getHackTime(target) + ns.getGrowTime(target) + 2 * ns.getWeakenTime(target)) / 4000;
    const incomePerSec = expectedHackMoney / avgCycleTime;

    ns.tprint(`Summary: ${totalThreads} threads → hack:${totalHack} | grow:${totalGrow} | weaken:${totalWeaken}`);
    ns.tprint(`💰 Estimated income/sec: ${ns.formatNumber(incomePerSec, 3)}/s @ ${target}`);

    await ns.sleep(refreshDelay);
  }
}

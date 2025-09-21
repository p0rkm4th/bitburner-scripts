/** @param {NS} ns **/
export async function main(ns) {
  // -------------------------
  // Disable noisy logs for repeated NS calls
  // -------------------------
  ns.disableLog("sleep");
  ns.disableLog("getServerMaxRam");
  ns.disableLog("getServerUsedRam");
  ns.disableLog("scan");
  ns.disableLog("scp");
  ns.disableLog("exec");

  // -------------------------
  // Configurable defaults
  // -------------------------
  const HOME = "home";
  const reservedRamDefault = 8;
  const workerScript = "/worker.js";
  const meganukeScript = "/cmd/meganuke.js";
  const doorsScript = "/cmd/doors.js";
  const upgradesScript = "/upgrade.js";
  const bmNotifyScript = "/cmd/bm-notify.js";
  const logDir = "/logs/";

  // -------------------------
  // Target prioritization
  // -------------------------
  const moneyWeight = 0.8;
  const securityWeight = 1.2;
  const growBias = 50; // <— increase this to lean harder toward grow

  // -------------------------
  // Parse args / flags
  // -------------------------
  const args = ns.args.map(a => String(a));
  const hasFlag = f => args.includes(f);
  const getFlagArg = f => {
    const i = args.indexOf(f);
    return (i >= 0 && i < args.length - 1) ? args[i + 1] : null;
  };

  const debug = hasFlag("--debug");
  const doNuke = hasFlag("--nuke");
  const doDoors = hasFlag("--doors");
  const doUpgrade = hasFlag("--upgrade");
  const doBmNotify = hasFlag("--bm-notify");
  const forceCopy = hasFlag("--force-copy");
  const chaos = hasFlag("--chaos");
  const multi = hasFlag("--multi");
  const reservedRam = Number(getFlagArg("--reserve")) || reservedRamDefault;
  const targetArg = getFlagArg("--target");
  const multiCountArg = Number(getFlagArg("--multi")) || null;

  // -------------------------
  // Logging helpers
  // -------------------------
  const log = (...m) => { if (debug) ns.tprint("[loader] " + m.join(" ")); };
  const info = (...m) => ns.print("[loader] " + m.join(" "));

  // -------------------------
  // Helper: scan all servers recursively
  // -------------------------
  function scanAll() {
    const seen = new Set([HOME]);
    const q = [HOME];
    while (q.length) {
      const cur = q.shift();
      try {
        for (const n of ns.scan(cur)) {
          if (!seen.has(n)) { seen.add(n); q.push(n); }
        }
      } catch { }
    }
    return [...seen];
  }

  // -------------------------
  // classify servers
  // -------------------------
  function classifyServers(all) {
    const targets = [], workers = [];
    const myHack = ns.getHackingLevel();
    for (const s of all) {
      const so = ns.getServer(s);
      const hasAdmin = so.hasAdminRights;
      const canTarget = so.moneyMax > 0 && so.requiredHackingSkill <= myHack && so.backdoorInstalled;
      const canWorker = so.maxRam > 0 && hasAdmin;

      if (canTarget) targets.push({
        host: s,
        maxMoney: so.moneyMax,
        curMoney: ns.getServerMoneyAvailable(s),
        sec: ns.getServerSecurityLevel(s),
        minSec: ns.getServerMinSecurityLevel(s)
      });

      if (canWorker) workers.push({
        host: s,
        maxRam: so.maxRam,
        usedRam: ns.getServerUsedRam(s),
        freeRam: Math.max(0, so.maxRam - ns.getServerUsedRam(s)),
        isHome: s === HOME
      });
    }
    if (debug) {
      log("Classified", targets.length, "targets and", workers.length, "workers");
    }
    return { targets, workers };
  }

  // -------------------------
  // rank targets
  // -------------------------
  function rankTargets(targets) {
    return targets
      .filter(t => t.maxMoney > 0)
      .sort((a, b) =>
        (b.maxMoney / (1 + b.minSec + b.sec * 0.5)) -
        (a.maxMoney / (1 + a.minSec + a.sec * 0.5))
      );
  }

  // -------------------------
  // deploy worker script
  // -------------------------
  async function deployWorkerScriptTo(w) {
    try {
      if (!ns.fileExists(workerScript, w.host) || forceCopy) {
        await ns.scp(workerScript, w.host, HOME);
      }
    } catch (e) { info(`scp error to ${w.host}: ${e}`); }
  }

  // -------------------------
  // threadsForWorker with debug
  // -------------------------
  function threadsForWorker(w) {
    const ramPerThread = ns.getScriptRam(workerScript);
    if (debug) log(`threadsForWorker(${w.host}) ramPerThread=${ramPerThread}`);
    if (!ramPerThread || ramPerThread <= 0) return 0;

    const usable = w.isHome
      ? Math.max(0, w.maxRam - reservedRam - w.usedRam)
      : Math.max(0, w.freeRam);

    const th = Math.floor(usable / ramPerThread);
    if (debug) log(`threadsForWorker(${w.host}) usable=${usable} -> ${th} threads`);
    return th;
  }

  // -------------------------
  // kill worker scripts
  // -------------------------
  function killWorkerScriptsOn(host) {
    for (const p of ns.ps(host)) {
      if (p.filename === workerScript) ns.kill(p.pid, host);
    }
  }

  // -------------------------
  // consolidate logs
  // -------------------------
  `function consolidateWorkerLogs() {
    try {
      const files = ns.ls(HOME, ".txt").filter(f => f.startsWith("worker-"));
      for (const f of files) {
        const c = ns.read(f);
        if (c) ns.write(``${logDir}worker-summary.txt``, c, "a");
        ns.write(f, "", "w");
      }
    } catch (e) { ns.print("log merge error: " + e); }
  }`

  // -------------------------
  // batch ratio (bias to grow)
  // -------------------------
  function calculateBatchRatio(t) {
    const secDelta = Math.max(0, t.sec - t.minSec);
    const moneyRatio = t.maxMoney > 0 ? t.curMoney / t.maxMoney : 0;

    // Weigh security
    const weaken = Math.max(1, Math.ceil(secDelta * 3 * securityWeight));

    // Reduce hack impact: only hack when >70% full
    const hackFactor = moneyRatio > 0.7 ? (moneyRatio - 0.7) / 0.3 : 0;
    const hack = Math.max(1, Math.ceil(hackFactor * 5 * moneyWeight));

    // Aggressively grow when money is missing
    const grow = Math.max(1, Math.ceil((1 - moneyRatio) * growBias * moneyWeight));

    return { weaken, hack, grow };
  }

  // -------------------------
  // target weight
  // -------------------------
  const targetWeight = t => {
    const moneyFrac = t.curMoney / t.maxMoney;
    const secDelta = t.sec - t.minSec;
    return (Math.pow(t.maxMoney * moneyFrac, moneyWeight)) / Math.pow(1 + secDelta, securityWeight);
  };

  // -------------------------
  // buildThreadPlan with debug
  // -------------------------
  function buildThreadPlan(workers, targets) {
    const totalThreads = workers.reduce((s, w) => s + threadsForWorker(w), 0);
    const weights = targets.map(targetWeight);
    const totalW = weights.reduce((a, b) => a + b, 0);
    if (debug) {
      log("buildThreadPlan totalThreads=", totalThreads, "totalW=", totalW, "weights=", JSON.stringify(weights));
    }
    return targets.map((t, i) => ({
      target: t,
      want: totalThreads * (totalW ? (weights[i] / totalW) : 0),
      used: 0
    }));
  }

  // -------------------------
  // next target
  // -------------------------
  function takeNextTarget(plan) {
    let best = null;
    for (const p of plan) {
      if (!best || (p.want - p.used) > (best.want - best.used)) best = p;
    }
    return best;
  }

  // -------------------------
  // Optional scripts
  // -------------------------
  if (doUpgrade && !ns.isRunning(upgradesScript, HOME)) ns.exec(upgradesScript, HOME, 1);
  if (doBmNotify && !ns.isRunning(bmNotifyScript, HOME)) ns.exec(bmNotifyScript, HOME, 1);
  if (doNuke && ns.fileExists(meganukeScript, HOME)) { ns.exec(meganukeScript, HOME, 1); await ns.sleep(200); }
  if (doDoors && ns.fileExists(doorsScript, HOME) && !ns.isRunning(doorsScript, HOME)) ns.exec(doorsScript, HOME, 1);

// -------------------------
// Main loop
// -------------------------
for (;;) {                       // “endless for” is cleaner than while(true)
  try {
    const all = scanAll();
    const { targets, workers } = classifyServers(all);
    let ranked = rankTargets(targets);
    if (chaos) ranked = ranked.sort(() => Math.random() - 0.5);

    let chosen = [];
    if (targetArg) {
      for (const n of targetArg.split(",").map(s => s.trim())) {
        const f = targets.find(t => t.host === n);
        if (f) chosen.push(f);
      }
    }
    if (!chosen.length) {
      if (multi) {
        const cnt = Math.min(multiCountArg || Math.ceil(workers.length / 3), ranked.length);
        chosen = ranked.slice(0, cnt);
      } else if (ranked.length) {
        chosen = [ranked[0]];
      }
    }

    const plan = buildThreadPlan(workers, chosen);

    for (const w of workers.sort((a, b) => b.maxRam - a.maxRam)) {
      await deployWorkerScriptTo(w);
      killWorkerScriptsOn(w.host);

      let availableThreads = threadsForWorker(w);
      if (debug) log(`Available threads on ${w.host}:`, availableThreads);
      if (availableThreads <= 0) continue;

      while (availableThreads > 0) {
        const p = takeNextTarget(plan);
        if (!p) break;

        const raw = p.want - p.used;
        const threadsToAssign = Math.min(Math.ceil(raw), availableThreads);
        if (isNaN(threadsToAssign) || threadsToAssign <= 0) break;

        p.used += threadsToAssign;
        availableThreads -= threadsToAssign;

        const ratio = calculateBatchRatio(p.target);
        const execArgs = [
          "--targets", p.target.host,
          "--threads", String(threadsToAssign),
          "--ratio", `${ratio.weaken}:${ratio.hack}:${ratio.grow}`,
          "--workerHost", w.host,
          "--logDir", logDir
        ];
        if (debug) execArgs.push("--debug");
        if (chaos) execArgs.push("--chaos");
        if (multi) execArgs.push("--multi");
        execArgs.push("--offset", String(Math.floor(Math.random() * 500)));

        const pid = ns.exec(workerScript, w.host, Math.max(1, threadsToAssign), ...execArgs);
        if (pid === 0) info(`failed to start worker on ${w.host} for ${p.target.host}`);
        else info(`Started ${workerScript} on ${w.host} for ${p.target.host} threads=${threadsToAssign}`);
      }
    }
    consolidateWorkerLogs();
  } catch (e) {
    ns.print("loader error: " + e);
  }
  await ns.sleep(10_000);        // keeps CPU load low and yields control
}
}

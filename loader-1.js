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
  const HOME = "home";                 // Your home server
  const reservedRamDefault = 8;        // GB to reserve on home
  const workerScript = "/worker.js";   // HWGW script run on remote servers
  const meganukeScript = "/cmd/meganuke.js";
  const doorsScript = "/cmd/doors.js";
  const upgradesScript = "/upgrade.js";
  const bmNotifyScript = "/cmd/bm-notify.js";
  const logDir = "/logs/";

  // -------------------------
  // Target prioritization factors
  // -------------------------
  // Higher moneyWeight favors high-money servers
  // Higher securityWeight favors low-security servers (penalizes high security)
  const moneyWeight = 0.8;     // Scales influence of money
  const securityWeight = 1.2;  // Scales influence of security

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
  // Helper: classify servers as targets or workers
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
    return { targets, workers };
  }

  // -------------------------
  // Helper: rank targets by value / security
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
  // Helper: deploy worker script to remote server
  // -------------------------
  async function deployWorkerScriptTo(w) {
    try {
      if (!ns.fileExists(workerScript, w.host) || forceCopy) {
        await ns.scp(workerScript, w.host, HOME);
      }
    } catch (e) { info(`scp error to ${w.host}: ${e}`); }
  }

  // -------------------------
  // Helper: calculate max threads a worker can run
  // -------------------------
  function threadsForWorker(w) {
    const ramPerThread = ns.getScriptRam(workerScript);
    if (!ramPerThread) return 0;
    const usable = w.isHome
      ? Math.max(0, w.maxRam - reservedRam - w.usedRam)
      : Math.max(0, w.freeRam);
    return Math.floor(usable / ramPerThread);
  }

  // -------------------------
  // Helper: kill existing worker scripts on a host
  // -------------------------
  function killWorkerScriptsOn(host) {
    for (const p of ns.ps(host)) {
      if (p.filename === workerScript) ns.kill(p.pid, host);
    }
  }

  // -------------------------
  // Helper: consolidate worker logs
  // -------------------------
  function consolidateWorkerLogs() {
    try {
      const files = ns.ls(HOME, ".txt").filter(f => f.startsWith("worker-"));
      for (const f of files) {
        const c = ns.read(f);
        if (c) ns.write(`${logDir}worker-summary.txt`, c, "a");
        ns.write(f, "", "w");
      }
    } catch (e) { ns.print("log merge error: " + e); }
  }

  // -------------------------
  // Compute weaken/hack/grow ratios dynamically
  // -------------------------
  function calculateBatchRatio(t) {
    const secDelta = Math.max(0, t.sec - t.minSec);
    const moneyRatio = t.maxMoney > 0 ? t.curMoney / t.maxMoney : 0;

    // Dynamic multipliers
    const weaken = Math.max(1, Math.ceil(secDelta * 3 * securityWeight));      // Security multiplier
    const hack = Math.max(1, Math.ceil(moneyRatio * 10 * moneyWeight));        // Money multiplier
    const grow = Math.max(1, Math.ceil((1 - moneyRatio) * 10 * moneyWeight));  // Money missing multiplier

    return { weaken, hack, grow };
  }

  // -------------------------
  // Helper: assign proportional weights to targets for thread allocation
  // -------------------------
  const targetWeight = t => {
    const moneyFrac = t.curMoney / t.maxMoney;
    const secDelta = t.sec - t.minSec;

    // Weighted calculation: higher money = higher weight, higher security = lower weight
    return (Math.pow(t.maxMoney * moneyFrac, moneyWeight)) / Math.pow(1 + secDelta, securityWeight);
  };

  // -------------------------
  // Helper: build thread allocation plan
  // -------------------------
  function buildThreadPlan(workers, targets) {
    const totalThreads = workers.reduce((s, w) => s + threadsForWorker(w), 0);
    const weights = targets.map(targetWeight);
    const totalW = weights.reduce((a, b) => a + b, 0);
    return targets.map((t, i) => ({
      target: t,
      want: totalThreads * (weights[i] / totalW),
      used: 0
    }));
  }

  // -------------------------
  // Pick the next target that still needs threads
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
  while (true) {
    try {
      const all = scanAll();
      const { targets, workers } = classifyServers(all);
      let ranked = rankTargets(targets);
      if (chaos) ranked = ranked.sort(() => Math.random() - 0.5);

      // -------------------------
      // Select targets
      // -------------------------
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
        } else if (ranked.length) chosen = [ranked[0]];
      }

      // -------------------------
      // Build thread allocation plan
      // -------------------------
      const plan = buildThreadPlan(workers, chosen);

      // -------------------------
      // Assign workers
      // -------------------------
      for (const w of workers.sort((a, b) => b.maxRam - a.maxRam)) {
        await deployWorkerScriptTo(w);
        killWorkerScriptsOn(w.host);

        let availableThreads = threadsForWorker(w);
        if (availableThreads <= 0) continue;

        while (availableThreads > 0) {
          const p = takeNextTarget(plan);
          if (!p) break;
          const threadsToAssign = Math.min(Math.ceil(p.want - p.used), availableThreads);
          if (threadsToAssign <= 0) break;

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

    await ns.sleep(10_000); // Loop every 10s
  }
}

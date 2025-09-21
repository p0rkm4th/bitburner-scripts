/** @param {NS} ns **/
export async function main(ns) {
  const refreshDelay = 600_000; // 10 min
  const secBuffer = 0.05;
  const workerScript = "worker.js";
  const ramMinFraction = 0.65;
  const ramMaxFraction = 0.85;
  const port = 1;

  // --- Network scan ---
  const scanAll = (host = "home", found = new Set()) => {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
    return [...found];
  };
  const allServers = scanAll().filter(s => ns.hasRootAccess(s));

  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");

  // --- Stats trackers ---
  const hostStats = {};
  const leaderboard = {};

  // --- Table setup ---
  const headers = ["Device", "HWGW Cycles", "Smart Threads", "Target", "AvgHack%", "Hacks", "Earned", "Stolen"];
  const lbHeaders = ["Device", "Fav Target", "AvgHack%", "Hacks", "Earned", "Stolen", "Max $/s", "Max Hack/sec"];
  let widths = headers.map(h => h.length);
  let lbWidths = lbHeaders.map(h => h.length);

  const formatRow = (values, w) => "║ " + values.map((v, i) => String(v).padEnd(w[i])).join(" ║ ") + " ║";
  const makeDivider = (w, char = "═", junction = "╬") => "╠" + w.map(w => char.repeat(w + 2)).join(junction) + "╣";

  // --- Spawn workers ---
  const spawnWorkers = () => {
    for (const host of allServers) {
      if (host !== "home" && !ns.fileExists(workerScript, host)) ns.scp(workerScript, host);
      const maxRam = ns.getServerMaxRam(host);
      const usedRam = ns.getServerUsedRam(host);
      let freeRam = maxRam - usedRam;
      const threads = Math.floor(Math.min(freeRam, maxRam * ramMaxFraction) / ns.getScriptRam(workerScript));
      if (threads < 1) continue;
      if (!ns.scriptRunning(workerScript, host)) ns.exec(workerScript, host, threads, port);
    }
  };

  // --- Table printer ---
  const printTable = (title, stats, isLeaderboard = false) => {
    const w = isLeaderboard ? lbWidths : widths;
    const totalWidth = w.reduce((a, b) => a + b, 0) + (3 * w.length);
    const padding = Math.floor((totalWidth - title.length) / 2);
    const extra = totalWidth - title.length - padding;

    ns.tprint("╔" + "═".repeat(totalWidth) + "╗");
    ns.tprint("║" + " ".repeat(padding) + "\x1b[38;2;0;255;255m" + title + "\x1b[0m" + " ".repeat(extra) + "║");
    ns.tprint("╚" + "═".repeat(totalWidth) + "╝");

    ns.tprint("╔" + w.map(w => "═".repeat(w + 2)).join("╦") + "╗");
    const headersRow = isLeaderboard ? lbHeaders : headers;
    ns.tprint(formatRow(headersRow.map(h => "\x1b[38;2;255;0;255m" + h + "\x1b[0m"), w));
    ns.tprint(makeDivider(w));

    for (const host of allServers) {
      if (!stats[host]) continue;
      const s = stats[host];

      if (isLeaderboard) {
        const maxPerSec = s.earned; // placeholder for advanced $/s calculation
        const maxHackSec = s.hacks; // placeholder for advanced hack/sec
        ns.tprint(formatRow([
          host,
          s.lastTarget || "",
          ((s.avgChance || 0) * 100).toFixed(1) + "%",
          s.hacks || 0,
          "$" + ns.formatNumber(s.earned || 0),
          "$" + ns.formatNumber(s.stolen || 0),
          "$" + ns.formatNumber(maxPerSec),
          maxHackSec
        ], w));
      } else {
        ns.tprint(formatRow([
          host,
          s.cycles || 0,
          s.smart || 0,
          s.lastTarget || "",
          ((s.avgChance || 0) * 100).toFixed(1) + "%",
          s.hacks || 0,
          "$" + ns.formatNumber(s.earned || 0),
          "$" + ns.formatNumber(s.stolen || 0)
        ], w));
      }
    }

    ns.tprint("╚" + w.map(w => "═".repeat(w + 2)).join("╩") + "╝");
  };

  // --- Main loop ---
  while (true) {
    spawnWorkers();

    const playerHack = ns.getHackingLevel();
    const hackable = allServers.filter(s => ns.getServerMaxMoney(s) > 0 && ns.getServerRequiredHackingLevel(s) <= playerHack);
    if (!hackable.length) { await ns.sleep(refreshDelay); continue; }

    const target = hackable.map(s => {
      const money = ns.getServerMoneyAvailable(s);
      const chance = ns.hackAnalyzeChance(s);
      const cycleTime = (ns.getHackTime(s) + ns.getWeakenTime(s) + ns.getGrowTime(s) + ns.getWeakenTime(s)) / 1000;
      return { s, score: money * chance / cycleTime };
    }).sort((a, b) => b.score - a.score)[0].s;

    const minSec = ns.getServerMinSecurityLevel(target);

    // --- Allocate threads dynamically ---
    for (const host of allServers) {
      const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      const threadsToUse = Math.floor(Math.min(freeRam, ns.getServerMaxRam(host) * ramMaxFraction) / ns.getScriptRam(workerScript));
      if (threadsToUse < 1) continue;

      let cycles = 0, smartThreads = 0;
      for (let i = 0; i < threadsToUse; i++) {
        const curSec = ns.getServerSecurityLevel(target);
        const curMoney = ns.getServerMoneyAvailable(target);
        let action = "hack";
        if (curSec > minSec * (1 + secBuffer)) action = "weaken";
        else if (curMoney < ns.getServerMaxMoney(target) * 0.8) action = "grow";

        const job = { target, action, delay: Math.random() * 500 };
        ns.writePort(port, JSON.stringify(job));
        cycles++; smartThreads++;
      }

      if (!hostStats[host]) hostStats[host] = { cycles: 0, smart: 0, hacks: 0, earned: 0, stolen: 0, lastTarget: "", avgChance: 0 };
      hostStats[host].cycles += cycles;
      hostStats[host].smart += smartThreads;
      hostStats[host].lastTarget = target;
      hostStats[host].avgChance = ns.hackAnalyzeChance(target);
      hostStats[host].hacks += cycles;
      hostStats[host].earned += ns.hackAnalyze(target) * ns.getServerMoneyAvailable(target) * cycles;
      hostStats[host].stolen += ns.getServerMaxMoney(target) * ns.hackAnalyze(target) * cycles;

      if (!leaderboard[host]) leaderboard[host] = { hacks: 0, earned: 0, stolen: 0, lastTarget: "", avgChance: 0 };
      leaderboard[host].hacks += cycles;
      leaderboard[host].earned += ns.hackAnalyze(target) * ns.getServerMoneyAvailable(target) * cycles;
      leaderboard[host].stolen += ns.getServerMaxMoney(target) * ns.hackAnalyze(target) * cycles;
      leaderboard[host].lastTarget = target;
      leaderboard[host].avgChance = ns.hackAnalyzeChance(target);

      const values = [
        host,
        hostStats[host].cycles,
        hostStats[host].smart,
        hostStats[host].lastTarget,
        (hostStats[host].avgChance * 100).toFixed(1) + "%",
        hostStats[host].hacks,
        "$" + ns.formatNumber(hostStats[host].earned),
        "$" + ns.formatNumber(hostStats[host].stolen)
      ];
      widths = widths.map((w, i) => Math.max(w, String(values[i]).length));
    }

    ns.clearLog();
    printTable("NETWATCH 2077", hostStats);
    printTable("LEADERBOARD", leaderboard);

    await ns.sleep(refreshDelay);
  }
}

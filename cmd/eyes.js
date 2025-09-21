/** @param {NS} ns */
export async function main(ns) {
  // --- Utilities ----------------------------------------------------------

  function scanAll(host = "home", found = new Set()) {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
    return [...found];
  }

  function bar(value, length = 12, colors = ["\x1b[90m", "\x1b[95m"]) {
    // Normalize to [0,1] and handle NaN
    let v = Number.isFinite(value) ? value : 0;
    v = Math.max(0, Math.min(1, v));

    const filled = Math.round(v * length);
    const empty = Math.max(0, length - filled);

    return (
      colors[1] + "█".repeat(filled) +
      colors[0] + "░".repeat(empty) +
      "\x1b[0m"
    );
  }

  function colorScale(value, type) {
    if (type === "sec") {
      if (value < 0.3) return ["\x1b[90m", "\x1b[92m"];
      if (value < 0.7) return ["\x1b[90m", "\x1b[93m"];
      return ["\x1b[90m", "\x1b[91m"];
    }
    if (type === "money") {
      if (value < 0.3) return ["\x1b[90m", "\x1b[91m"];
      if (value < 0.7) return ["\x1b[90m", "\x1b[93m"];
      return ["\x1b[90m", "\x1b[92m"];
    }
    if (type === "ram") return ["\x1b[90m", "\x1b[95m"];
    if (type === "mps") {
      if (value < 0.3) return ["\x1b[90m", "\x1b[91m"];
      if (value < 0.7) return ["\x1b[90m", "\x1b[93m"];
      return ["\x1b[90m", "\x1b[92m"];
    }
    if (type === "canHack")
      return value ? ["\x1b[90m", "\x1b[95m"] : ["\x1b[90m", "\x1b[90m"];
    return ["\x1b[90m", "\x1b[37m"];
  }

  function padColumn(text, width) {
    const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
    return text + " ".repeat(Math.max(0, width - stripped.length));
  }

  // --- Data collection ----------------------------------------------------

  const playerHack = ns.getHackingLevel();
  const hosts = scanAll().filter(
    (h) => ns.hasRootAccess(h) && h !== "home" && !h.startsWith("hades.")
  );

  const serverData = hosts.map((host) => {
    const sec = ns.getServerSecurityLevel(host);
    const minSec = ns.getServerMinSecurityLevel(host);
    const money = ns.getServerMoneyAvailable(host);
    const maxMoney = ns.getServerMaxMoney(host);
    const usedRam = ns.getServerUsedRam(host);
    const maxRam = ns.getServerMaxRam(host);
    const hackTime = ns.getHackTime(host);
    const moneyPerSec = hackTime > 0 ? money / (hackTime / 1000) : 0;
    const primeTarget =
      (sec - minSec) / Math.max(1, minSec) < 0.3 &&
      moneyPerSec / 1e6 > 0.5;
    const canHack = playerHack >= ns.getServerRequiredHackingLevel(host);

    return {
      host,
      sec,
      minSec,
      money,
      maxMoney,
      usedRam,
      maxRam,
      moneyPerSec,
      primeTarget,
      canHack,
    };
  });

  serverData.sort((a, b) => b.moneyPerSec - a.moneyPerSec);
  const maxMps = Math.max(...serverData.map((s) => s.moneyPerSec), 1);

  // --- Layout -------------------------------------------------------------

  const hostW = 20,
    secW = 32,
    moneyW = 38,
    mpsW = 28,
    ramW = 38,
    hackW = 12;
  const totalWidth = hostW + secW + moneyW + mpsW + ramW + hackW + 30;
  const horizontalBar = "═".repeat(totalWidth);

  ns.tprint(`\x1b[95m${horizontalBar}\x1b[0m`);
  ns.tprint(
    `\x1b[95m${"HOST".padEnd(hostW)} | ${"SECURITY".padEnd(
      secW
    )} | ${"MONEY".padEnd(moneyW)} | ${"MONEY/sec".padEnd(
      mpsW
    )} | ${"RAM".padEnd(ramW)} | ${"CAN HACK?".padEnd(hackW)}\x1b[0m`
  );

  // --- Render each row ----------------------------------------------------

  for (const s of serverData) {
    // Clamp all scale values to [0,1]
    const secScale = Math.max(
      0,
      Math.min(1, (s.sec - s.minSec) / Math.max(1, 30 - s.minSec))
    );
    const moneyScale =
      s.maxMoney > 0 ? Math.max(0, Math.min(1, s.money / s.maxMoney)) : 0;
    const ramScale =
      s.maxRam > 0 ? Math.max(0, Math.min(1, s.usedRam / s.maxRam)) : 0;
    const mpsScale = Math.max(
      0,
      Math.min(1, s.moneyPerSec / Math.max(1, maxMps))
    );

    const secBar = bar(secScale, 12, colorScale(secScale, "sec"));
    const moneyBar = bar(moneyScale, 12, colorScale(moneyScale, "money"));
    const ramBar = bar(ramScale, 12, colorScale(ramScale, "ram"));
    const mpsBar = bar(mpsScale, 12, colorScale(mpsScale, "mps"));
    const hackBar = bar(s.canHack ? 1 : 0, 12, colorScale(s.canHack, "canHack"));

    const hostPrefix = s.primeTarget ? "\x1b[96m★ " : "\x1b[95m  ";

    const secColumn = padColumn(
      `SEC: ${secBar} \x1b[37m(${s.sec.toFixed(2)}/${s.minSec.toFixed(2)})\x1b[0m`,
      secW
    );

    const moneyDisplay =
      s.maxMoney >= 1e6
        ? `${(s.money / 1e6).toFixed(2)}M`
        : `${(s.money / 1000).toFixed(1)}K`;
    const maxMoneyDisplay =
      s.maxMoney >= 1e6
        ? `${(s.maxMoney / 1e6).toFixed(2)}M`
        : `${(s.maxMoney / 1000).toFixed(1)}K`;
    const moneyColumn = padColumn(
      `$${moneyDisplay} ${moneyBar} \x1b[37m(${maxMoneyDisplay})\x1b[0m`,
      moneyW
    );

    const mpsK = (s.moneyPerSec / 1000).toFixed(1);
    const mpsColumn = padColumn(
      `$${mpsK}K ${mpsBar} \x1b[37m/sec\x1b[0m`,
      mpsW
    );

    const ramColumn = padColumn(
      `RAM: ${s.usedRam.toFixed(2)}GB ${ramBar} \x1b[37m(${s.maxRam.toFixed(
        2
      )}GB)\x1b[0m`,
      ramW
    );
    const hackColumn = padColumn(
      `${s.canHack ? "\x1b[95m✔\x1b[0m" : "\x1b[90m✘\x1b[0m"}`,
      hackW
    );

    ns.tprint(
      `${hostPrefix}${s.host.padEnd(hostW - 2)} | ${secColumn} | ${moneyColumn} | ${mpsColumn} | ${ramColumn} | ${hackColumn}`
    );
  }

  ns.tprint(`\x1b[95m${horizontalBar}\x1b[0m`);
}

/** @param {NS} ns */
export async function main(ns) {
  const targets = scanAll().filter(s => ns.hasRootAccess(s) &&
    ns.getServerMaxMoney(s) > 0);
  if (targets.length === 0) { ns.tprint("No valid targets found"); return; }

  // Finding all servers
  function scanAll(host = "home", found = new Set()) {
    found.add(host);
    for (const next of ns.scan(host)) if (!found.has(next))
      scanAll(next, found);
    return [...found];
  }

  // Deploy to r-kitted servers
  for (const host of scanAll()) {
    if (!ns.hasRootAccess(host)) continue;
    if (host !== "home") await ns.scp(ns.getScriptName(), host);

    const free = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
    const ramPerThread = ns.getScriptRam(ns.getScriptName());
    const threads = Math.floor(free / ramPerThread);
    if (threads > 0) ns.exec(ns.getScriptName(), host, threads, ...targets);
  }

  // Worker loop (1/per host)
  while (true) {
    for (const t of targets) {
      await ns.weaken(t);
      await ns.weaken(t);
      await ns.grow(t);
      await ns.grow(t);
      await ns.hack(t);
    }
  }
}
/** @param {NS} ns */
export function installBackdoors(ns) {
  const playerHack = ns.getHackingLevel();  // Your current hacking level
  const allServers = scanAll(ns);

  for (const s of allServers) {
    const server = ns.getServer(s);

    // Only attempt on rooted servers without a backdoor AND with required hacking level <= player
    if (ns.hasRootAccess(s) && !server.backdoorInstalled && server.requiredHackingLevel <= playerHack) {
      try {
        ns.connect(s);
        ns.installBackdoor();
        ns.tprint(`Backdoor installed on ${s}`);
      } catch (e) {
        ns.tprint(`Failed to backdoor ${s}: ${e}`);
      }
    }
  }

  function scanAll(ns, host = "home", found = new Set()) {
    found.add(host);
    for (const n of ns.scan(host)) if (!found.has(n)) scanAll(ns, n, found);
    return [...found];
  }
}

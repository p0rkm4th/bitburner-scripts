/** @param {NS} ns **/
export async function main(ns) {
  // Open a tail window so you can watch logs (new API)
  // ns.ui.openTail();

  const HOME = "home";
  const myHackLevel = ns.getHackingLevel();
  const purchased = new Set(ns.getPurchasedServers());

  // 1️⃣ Servers you want to prioritize (order matters)
  const priorityList = [
    "CSEC",            // CyberSec faction
    "avmnite-02h",     // NiteSec
    "I.I.I.I",         // The Black Hand
    "run4theh111z",    // BitRunners
    "w0r1d_d43m0n"     // Endgame
  ];

  // ---- Scan whole network (DFS) ----
  function scanAll(start = HOME) {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      for (const n of ns.scan(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return Array.from(seen);
  }

  // ---- Collect servers eligible for backdoor ----
  const allServers = scanAll();
  const candidates = [];
  for (const host of allServers) {
    if (host === HOME) continue;
    if (purchased.has(host)) continue;
    if (!ns.hasRootAccess(host)) continue;
    if (ns.getServerRequiredHackingLevel(host) > myHackLevel) continue;

    let installed = false;
    try {
      installed = ns.getServer(host)?.backdoorInstalled || false;
    } catch { installed = false; }
    if (installed) continue;

    candidates.push(host);
  }

  if (candidates.length === 0) {
    ns.tprint("No backdoor-eligible servers found.");
    return;
  }

  // ---- Sort: priority list first, then alphabetical ----
  candidates.sort((a, b) => {
    const ia = priorityList.indexOf(a);
    const ib = priorityList.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib; // both priority
    if (ia !== -1) return -1;                   // a priority only
    if (ib !== -1) return 1;                    // b priority only
    return a.localeCompare(b);                  // fallback alpha
  });

  const target = candidates[0];
  ns.tprint(`Top candidate: ${target}`);

  // ---- Find path (BFS) from home to target ----
  function findPath(start, goal) {
    if (start === goal) return [start];
    const q = [start];
    const parent = new Map([[start, null]]);
    while (q.length) {
      const cur = q.shift();
      for (const n of ns.scan(cur)) {
        if (!parent.has(n)) {
          parent.set(n, cur);
          if (n === goal) {
            const path = [];
            for (let x = goal; x; x = parent.get(x)) path.push(x);
            return path.reverse();
          }
          q.push(n);
        }
      }
    }
    return null;
  }

  const path = findPath(HOME, target);
  if (!path) {
    ns.tprint(`Couldn't find path to ${target}`);
    return;
  }

  // ---- Build terminal command ----
  // Format: "home; connect A; connect B; ...; backdoor"
  const pieces = path.map((node, idx) =>
    idx === 0 ? "home" : `connect ${node}`
  );
  pieces.push("backdoor");
  const command = pieces.join("; ");

  ns.tprint("Copy & paste this in the terminal: \n");
  ns.tprint(command);
}

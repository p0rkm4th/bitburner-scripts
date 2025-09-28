/** @param {NS} ns */
export async function main(ns) {
  /**
   * Auto-backdoor with custom prioritization:
   * 1) w0r1d_d43m0n (if eligible)
   * 2) factionPriority list (in order you prefer — late-game first)
   * 3) remaining eligible servers, sorted by path-length from home (closest first)
   *
   * Behavior:
   *  - Runs virus() to open ports & nuke reachable servers (best-effort).
   *  - Builds candidates: exclude "home" & purchased servers; require root & hacking level;
   *    skip servers already backdoored.
   *  - Ensures each attempt starts from "home", builds BFS path from home -> target,
   *    then sends a single chained command: "connect a;connect b;...;backdoor"
   *  - Polls for backdoorInstalled with a reasonable timeout.
   *
   * Edit the `factionPriority` array below to match exact servers you want prioritized.
   */

  // ---------------- CONFIG ----------------
  const CONNECT_DEADLINE_MS = 5000;     // max time to reach the target after sending connect chain
  const POST_BACKDOOR_BUFFER_MS = 2000;  // extra buffer added to (hackTime/4)
  const POLL_INTERVAL_MS = 175;          // polling interval for hostname/backdoor checks
  // ----------------------------------------

  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();

  // --- Editable priority list: put late-game faction servers earlier in this array.
  // Replace/add/remove hostnames to match your preferred faction-target order.
  const factionPriority = [
    // Example late-game faction servers (edit as you prefer)
    "I.I.I.I",            // example (often Black Hand / late)
    "avmnite-02h",        // example (Fulcrum / late)
    "run4theh111z",
    "fulcrumassets",
    "powerhouse-fitness",
    "CSEC"               // CyberSec / earlier
    // Add or reorder servers as you want — any server names not present here will be processed later by distance.
  ];

  // Attempt to open ports & nuke reachable servers (increases chance of root)
  virus(ns);

  // Small pause to let nuke effects settle
  await ns.sleep(150);

  // Gather all servers reachable from home
  const allServers = getServersFull(ns);
  const purchased = ns.getPurchasedServers();

  // Build candidate list:
  // - Not home
  // - Not purchased server
  // - Not already backdoored
  // - Have root access
  // - Player hacking level >= server required hacking level
  let candidates = allServers.filter(s => {
    if (s === "home") return false;
    if (purchased.includes(s)) return false;
    try {
      const srv = ns.getServer(s);
      if (!srv) return false;
      if (srv.backdoorInstalled) return false;   // skip servers already backdoored
      if (!ns.hasRootAccess(s)) return false;    // need root to install backdoor
      if (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(s)) return false; // need hacking level
      return true;
    } catch (e) {
      return false;
    }
  });

  // Optionally include the world daemon early (if eligible)
  try {
    const special = "w0r1d_d43m0n";
    if (allServers.includes(special) &&
        !purchased.includes(special) &&
        ns.getServer(special) &&
        !ns.getServer(special).backdoorInstalled &&
        ns.hasRootAccess(special) &&
        ns.getHackingLevel() >= ns.getServerRequiredHackingLevel(special)) {
      // Ensure it's in candidates (if not already)
      if (!candidates.includes(special)) candidates.push(special);
    }
  } catch (e) {
    // ignore
  }

  // Build prioritized list:
  // 1) special world daemon (we already ensured it is present in candidates if eligible)
  // 2) factionPriority (in the given order) — include only those present in candidates
  // 3) remaining candidates sorted by path-length from home (shortest first)
  const prioritized = [];
  const used = new Set();

  // add world daemon first if present
  if (candidates.includes("w0r1d_d43m0n")) {
    prioritized.push("w0r1d_d43m0n");
    used.add("w0r1d_d43m0n");
  }

  // add faction-priority entries in order, if they are eligible
  for (const s of factionPriority) {
    if (candidates.includes(s) && !used.has(s)) {
      prioritized.push(s);
      used.add(s);
    }
  }

  // Now compute path-lengths for the remaining candidates (cache paths to avoid repeated BFS)
  const pathsCache = {}; // hostname -> path array or null
  function cachedPath(h) {
    if (pathsCache[h] !== undefined) return pathsCache[h];
    const p = findPath(ns, "home", h);
    pathsCache[h] = p;
    return p;
  }

  const remaining = candidates.filter(s => !used.has(s));

  // compute numeric path length (hops) for sorting. If no path, treat as Infinity (will go to end)
  const remainingWithLen = remaining.map(s => {
    const p = cachedPath(s);
    const len = Array.isArray(p) ? (p.length - 1) : Infinity; // hops count
    return { host: s, path: p, len };
  });

  // sort by path length ascending (closest first). Tie-break on hackTime estimate optionally.
  remainingWithLen.sort((a, b) => {
    if (a.len !== b.len) return a.len - b.len;
    // tie-break by estimated backdoor time (shorter first)
    const aEst = ns.getHackTime(a.host) / 4 + POST_BACKDOOR_BUFFER_MS;
    const bEst = ns.getHackTime(b.host) / 4 + POST_BACKDOOR_BUFFER_MS;
    return aEst - bEst;
  });

  // append remaining hosts in order
  for (const r of remainingWithLen) {
    prioritized.push(r.host);
    used.add(r.host);
  }

  // Final target list
  const targets = prioritized;

  // If nothing to do, inform and exit
  if (targets.length === 0) {
    ns.tprint("No eligible targets found (either already backdoored, purchased, no root, or hacking level too low).");
    return;
  }

  ns.print("Stay on the terminal page or the script will fail!");
  ns.printf("Targets (in priority order): %s", targets.length);

  // Print a small summary (first few targets)
  ns.printf("First targets: %s", targets.slice(0, 12).join(", "));

  // Compute ETA sum for display
  let eta = 0;
  for (const s of targets) eta += (ns.getHackTime(s) / 4) + POST_BACKDOOR_BUFFER_MS;
  if (ns.ui.getGameInfo()?.versionNumber >= 44) ns.printf("ETA: %s", ns.format.time(eta), 3);
  else ns.printf("ETA: %s", ns.tFormat(eta), 3);

  // --- Process each target in order ---
  for (const target of targets) {
    ns.printf("Processing: %s", target);

    // Ensure at home
    terminal("home");
    const homeStart = Date.now();
    while (Date.now() - homeStart < CONNECT_DEADLINE_MS) {
      if (ns.getHostname() === "home") break;
      await ns.sleep(POLL_INTERVAL_MS);
    }
    if (ns.getHostname() !== "home") {
      ns.printf("Warning: couldn't return to home before connecting to %s; current host: %s", target, ns.getHostname());
      // proceed anyway — path computed from home
    }

    // Compute path (use cached result if we computed earlier)
    const path = cachedPath(target) || findPath(ns, "home", target);
    if (!path || path.length < 2) {
      ns.print(`Could not find path to ${target} from home, skipping.`);
      continue;
    }

    // Build single chained connect + backdoor command
    const hops = path.slice(1);
    const connectChain = "connect " + hops.join(";connect ");
    const fullChain = `${connectChain};backdoor`;

    ns.printf("Sending chained command: %s", fullChain);
    terminal(fullChain);

    // Wait until we are on the target (or timeout)
    const connectStart = Date.now();
    let reached = false;
    while (Date.now() - connectStart < CONNECT_DEADLINE_MS) {
      if (ns.getHostname() === target) {
        reached = true;
        break;
      }
      await ns.sleep(Math.max(50, POLL_INTERVAL_MS / 2));
    }
    if (!reached) {
      ns.printf("Warning: did not reach %s within timeout (current host: %s). Still polling for backdoor state.", target, ns.getHostname());
    }

    // Poll for backdoorInstalled with timeout based on hackTime estimate (min 5s)
    const perTargetWait = Math.max(5000, (ns.getHackTime(target) / 4) + POST_BACKDOOR_BUFFER_MS);
    const backdoorStart = Date.now();
    let success = false;
    while (Date.now() - backdoorStart < perTargetWait) {
      try {
        const srv = ns.getServer(target);
        if (srv && srv.backdoorInstalled) {
          success = true;
          break;
        }
      } catch (e) {
        // ignore transient errors
      }
      await ns.sleep(POLL_INTERVAL_MS);
    }

    if (success) {
      ns.printf("Backdoored: %s", target);
    } else {
      ns.printf("Failed/Timed out backdoor on %s (ensure root & hacking level).", target);
    }

    // Small pause, return to home, ensure we've returned
    await ns.sleep(200);
    terminal("home");
    const afterReturnStart = Date.now();
    while (Date.now() - afterReturnStart < 2000) {
      if (ns.getHostname() === "home") break;
      await ns.sleep(100);
    }
  }

  // Done: ensure at home
  terminal("home");
  ns.printf("All done.");
}

/* -------------------------
   Helper / Utility functions
   ------------------------- */

function terminal(text) {
  // Injects a single command string into Bitburner's terminal input and "presses Enter".
  const input = eval("document").getElementById('terminal-input');
  const handler = Object.keys(input)[1];
  input[handler].onChange({ target: { value: text } });
  input[handler].onKeyDown({ key: 'Enter', preventDefault: () => null });
}

function virus(ns) {
  // Attempts all port-opening programs then nukes every reachable server (best-effort).
  const servers = getServersFull(ns);
  for (const server of servers) {
    try { ns.brutessh(server); } catch (e) { }
    try { ns.ftpcrack(server); } catch (e) { }
    try { ns.relaysmtp(server); } catch (e) { }
    try { ns.httpworm(server); } catch (e) { }
    try { ns.sqlinject(server); } catch (e) { }
    try { ns.nuke(server); } catch (e) { }
  }
}

function getServersFull(ns) {
  // BFS from "home" returning all reachable hostnames.
  const visited = new Set(["home"]);
  const queue = ["home"];
  while (queue.length > 0) {
    const host = queue.shift();
    const neighbors = ns.scan(host);
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return Array.from(visited);
}

function findPath(ns, start, target) {
  // BFS pathfinder that returns array [start,...,target] or null if unreachable.
  if (start === target) return [start];
  const visited = new Set([start]);
  const queue = [{ host: start, path: [start] }];
  while (queue.length > 0) {
    const { host, path } = queue.shift();
    const neighbors = ns.scan(host);
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      const newPath = path.concat([n]);
      if (n === target) return newPath;
      visited.add(n);
      queue.push({ host: n, path: newPath });
    }
  }
  return null;
}

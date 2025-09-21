/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("scan");
  ns.disableLog("rm");
  ns.disableLog("scp");
  ns.disableLog("ls");
  ns.disableLog("fileExists");
  ns.disableLog("write");

  const HOME = "home";

  // Scan all servers reachable from HOME
  function scanAll() {
    const seen = new Set();
    const queue = [HOME];
    seen.add(HOME);

    let idx = 0;
    while (idx < queue.length) {
      const cur = queue[idx++];
      try {
        const neighbors = ns.scan(cur);
        for (const n of neighbors) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      } catch { }
    }
    return Array.from(seen);
  }

  const allServers = scanAll();

  for (const server of allServers) {
    if (server === HOME) continue; // Skip home entirely

    const serverObj = ns.getServer(server);

    // Only consider servers we have root access to
    if (!serverObj.hasAdminRights) continue;

    // List all files
    const files = ns.ls(server);

    // Remove every file except /logs folder files
    for (const file of files) {
      //if (!file.startsWith("logs") && !file.startsWith("/logs/")) {
        ns.rm(file, server);
      //}
    }

    // Ensure /logs/ exists
    const logPlaceholder = "/logs/placeholder.txt";
    if (!ns.fileExists(logPlaceholder, server)) {
      await ns.write(logPlaceholder, "", "w"); // creates /logs/ folder
    }

    ns.print(`Cleared server ${server} and ensured /logs/ exists.`);
  }

  ns.tprint("Cleanup complete on all servers with root access (home skipped).");
}

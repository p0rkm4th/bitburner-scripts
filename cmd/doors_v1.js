/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("scan");
    ns.disableLog("getServerRequiredHackingLevel");

    const personalServers = new Set(["home", "sam", "dean", "cas"]);

    // ANSI codes for colors
    const GREEN = "\x1b[32m";
    const BRIGHT = "\x1b[1m";
    const RESET = "\x1b[0m";

    // BFS to find shortest path from home to target
    function findPath(target) {
        let queue = [["home"]];
        let visited = new Set(["home"]);

        while (queue.length > 0) {
            let path = queue.shift();
            let node = path[path.length - 1];

            if (node === target) return path;

            for (const neighbor of ns.scan(node)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }
        return null;
    }

    // Recursive scan to get all servers
    const allServers = (() => {
        let visited = new Set();
        function scanNetwork(host) {
            visited.add(host);
            for (const neighbor of ns.scan(host)) {
                if (!visited.has(neighbor)) scanNetwork(neighbor);
            }
        }
        scanNetwork("home");
        return visited;
    })();

    const myHackLevel = ns.getHackingLevel();

    ns.tprint(`${GREEN}${BRIGHT}[BACKDOOR SCAN INITIATED]${RESET}`);

    for (const server of allServers) {
        if (personalServers.has(server)) continue;       // Skip personal servers
        if (!ns.hasRootAccess(server)) continue;         // Skip servers without root

        const srv = ns.getServer(server);

        // Only show backdoorable servers
        if (!srv.backdoorInstalled && myHackLevel >= srv.requiredHackingSkill) {
            const path = findPath(server);
            if (path) {
                ns.tprint(`${GREEN}[READY]${RESET} ${BRIGHT}${server}${RESET} (HL: ${srv.requiredHackingSkill})`);

                // ASCII network path with target highlighted
                let tree = "";
                for (let i = 0; i < path.length; i++) {
                    const prefix = i === path.length - 1 ? "└─ " : "├─ ";
                    const nodeName = i === path.length - 1 ? `${GREEN}${BRIGHT}${path[i]}${RESET}` : path[i];
                    tree += `${"│  ".repeat(i)}${prefix}${nodeName}\n`;
                }
                ns.tprint(tree.trim());
            }
        }
    }

    ns.tprint(`${GREEN}${BRIGHT}[BACKDOOR SCAN COMPLETE]${RESET}`);
}

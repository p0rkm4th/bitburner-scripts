/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("scan");
    ns.disableLog("getServerNumPortsRequired");
    ns.disableLog("brutessh");
    ns.disableLog("ftpcrack");
    ns.disableLog("httpworm");
    ns.disableLog("sqlinject");
    ns.disableLog("nuke");

    const PURPLE = "\x1b[35m";      // Main color
    const MAGENTA = "\x1b[95m";     // Highlight color
    const RESET = "\x1b[0m";
    const BRIGHT = "\x1b[1m";

    function scanNetwork(host, visited = new Set()) {
        visited.add(host);
        const neighbors = ns.scan(host);
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) scanNetwork(neighbor, visited);
        }
        return visited;
    }

    const allServers = scanNetwork("home");

    ns.tprint(`${PURPLE}${BRIGHT}[AUTO-NUKE INITIATED]${RESET}`);

    for (const server of allServers) {
        if (ns.hasRootAccess(server)) continue;

        const portsNeeded = ns.getServerNumPortsRequired(server);

        let portsOpened = 0;
        if (ns.fileExists("BruteSSH.exe", "home")) { ns.brutessh(server); portsOpened++; }
        if (ns.fileExists("FTPCrack.exe", "home")) { ns.ftpcrack(server); portsOpened++; }
        if (ns.fileExists("relaySMTP.exe", "home")) { ns.relaysmtp(server); portsOpened++; }
        if (ns.fileExists("HTTPWorm.exe", "home")) { ns.httpworm(server); portsOpened++; }
        if (ns.fileExists("SQLInject.exe", "home")) { ns.sqlinject(server); portsOpened++; }

        if (portsOpened >= portsNeeded) {
            ns.nuke(server);
            ns.tprint(`${MAGENTA}[HACKED]${RESET} Server: ${BRIGHT}${server}${RESET} Ports: ${portsOpened}/${portsNeeded}`);
        } else {
            ns.tprint(`${PURPLE}[SKIP]${RESET} Server: ${server} - Ports: ${portsOpened}/${portsNeeded}`);
        }

        await ns.sleep(100); // tiny delay for scanning effect
    }

    ns.tprint(`${PURPLE}${BRIGHT}[AUTO-NUKE COMPLETE]${RESET}`);
}

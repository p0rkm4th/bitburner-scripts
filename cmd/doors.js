/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("scan");
    ns.disableLog("getServerRequiredHackingLevel");
    ns.disableLog("scp");
    ns.disableLog("exec");

    // Personal servers (home + purchased)
    const personalServers = new Set(["home", ...ns.getPurchasedServers()]);

    // ANSI colors for terminal output
    const GREEN = "\x1b[32m";
    const BRIGHT = "\x1b[1m";
    const RESET = "\x1b[0m";

    // Flag to enable automatic backdoor installation
    const enableBackdoor = ns.args.includes("--enable");

    // -------------------------
    // Scan network recursively
    // -------------------------
    function scanAll(host = "home", visited = new Set()) {
        visited.add(host);
        for (const neighbor of ns.scan(host)) {
            if (!visited.has(neighbor)) scanAll(neighbor, visited);
        }
        return visited;
    }

    const allServers = scanAll();
    const myHackLevel = ns.getHackingLevel();

    ns.tprint(`${GREEN}${BRIGHT}[BACKDOOR SCAN INITIATED]${RESET}`);

    // -------------------------
    // Optional: helper script content for backdoor installation
    // -------------------------
    const helperScriptName = "installBackdoorHelper.js";
    const helperScriptContent = `
    /** @param {NS} ns **/
    export async function main(ns) {
        if (!ns.getServer().backdoorInstalled) {
            await ns.installBackdoor();
            ns.tprint('Backdoor installed on ' + ns.getHostname());
        }
    }`;

    // Optionally create the helper script on home if it doesn't exist
    if (enableBackdoor && !ns.fileExists(helperScriptName, "home")) {
        await ns.write(helperScriptName, helperScriptContent, "w");
    }

    // -------------------------
    // Iterate through all servers
    // -------------------------
    for (const server of allServers) {
        if (personalServers.has(server)) continue;          // skip personal servers
        if (!ns.hasRootAccess(server)) continue;            // skip servers without root

        const srv = ns.getServer(server);
        if (srv.backdoorInstalled) continue;                // skip if already backdoored
        if (myHackLevel < srv.requiredHackingSkill) continue; // skip if hacking level too low

        ns.tprint(`${GREEN}[READY]${RESET} ${BRIGHT}${server}${RESET} (HL: ${srv.requiredHackingSkill})`);

        // -------------------------
        // Optional backdoor installation
        // -------------------------
        if (enableBackdoor) {
            // Copy helper script to target
            await ns.scp(helperScriptName, server);

            // Execute helper script remotely
            ns.exec(helperScriptName, server);
            ns.tprint(`${GREEN}[BACKDOOR INITIATED]${RESET} ${server}`);
        }
    }

    ns.tprint(`${GREEN}${BRIGHT}[BACKDOOR SCAN COMPLETE]${RESET}`);
}

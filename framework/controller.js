/** @param {NS} ns */
import { scanAllHosts } from "/framework/utils.js";
import { selectTargets } from "/framework/targetManager.js";
import { getFreeThreads } from "/framework/ramManager.js";
import { planHWGWCycles } from "/framework/batchPlanner.js";
import { nukeAvailable } from "/framework/nukeManager.js";


export async function main(ns) {
    // --- INITIAL CLEANUP ---
    const allHosts = scanAllHosts(ns);
    for (const host of allHosts) {
        if (ns.hasRootAccess(host)) {
            ns.killall(host);
            ns.tprint(`Killed all scripts on ${host}`);
        }
    }

    ns.tprint("All hosts cleared, starting HWGW cycles...");

    while (true) {
        // --- Nuke any hackable servers if needed ---
        await nukeAvailable(ns);

        // --- Select targets dynamically (single or multi) ---
        const targets = selectTargets(ns);

        // --- Get free threads per host ---
        const freeThreadsMap = getFreeThreads(ns);

        // --- Plan and dispatch HWGW cycles ---
        await planHWGWCycles(ns, targets, freeThreadsMap);

        await ns.sleep(5 * 60 * 1000); // Refresh every 5 minutes
    }
}

import { scanAll } from "/framework/utils.js";

/** @param {NS} ns */
export function selectTargets(ns, playerHack) {
    const hosts = scanAll(ns);
    const hackable = hosts.filter(h =>
        ns.hasRootAccess(h) &&
        ns.getServerMaxMoney(h) > 0 &&
        ns.getServerRequiredHackingLevel(h) <= playerHack
    );

    if (!hackable.length) return [];

    // Example: return all hackable or top server
    return hackable; // Multiple targets
    // return [hackable.sort((a,b)=> ns.getServerMaxMoney(b)-ns.getServerMaxMoney(a))[0]]; // Single target
}

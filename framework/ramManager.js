/** @param {NS} ns */
import { scanAll } from "/framework/utils.js";

export function getFreeThreads(ns) {
    const hosts = scanAll(ns);
    const workerRam = ns.getScriptRam("worker.js");
    const freeThreadsMap = {};

    for (const h of hosts) {
        if (!ns.hasRootAccess(h)) continue;
        const freeRam = ns.getServerMaxRam(h) - ns.getServerUsedRam(h) - (h === "home" ? ns.getScriptRam("controller.js") : 0);
        freeThreadsMap[h] = Math.floor(freeRam / workerRam);
    }
    return freeThreadsMap;
}

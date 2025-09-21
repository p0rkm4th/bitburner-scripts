/** @param {NS} ns */
import { scanAllHosts } from "/framework/utils.js";

export async function nukeAvailable(ns) {
    const hosts = scanAllHosts(ns).filter(h => !ns.getServer(h).hasAdminRights);

    for (const host of hosts) {
        try {
            // Example port opening logic
            if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(host);
            if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(host);
            if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(host);
            if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(host);
            if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(host);

            ns.nuke(host);
            ns.tprint(`Nuked ${host}`);
        } catch (e) {
            ns.tprint(`Failed to nuke ${host}: ${e}`);
        }
    }
}

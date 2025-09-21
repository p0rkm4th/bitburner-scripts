/** @param {NS} ns */
export function scanAllHosts(ns, host = "home", found = new Set()) {
    found.add(host);
    for (const neighbor of ns.scan(host)) {
        if (!found.has(neighbor)) scanAllHosts(ns, neighbor, found);
    }
    return [...found];
}

// Explicitly export scanAll for backwards compatibility
export const scanAll = scanAllHosts;
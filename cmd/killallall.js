/** @param {NS} ns */
export async function main(ns) {

    function scanAll(host = "home", found = new Set()) {
        found.add(host);
        for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
        return [...found];
    }

    const hosts = scanAll().filter(h => ns.hasRootAccess(h));

    ns.tprint(`Killing all scripts on ${hosts.length} hosts...`);

    for (const host of hosts) {
        try {
            ns.killall(host);
            // ns.tprint(`✅ Cleared: ${host}`);
        } catch (e) {
            ns.tprint(`⚠️ Could not clear ${host}: ${e}`);
        }
    }

    ns.tprint("All accessible hosts cleared of scripts.");
}

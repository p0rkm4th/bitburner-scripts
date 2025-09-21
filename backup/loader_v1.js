/** @param {NS} ns */
export async function main(ns) {
    const refreshDelay = 600000; // refresh targets every 10 min
    const batchDelay = 200;      // ms between each batch

    // Recursive network scan
    function scanAll(host = "home", found = new Set()) {
        found.add(host);
        for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
        return [...found];
    }

    while (true) {
        const playerHack = ns.getHackingLevel();

        // Filter hackable targets
        const servers = scanAll().filter(s =>
            ns.hasRootAccess(s) &&
            ns.getServerMaxMoney(s) > 0 &&
            ns.getServerRequiredHackingLevel(s) <= playerHack
        );

        if (!servers.length) {
            ns.tprint("No valid hackable targets found");
            await ns.sleep(refreshDelay);
            continue;
        }

        // Compute potential $/hack for each target
        const scoredTargets = servers.map(target => {
            const money = ns.getServerMoneyAvailable(target);
            const maxMoney = ns.getServerMaxMoney(target);
            const security = ns.getServerSecurityLevel(target);
            const minSec = ns.getServerMinSecurityLevel(target);

            // Estimate hack success fraction (simplified)
            const hackFrac = Math.max(0.01, 1 - (security - minSec) / 100);
            const potentialMoney = money * hackFrac;

            return { target, score: potentialMoney };
        });

        // Pick target with max potential money per hack
        const target = scoredTargets.sort((a, b) => b.score - a.score)[0].target;
        ns.tprint(`Deploying HWGW batches to target: ${target}`);

        const allHosts = scanAll().filter(h => ns.hasRootAccess(h));
        const ramPerThread = ns.getScriptRam("worker.js");

        for (const host of allHosts) {
            if (host !== "home") await ns.scp("worker.js", host);
            ns.killall(host);

            const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
            const totalThreads = Math.floor(freeRam / ramPerThread);
            if (totalThreads === 0) continue;

            const cycles = Math.floor(totalThreads / 4);
            const leftover = totalThreads - cycles * 4;

            // Launch full HWGW cycles
            for (let i = 0; i < cycles; i++) {
                const offset = i * batchDelay;
                ns.exec("worker.js", host, 1, target, "hack", offset);
                ns.exec("worker.js", host, 1, target, "weaken", offset + 50);
                ns.exec("worker.js", host, 1, target, "grow", offset + 100);
                ns.exec("worker.js", host, 1, target, "weaken", offset + 150);
            }

            // Assign leftover threads intelligently
            for (let i = 0; i < leftover; i++) {
                const money = ns.getServerMoneyAvailable(target);
                const maxMoney = ns.getServerMaxMoney(target);
                const sec = ns.getServerSecurityLevel(target);
                const minSec = ns.getServerMinSecurityLevel(target);

                if (sec > minSec) ns.exec("worker.js", host, 1, target, "weaken");
                else if (money < maxMoney) ns.exec("worker.js", host, 1, target, "grow");
                else ns.exec("worker.js", host, 1, target, "hack");
            }

            ns.tprint(`Host: ${host} → ${cycles} full HWGW cycles + ${leftover} leftover threads`);
        }

        await ns.sleep(refreshDelay);
    }
}

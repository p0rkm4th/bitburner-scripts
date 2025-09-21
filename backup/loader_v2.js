/** @param {NS} ns */
export async function main(ns) {
    const refreshDelay = 600000; // refresh targets every 10 min
    const batchDelay = 200;      // ms between each batch

    function scanAll(host = "home", found = new Set()) {
        found.add(host);
        for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
        return [...found];
    }

    while (true) {
        const playerHack = ns.getHackingLevel();

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

        // Calculate $/sec for each server
        const serverScores = servers.map(s => {
            const maxMoney = ns.getServerMaxMoney(s);
            const moneyAvail = ns.getServerMoneyAvailable(s);
            const sec = ns.getServerSecurityLevel(s);
            const minSec = ns.getServerMinSecurityLevel(s);

            const hackTime = ns.getHackTime(s);
            const growTime = ns.getGrowTime(s);
            const weakenTime = ns.getWeakenTime(s);

            const hackChance = ns.hackAnalyzeChance(s);

            // Estimate money per hack
            const moneyPerHack = ns.hackAnalyze(s) * moneyAvail;

            // Full HWGW cycle time in seconds
            const cycleTime = (hackTime + weakenTime + growTime + weakenTime) / 1000;

            // Estimate $ per second
            const moneyPerSec = moneyPerHack / cycleTime * hackChance;

            return { target: s, moneyPerSec };
        });

        // Pick the target with max $/sec
        const target = serverScores.sort((a, b) => b.moneyPerSec - a.moneyPerSec)[0].target;
        ns.tprint(`Deploying HWGW batches to target: ${target}`);

        const allHosts = scanAll().filter(h => ns.hasRootAccess(h));
        const ramPerThread = ns.getScriptRam("worker.js");

        for (const host of allHosts) {
            if (host !== "home") await ns.scp("worker.js", host);
            ns.killall(host);

            const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
            const totalThreads = Math.floor(freeRam / ramPerThread);

            if (totalThreads < 4) {
                // Not enough for a full HWGW cycle → just hack
                for (let i = 0; i < totalThreads; i++) {
                    ns.exec("worker.js", host, 1, target, "hack");
                }
                ns.tprint(`Host: ${host} → used all threads for hacking`);
                continue;
            }

            const cycles = Math.floor(totalThreads / 4);
            const leftoverThreads = totalThreads - cycles * 4;

            for (let i = 0; i < cycles; i++) {
                const offset = i * batchDelay;

                ns.exec("worker.js", host, 1, target, "hack", offset);
                ns.exec("worker.js", host, 1, target, "weaken", offset + 50);
                ns.exec("worker.js", host, 1, target, "grow", offset + 100);
                ns.exec("worker.js", host, 1, target, "weaken", offset + 150);
            }

            // Assign leftover threads to weaken
            for (let i = 0; i < leftoverThreads; i++) {
                ns.exec("worker.js", host, 1, target, "weaken");
            }

            ns.tprint(`Host: ${host} → ${cycles} full HWGW cycles + ${leftoverThreads} leftover threads`);
        }

        await ns.sleep(refreshDelay);
    }
}

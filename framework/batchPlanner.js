/** @param {NS} ns */
export async function planHWGWCycles(ns, targets, freeThreadsMap) {
    const workerRam = ns.getScriptRam("worker.js");

    for (const host of Object.keys(freeThreadsMap)) {
        const threads = freeThreadsMap[host];
        if (threads <= 0) continue;

        let threadQueue = [];
        let t = threads;

        while (t > 0) {
            for (const action of ["hack", "weaken", "grow", "weaken"]) {
                if (t <= 0) break;
                threadQueue.push(action);
                t--;
            }
        }

        // Dispatch threads round-robin to targets
        let targetIndex = 0;
        for (const action of threadQueue) {
            const target = targets[targetIndex % targets.length];
            ns.exec("worker.js", host, 1, target, action);
            targetIndex++;
        }

        ns.tprint(`Host: ${host} → Dispatched ${threads} HWGW threads across ${targets.length} targets`);
    }
}

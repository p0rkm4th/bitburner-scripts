/** @param {NS} ns **/
export async function main(ns) {
    const port = parseInt(ns.args[0]) || 1;
    ns.disableLog("sleep");
    ns.disableLog("hack");
    ns.disableLog("grow");
    ns.disableLog("weaken");

    while(true) {
        const jobData = ns.readPort(port);
        if(jobData === "NULL PORT DATA") {
            await ns.sleep(100);
            continue;
        }

        try {
            const job = JSON.parse(jobData);
            const target = job.target;
            const action = job.action;
            const delay = job.delay || 0;

            // Delay if specified
            if(delay > 0) await ns.sleep(delay);

            // Execute the action
            if(action === "hack") {
                await ns.hack(target);
            } else if(action === "grow") {
                await ns.grow(target);
            } else if(action === "weaken") {
                await ns.weaken(target);
            }

        } catch(e) {
            // Optional: could log to port 2 instead of ns.print
            // ns.print("Worker error: " + e);
        }
    }
}


/** @param {NS} ns **/
export async function main(ns) {
    if (!ns.getServer().backdoorInstalled) {
        await ns.installBackdoor();
        ns.tprint('Backdoor installed on ' + ns.getHostname());
    }
}

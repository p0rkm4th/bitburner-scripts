/** @param {NS} ns **/
export async function main(ns) {
    const checkDelay = 60_000; // check every 60 seconds

    const market = {
        "BruteSSH.exe": 500_000,
        "FTPCrack.exe": 1_500_000,
        "relaySMTP.exe": 5_000_000,
        "HTTPWorm.exe": 30_000_000,
        "SQLInject.exe": 250_000_000,
        "ServerProfiler.exe": 500_000,
        "DeepscanV1.exe": 500_000,
        "DeepscanV2.exe": 25_000_000,
        "AutoLink.exe": 1_000_000,
        "Formulas.exe": 5_000_000_000
    };

    ns.tprint("Monitoring Black Market affordability...");

    while (true) {
        const money = ns.getServerMoneyAvailable("home");

        for (const [program, price] of Object.entries(market)) {
            if (money >= price && !ns.fileExists(program, "home")) {
                ns.tprint(`💰 You can afford ${program}! Cost: $${ns.formatNumber(price)}`);
                ns.toast(`Black Market: ${program} affordable!`, "success", 5000);
            }
        }

        await ns.sleep(checkDelay);
    }
}

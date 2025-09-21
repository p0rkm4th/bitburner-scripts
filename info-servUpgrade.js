/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const purchased = ns.getPurchasedServers();
    const maxRam = ns.getPurchasedServerMaxRam();

    if (purchased.length === 0) {
        ns.tprint("You have no purchased servers.");
        return;
    }

    // Build purchased server rows
    const serverRows = purchased.map((s, i) => {
        const ram = ns.getServerMaxRam(s);
        return `${i.toString().padEnd(3)} ${s.padEnd(20)} ${ram.toString().padEnd(5)}GB`;
    });

    // Build RAM/cost rows
    const ramOptions = [];
    for (let ram = 8; ram <= maxRam; ram *= 2) {
        const cost = ns.getPurchasedServerCost(ram);
        ramOptions.push(`${ram.toString().padEnd(6)}GB -> $${ns.formatNumber(cost).padStart(10)}`);
    }

    // Determine max number of rows
    const maxRows = Math.max(serverRows.length, ramOptions.length);

    ns.tprint("=== Purchased Servers & RAM/Cost Options ===");
    ns.tprint("Server #  Name                 RAM   |  RAM Size -> Cost");
    ns.tprint("--------------------------------------------------------");

    for (let i = 0; i < maxRows; i++) {
        const serverCell = serverRows[i] || "".padEnd(30);
        const ramCell = ramOptions[i] || "";
        ns.tprint(`${serverCell} | ${ramCell}`);
    }

    ns.tprint("\nNote: Use these values with servUpgrade.js arguments:");
    ns.tprint("  run servUpgrade.js <oldServer> <ram> <newName>");
    ns.tprint("Example:");
    ns.tprint("  run servUpgrade.js hades.srv-0 64 hades.srv-0-Upgraded");
}

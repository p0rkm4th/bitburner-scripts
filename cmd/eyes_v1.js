/** @param {NS} ns */
export async function main(ns) {
    function scanAll(host = "home", found = new Set()) {
        found.add(host);
        for (const n of ns.scan(host)) if (!found.has(n)) scanAll(n, found);
        return [...found];
    }

    function bar(value, length = 10, colors = ["\x1b[37m", "\x1b[32m"]) {
        const filled = Math.round(value * length);
        const empty = length - filled;
        return colors[1] + '█'.repeat(filled) + colors[0] + '░'.repeat(empty) + '\x1b[0m';
    }

    function colorScale(value, type) {
        if (type === "sec") {
            if (value < 0.3) return ["\x1b[90m", "\x1b[32m"]; // low = green
            if (value < 0.7) return ["\x1b[90m", "\x1b[33m"]; // medium = yellow
            return ["\x1b[90m", "\x1b[31m"]; // high = red
        } else if (type === "money") {
            if (value < 0.3) return ["\x1b[90m", "\x1b[31m"]; // low = red
            if (value < 0.7) return ["\x1b[90m", "\x1b[33m"]; // medium = yellow
            return ["\x1b[90m", "\x1b[32m"]; // high = green
        } else if (type === "ram") {
            return ["\x1b[90m", "\x1b[34m"]; // gray + blue
        }
        return ["\x1b[90m", "\x1b[37m"];
    }

    const hosts = scanAll().filter(h => ns.hasRootAccess(h));
    ns.tprint("Network Overview");

    for (const host of hosts) {
        const sec = ns.getServerSecurityLevel(host);
        const minSec = ns.getServerMinSecurityLevel(host);
        const money = ns.getServerMoneyAvailable(host);
        const maxMoney = ns.getServerMaxMoney(host);
        const usedRam = ns.getServerUsedRam(host);
        const maxRam = ns.getServerMaxRam(host);

        const secScale = Math.min(1, (sec - minSec) / (30 - minSec));
        const moneyScale = maxMoney > 0 ? money / maxMoney : 0;
        const ramScale = maxRam > 0 ? usedRam / maxRam : 0;

        ns.tprint(
            `${host.padEnd(16)} | SEC: ${bar(secScale, 10, colorScale(secScale, "sec"))} (${sec.toFixed(2)}/${minSec.toFixed(2)})` +
            ` | $: ${bar(moneyScale, 10, colorScale(moneyScale, "money"))} ($${(money/1e6).toFixed(2)}M/$${(maxMoney/1e6).toFixed(2)}M)` +
            ` | RAM: ${bar(ramScale, 10, colorScale(ramScale, "ram"))} (${usedRam.toFixed(2)}GB/${maxRam.toFixed(2)}GB)`
        );
    }
}

/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    if (!target) {
        ns.tprint("❌ Usage: run cost.js <target-server>");
        return;
    }

    ns.tprint(`Measuring RAM usage for Black Market programs against: ${target}`);

    const programs = [
        { name: "BruteSSH.exe", command: () => ns.brutessh(target) },
        { name: "FTPCrack.exe", command: () => ns.ftpcrack(target) },
        { name: "relaySMTP.exe", command: () => ns.relaysmtp(target) },
        { name: "HTTPWorm.exe", command: () => ns.httpworm(target) },
        { name: "SQLInject.exe", command: () => ns.sqlinject(target) },
        { name: "ServerProfiler.exe", command: () => ns.serverProfiler(target) },
        { name: "DeepscanV1.exe", command: () => ns.deepscan(target, 1) },
        { name: "DeepscanV2.exe", command: () => ns.deepscan(target, 2) },
        { name: "AutoLink.exe", command: () => ns.autolink(target) },
        { name: "Formulas.exe", command: () => ns.formulas() } // no target needed
    ];

    for (const prog of programs) {
        if (ns.fileExists(prog.name, "home")) {
            try {
                const tempScript = `/tmp/test-${prog.name}.js`;
                const content = `/** @param {NS} ns **/ export async function main(ns) { ns.tprint("Running ${prog.name}"); }`;
                ns.write(tempScript, content, "w");

                // Run the command once in this script to simulate usage
                prog.command();

                const ram = ns.getScriptRam(tempScript);
                ns.tprint(`${prog.name} RAM cost (script + command): ${ram} GB`);
                ns.rm(tempScript);
            } catch (err) {
                ns.tprint(`⚠️ Error running ${prog.name} on ${target}: ${err}`);
            }
        } else {
            ns.tprint(`❌ ${prog.name} not owned yet`);
        }
    }
}

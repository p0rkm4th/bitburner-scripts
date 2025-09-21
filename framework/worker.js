/** @param {NS} ns */
export async function main(ns) {
    const [target, action] = ns.args;
    while (true) {
        if (action === "weaken") await ns.weaken(target);
        else if (action === "grow") await ns.grow(target);
        else if (action === "hack") await ns.hack(target);
    }
}

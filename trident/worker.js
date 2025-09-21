/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const action = ns.args[1]; // "hack", "grow", "weaken"

  if (!target || !action) {
    ns.tprint("Usage: run worker.js <target> <hack/grow/weaken>");
    return;
  }

  try {
    switch (action) {
      case "hack":
        await ns.hack(target);
        break;
      case "grow":
        await ns.grow(target);
        break;
      case "weaken":
        await ns.weaken(target);
        break;
      default:
        ns.tprint(`Invalid action: ${action}`);
    }
  } catch (e) {
    ns.tprint(`Error running ${action} on ${target}: ${e}`);
  }
}

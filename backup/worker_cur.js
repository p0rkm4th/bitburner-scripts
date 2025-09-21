/** @param {NS} ns **/
export async function main(ns) {
  // Very small, low-ram worker for single-threaded actions called by loader.js
  ns.disableLog("ALL");

  const target = ns.args[0] ?? ns.getHostname();
  const action = (ns.args[1] || "hack").toLowerCase();
  const offset = Number(ns.args[2] || 0);

  // Basic sanity
  if (!target) {
    ns.print("worker.js: no target specified — exiting");
    return;
  }
  if (!ns.hasRootAccess(target)) {
    ns.print(`worker.js: no root access to ${target} — exiting`);
    return;
  }

  // If provided an offset, wait that many milliseconds before doing the action.
  // Loader coordinates offsets; worker stays minimal and trusts those offsets.
  if (offset > 0) await ns.sleep(offset);

  // Perform the requested single-thread action and exit.
  try {
    if (action === "hack") {
      await ns.hack(target);
      ns.print(`hack done: ${target}`);
    } else if (action === "grow") {
      await ns.grow(target);
      ns.print(`grow done: ${target}`);
    } else if (action === "weaken") {
      await ns.weaken(target);
      ns.print(`weaken done: ${target}`);
    } else {
      ns.print(`worker.js: unknown action "${action}" — exiting`);
    }
  } catch (err) {
    ns.print(`worker.js error on ${action} ${target}: ${err}`);
  }
}

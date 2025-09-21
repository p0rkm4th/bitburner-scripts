/** @param {NS} ns **/
export async function main(ns) {
  let targets = null;
  let delay = 0;
  let ratioStr = null;
  let workerHost = null;
  let logDir = "/logs/"; // fallback if loader doesn't pass

  // -----------------------------
  // Parse arguments
  // -----------------------------
  for (let i = 0; i < ns.args.length; i++) {
    const a = String(ns.args[i]);
    if ((a === "--targets" || a === "--target") && i + 1 < ns.args.length) targets = String(ns.args[i + 1]);
    if (a === "--delay" && i + 1 < ns.args.length) delay = Number(ns.args[i + 1]) || 0;
    if (a === "--ratio" && i + 1 < ns.args.length) ratioStr = String(ns.args[i + 1]);
    if (a === "--workerHost" && i + 1 < ns.args.length) workerHost = String(ns.args[i + 1]);
    if (a === "--logDir" && i + 1 < ns.args.length) logDir = String(ns.args[i + 1]);
  }

  targets = targets || "n00dles";
  workerHost = workerHost || "unknown";
  const targetsList = targets.split(",").map(t => t.trim());

  if (delay > 0) await ns.sleep(delay);

  // -----------------------------
  // Parse ratio
  // -----------------------------
  let weakenCount = 3, hackCount = 2, growCount = 2;
  if (ratioStr) {
    const parts = ratioStr.split(":").map(p => Number(p) || 0);
    if (parts.length === 3) [weakenCount, hackCount, growCount] = parts;
  }

  // -----------------------------
  // Execute actions per target in WHGW cycling
  // -----------------------------
  for (const t of targetsList) {
    let w = weakenCount, h = hackCount, g = growCount;

    while (w > 0 || h > 0 || g > 0) {
      if (w > 0) { await ns.weaken(t); w--; }
      if (h > 0) { await ns.hack(t); h--; }
      if (g > 0) { await ns.grow(t); g--; }
    }


    // -----------------------------
    // Log this batch
    // -----------------------------
    const logEntry = {
      time: new Date().toLocaleString(),
      target: t,
      weaken: weakenCount,
      hack: hackCount,
      grow: growCount
    };

    //ns.write(`${logDir}worker-${workerHost}.txt`, JSON.stringify(logEntry) + "\n", "a", "home");
  }
}

/** @param {NS} ns **/
export async function main(ns) {
  ns.ui.openTail();

  const HOME = "home";

  // ---- Scan network (DFS) ----
  function scanAll(start = HOME) {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      for (const n of ns.scan(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return Array.from(seen);
  }

  // ---- BFS path finder ----
  function findPath(start, goal) {
    if (start === goal) return [start];
    const q = [start];
    const parent = new Map([[start, null]]);
    while (q.length) {
      const cur = q.shift();
      for (const n of ns.scan(cur)) {
        if (!parent.has(n)) {
          parent.set(n, cur);
          if (n === goal) {
            const path = [];
            for (let x = goal; x; x = parent.get(x)) path.push(x);
            return path.reverse();
          }
          q.push(n);
        }
      }
    }
    return null;
  }

  const servers = scanAll();
  const aliasParts = [];

  for (const host of servers) {
    if (host === HOME) continue;

    const path = findPath(HOME, host);
    if (!path) continue;

    const steps = path
      .map((node, idx) => (idx === 0 ? "home" : `connect ${node}`))
      .join("; ");

    // Replace dots for alias names to avoid issues
    const aliasName = host.replace(/\./g, "_") + "-c";

    // Add the alias command
    aliasParts.push(`alias ${aliasName}="${steps}"`);
  }

  // ---- Combine all aliases into one line, separated by ; ----
  const combinedAliases = aliasParts.join("; ");

  const fileName = "connectAliases.txt";
  await ns.write(fileName, combinedAliases, "w");

  ns.tprint(`Generated ${aliasParts.length} aliases in one line!`);
  ns.tprint(`Copy & paste the contents of ${fileName} into the Terminal.`);
}

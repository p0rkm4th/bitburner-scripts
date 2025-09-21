/** @param {NS} ns **/
export async function main(ns) {
  const HOME = "home";
  const servers = [HOME, ...ns.getPurchasedServers()];

  // Column widths
  const nameW = 20, usedW = 12, ramW = 14, costW = 18;

  const divider = "=".repeat(nameW + usedW + ramW + costW + 9);
  ns.tprint(divider);
  ns.tprint(
    `${"SERVER".padEnd(nameW)} | ${"USED".padEnd(usedW)} | ${"MAX RAM".padEnd(ramW)} | ${"COST".padEnd(costW)}`
  );
  ns.tprint("-".repeat(nameW + usedW + ramW + costW + 9));

  let totalUsed = 0;
  let totalMax = 0;
  let totalCost = 0;

  for (const host of servers) {
    const used = ns.getServerUsedRam(host);
    const max = ns.getServerMaxRam(host);
    const cost = host === HOME ? 0 : ns.getPurchasedServerCost(max);

    totalUsed += used;
    totalMax += max;
    totalCost += cost;

    const costDisplay = host === HOME ? "—" : `$${ns.formatNumber(cost, 1)}`;

    ns.tprint(
      `${host.padEnd(nameW)} | ${used.toFixed(1).padStart(usedW - 1)} GB` +
      ` | ${max.toFixed(1).padStart(ramW - 1)} GB` +
      ` | ${costDisplay.padStart(costW)}`
    );
  }

  ns.tprint("-".repeat(nameW + usedW + ramW + costW + 9));
  ns.tprint(
    `TOTAL`.padEnd(nameW) +
    ` | ${totalUsed.toFixed(1).padStart(usedW - 1)} GB` +
    ` | ${totalMax.toFixed(1).padStart(ramW - 1)} GB` +
    ` | $${ns.formatNumber(totalCost, 1).padStart(costW - 1)}`
  );
  ns.tprint(divider);
}

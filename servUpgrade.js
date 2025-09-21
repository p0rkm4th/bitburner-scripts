/** @param {NS} ns **/
export async function main(ns) {
  ns.disableLog("ALL");

  // -----------------------
  // Parse arguments
  // -----------------------
  const args = ns.args;
  const oldServer = args[0];   // --server
  const chosenRam = args[1];   // --ram
  const newName = args[2];     // --name

  // Validate arguments
  if (!oldServer || !chosenRam || !newName) {
    ns.tprint("Usage: run replaceServer.js <oldServer> <newRam> <newName>");
    ns.tprint("Example: run replaceServer.js HadesExtra-0 64 HadesExtra-0-Upgraded");
    return;
  }

  // -----------------------
  // Check purchased servers
  // -----------------------
  const purchased = ns.getPurchasedServers();
  if (!purchased.includes(oldServer)) {
    ns.tprint(`Error: Server "${oldServer}" not found among purchased servers.`);
    return;
  }

  if (purchased.includes(newName)) {
    ns.tprint(`Error: New server name "${newName}" already exists.`);
    return;
  }

  // -----------------------
  // Validate RAM
  // -----------------------
  const maxRam = ns.getPurchasedServerMaxRam();
  if (chosenRam > maxRam || chosenRam < 8 || (chosenRam & (chosenRam - 1)) !== 0) {
    ns.tprint(`Error: Invalid RAM. Must be a power-of-2 between 8GB and ${maxRam}GB.`);
    return;
  }

  // -----------------------
  // Check money
  // -----------------------
  const cost = ns.getPurchasedServerCost(chosenRam);
  const money = ns.getServerMoneyAvailable("home");
  if (money < cost) {
    ns.tprint(`Not enough money. Need $${ns.formatNumber(cost)}, have $${ns.formatNumber(money)}`);
    return;
  }

  // -----------------------
  // Show summary
  // -----------------------
  ns.tprint(`Replacing server "${oldServer}" (${ns.getServerMaxRam(oldServer)}GB)`);
  ns.tprint(`Buying new server "${newName}" with ${chosenRam}GB RAM for $${ns.formatNumber(cost)}`);
  ns.tprint(`Available funds: $${ns.formatNumber(money)}`);

  // -----------------------
  // Delete old server
  // -----------------------
  ns.deleteServer(oldServer);
  ns.tprint(`Deleted server: ${oldServer}`);

  // -----------------------
  // Purchase new server
  // -----------------------
  const hostname = ns.purchaseServer(newName, chosenRam);
  if (hostname) {
    ns.tprint(`Purchased new server: ${hostname} with ${chosenRam}GB RAM for $${ns.formatNumber(cost)}`);
  } else {
    ns.tprint("Failed to purchase new server. Check money, RAM limits, and server name uniqueness.");
  }
}

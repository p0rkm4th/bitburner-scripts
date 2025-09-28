/** @param {NS} ns **/
export async function main(ns) {
  const loopDelay = 900_000; 
  // Delay between runs
  // -----------------------
  // Time conversions table
  // -----------------------
  // Format: <Minutes> -> <Milliseconds>
  // -----------------------
  // 1 minute   ->  60,000 ms
  // 5 minutes  -> 300,000 ms
  // 10 minutes -> 600,000 ms
  // 15 minutes -> 900,000 ms
  // 20 minutes -> 1,200,000 ms
  // 30 minutes -> 1,800,000 ms
  // 45 minutes -> 2,700,000 ms
  // 1 hour     -> 3,600,000 ms
  // -----------------------

  const minCash = 0;        // Minimum money on home before attempting upgrades

  // Breakpoints for available cash (on home)
  // -> pick the highest tier <= current money
  const tiers = [
    0,           // starting safety
    20_000_000,  // early-mid
    50_000_000,  // stable income
    150_000_000, // stronger hacking nets
    500_000_000, // solid corp/hack funds
    1_000_000_000 // late-mid safety
  ];

  // % of current money to allocate for upgrades at that tier
  // keep values modest so you always leave working capital
  const tierMultipliers = [
    0.03, // 3% when under 20M (slow growth, protect cash)
    0.05, // 5% for 20–50M
    0.08, // 8% for 50–150M
    0.12, // 12% for 150–500M
    0.15, // 15% for 500M–1B
    0.18  // 18% if >1B (mid-late stage)
  ];


  // Names for purchased servers
  const superNames = [
    "Dean", "Sam", "Castiel", "Crowley", "Lucifer", "Bobby", "Charlie",
    "Rowena", "Jack", "Gabriel", "Metatron", "Azazel", "Amara", "Lilith",
    "Eileen", "Jody", "Garth", "Kevin", "Meg", "Jo", "Ezekiel", "Murphy",
    "Adam", "Lisa", "Ruby", "Eden", "Cain", "Abaddon", "Arthur", "Tessa"
  ];

  const HOME = "home";
  const LOG_DIR = "/logs/";

  // Corrected timestamp for a valid filename: no spaces, colons replaced
  const timestamp = new Date().toISOString()
    .replace(/:/g, "-") // replace colons
    .replace(/T/, "_")  // replace T with underscore
    .split(".")[0];     // remove milliseconds
  const logfile = `${LOG_DIR}upgrade-${timestamp}.txt`;

  let serverNameCounter = 0; // Counter for extra server names if superNames run out

  while (true) {
    // Get current money available on home server
    let totalMoney = ns.getServerMoneyAvailable(HOME);

    // Skip loop if below minimum cash
    if (totalMoney < minCash) {
      await ns.sleep(loopDelay);
      continue;
    }

    // -----------------------------
    // Determine budget based on tier
    // -----------------------------
    let budget = 0;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (totalMoney >= tiers[i]) {
        budget = totalMoney * tierMultipliers[i];
        break;
      }
    }

    // Split budget into three categories
    let hacknetBudget = budget / 3;
    let serverBudget = budget / 3;
    let nodeBudget = budget / 3;

    let spentHacknet = 0, spentNodes = 0, spentServers = 0;

    // --- Stage 1: Upgrade Hacknet nodes ---
    spentHacknet = await upgradeHacknetNodes(ns, hacknetBudget, logfile);

    // Allocate leftover Hacknet upgrade money to Hacknet node purchases
    const leftoverHacknet = hacknetBudget - spentHacknet;
    const hacknetNodeBudget = nodeBudget + leftoverHacknet;

    // --- Stage 2: Purchase Hacknet nodes ---
    spentNodes = await purchaseHacknetNodes(ns, hacknetNodeBudget, logfile);

    // Any leftover node budget goes to servers
    serverBudget += hacknetNodeBudget - spentNodes;

    // --- Stage 3: Purchase / Upgrade Servers ---
    const serverResult = await purchaseServers(ns, serverBudget, superNames, serverNameCounter, logfile);
    spentServers = serverResult.spent;
    serverNameCounter = serverResult.serverNameCounter;
        // Get current money available on home server
    let endMoney = ns.getServerMoneyAvailable(HOME);


    // -----------------------------
    // Logging totals
    // -----------------------------
    const totalSpent = spentHacknet + spentNodes + spentServers;
    const logSummary = [
      `Upgrade run at: ${new Date().toLocaleString()}`,
      `Total Starting Cash: $${ns.formatNumber(totalMoney, 1)}`,
      `Total Budget: $${ns.formatNumber(budget, 1)} : $${ns.formatNumber(budget / 3, 1)}`,
      `Spent Hacknet Upgrades: $${ns.formatNumber(spentHacknet, 1)}`,
      `Spent Hacknet Nodes: $${ns.formatNumber(spentNodes, 1)}`,
      `Spent Servers: $${ns.formatNumber(spentServers, 1)}`,
      `Total Spent: $${ns.formatNumber(totalSpent, 1)}`,
      `Total Ending Cash: $${ns.formatNumber(endMoney, 1)}`,
      "----------------------------------------"
    ].join("\n");

    // Append summary to log file
    ns.write(logfile, logSummary + "\n", "a");

    // Wait before next upgrade cycle
    await ns.sleep(loopDelay);
  }
}

// -----------------------------
// Stage 1: Upgrade Hacknet Nodes
// -----------------------------
async function upgradeHacknetNodes(ns, hacknetBudget, logfile) {
  let spent = 0; // Track money spent on upgrades
  const nodes = ns.hacknet.numNodes(); // Number of existing Hacknet nodes

  for (let i = 0; i < nodes; i++) {
    while (true) {
      // Get costs for level, RAM, and core upgrades for node i
      const levelCost = ns.hacknet.getLevelUpgradeCost(i, 1);
      const ramCost = ns.hacknet.getRamUpgradeCost(i, 1);
      const coreCost = ns.hacknet.getCoreUpgradeCost(i, 1);

      // Create array of potential upgrades, calculate "value" as 1/cost
      const upgrades = [
        { cost: levelCost, func: () => ns.hacknet.upgradeLevel(i, 1), value: 1 / levelCost, name: "Level" },
        { cost: ramCost, func: () => ns.hacknet.upgradeRam(i, 1), value: 1 / ramCost, name: "RAM" },
        { cost: coreCost, func: () => ns.hacknet.upgradeCore(i, 1), value: 1 / coreCost, name: "Core" }
      ].filter(u => spent + u.cost <= hacknetBudget); // Only include upgrades within budget

      if (upgrades.length === 0) break; // Exit if no affordable upgrades

      // Choose the most "valuable" upgrade
      upgrades.sort((a, b) => b.value - a.value);
      upgrades[0].func(); // Apply upgrade
      spent += upgrades[0].cost;

      // Log the upgrade
      const logLine = `Hacknet node ${i} upgraded ${upgrades[0].name} for $${ns.formatNumber(upgrades[0].cost, 1)}`;
      ns.print(logLine);
      ns.write(logfile, logLine + "\n", "a");
    }
  }
  return spent; // Return total spent on node upgrades
}

// -----------------------------
// Stage 2: Purchase Hacknet Nodes
// -----------------------------
async function purchaseHacknetNodes(ns, nodeBudget, logfile) {
  let spent = 0; // Track money spent on new nodes
  const maxNodes = ns.hacknet.maxNumNodes(); // Max nodes player can purchase
  let nodesPurchased = 0;
  const existingNodes = ns.hacknet.numNodes();

  while (existingNodes + nodesPurchased < maxNodes) {
    const nodeCost = ns.hacknet.getPurchaseNodeCost();
    if (nodeBudget >= nodeCost) {
      ns.hacknet.purchaseNode();
      spent += nodeCost;
      nodeBudget -= nodeCost;
      nodesPurchased++;
      const logLine = `Purchased Hacknet node for $${ns.formatNumber(nodeCost, 1)}`;
      ns.print(logLine);
      ns.write(logfile, logLine + "\n", "a");
    } else break; // Exit if cannot afford next node
  }

  return spent; // Return total spent on nodes
}

// -----------------------------
// Stage 3: Purchase / Upgrade Servers (fill budget, safe name reuse)
// -----------------------------
async function purchaseServers(ns, serverBudget, superNames, serverNameCounter, logfile) {
  let spent = 0;
  const maxServers = ns.getPurchasedServerLimit();
  const maxRam = ns.getPurchasedServerMaxRam();

  let counter = { value: serverNameCounter }; // persist extra server counter
  const usedNames = new Set(ns.getPurchasedServers().map(s => s.replace("hades.", "")));

  const getNextName = () => {
    for (const n of superNames) {
      if (!usedNames.has(n)) return n;
    }
    return `HadesExtra-${counter.value++}`;
  };

  const buyServer = (ram) => {
    const name = `hades.${getNextName()}`;
    const cost = ns.getPurchasedServerCost(ram);
    if (serverBudget >= cost) {
      ns.purchaseServer(name, ram);
      spent += cost;
      serverBudget -= cost;
      usedNames.add(name.replace("hades.", ""));
      const logLine = `Purchased server ${name} with ${ram}GB RAM for $${ns.formatNumber(cost, 1)}`;
      ns.print(logLine);
      ns.write(logfile, logLine + "\n", "a");
      return true;
    }
    return false;
  };

  let actionTaken = true;

  while (actionTaken && serverBudget >= ns.getPurchasedServerCost(8)) {
    actionTaken = false;
    let currentServers = ns.getPurchasedServers();

    // 1️⃣ Buy new server if under limit
    if (currentServers.length < maxServers) {
      let ram = 8;
      // Find largest affordable RAM under maxRam
      while (ram * 2 <= maxRam && ns.getPurchasedServerCost(ram * 2) <= serverBudget) ram *= 2;

      // Buy as many servers as possible with remaining budget
      while (serverBudget >= ns.getPurchasedServerCost(ram) && currentServers.length < maxServers) {
        if (buyServer(ram)) {
          actionTaken = true;
          currentServers = ns.getPurchasedServers(); // refresh
        } else break;
      }
    }

    // 2️⃣ Upgrade lowest-RAM server if no new server slots left
    if (currentServers.length >= maxServers) {
      // Find the lowest-RAM server
      const lowestServer = currentServers.reduce((a, b) =>
        ns.getServerMaxRam(a) < ns.getServerMaxRam(b) ? a : b
      );

      // Determine new RAM to purchase (double, capped at maxRam)
      const newRam = Math.min(ns.getServerMaxRam(lowestServer) * 2, maxRam);

      if (newRam > ns.getServerMaxRam(lowestServer)) {
        const cost = ns.getPurchasedServerCost(newRam);
        if (serverBudget >= cost) {
          // Delete the server
          ns.deleteServer(lowestServer);

          // ✅ Remove the deleted server's name from usedNames to allow reuse
          usedNames.delete(lowestServer.replace("hades.", ""));

          currentServers = ns.getPurchasedServers(); // refresh
          if (buyServer(newRam)) actionTaken = true;
        }
      }
    }
  }

  return { spent, serverNameCounter: counter.value };
}

/** @param {NS} ns **/
export async function main(ns) {
  const LOG_DIR = "logs/";      // no leading slash
  const PREFIX = "upgrade-";

  // 1️⃣ Get all files inside /logs
  const files = ns.ls("home", LOG_DIR);

  // 2️⃣ Only keep upgrade logs
  const upgradeLogs = files
    .filter(f => f.startsWith(`${LOG_DIR}${PREFIX}`))
    .sort((a, b) => a.localeCompare(b));

  if (upgradeLogs.length === 0) {
    ns.tprint("No upgrade log files found in /logs/");
    return;
  }

  // 3️⃣ Merge contents
  let merged = "";
  for (const file of upgradeLogs) {
    merged += `===== ${file} =====\n`;
    merged += ns.read(file);
    merged += "\n\n";
  }

  // 4️⃣ Create merged file
  const ts = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace("T", "_")
    .split(".")[0];

  const outFile = `${LOG_DIR}${PREFIX}${ts}-MERGED.txt`;
  ns.write(outFile, merged, "w");
  ns.tprint(`✅ Merged ${upgradeLogs.length} logs into ${outFile}`);

  // 5️⃣ Delete the originals (keep the merged one)
  for (const file of upgradeLogs) {
    if (file !== outFile) {
      const ok = ns.rm(file);
      if (!ok) ns.tprint(`⚠️ Could not remove ${file}`);
    }
  }

  ns.tprint("🗑️ Old upgrade logs removed.");
}

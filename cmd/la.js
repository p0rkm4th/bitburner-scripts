/** @param {NS} ns **/
export async function main(ns) {
    const folder = ns.args[0] || ""; // folder path, e.g., "/folder"
    const HOME = "home";

    if (!folder) {
        ns.tprint("Usage: run la.js /folder");
        return;
    }

    // Check if folder exists
    const files = ns.ls(HOME, folder); // ls under home
    if (files.length === 0) {
        ns.tprint(`No files found in folder '${folder}'`);
    } else {
        // ns.tprint(`Files in '${folder}':`);
        for (const f of files) {
            ns.tprint(f);
        }
    }

    // ns.tprint("Returning to home (just a formality in Bitburner).");
}

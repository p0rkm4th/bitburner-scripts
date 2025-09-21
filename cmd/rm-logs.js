/** @param {NS} ns **/
export async function main(ns) {
    // List all servers, including those not directly connected
    const servers = ns.scan("home").concat(ns.getPurchasedServers());

    // Iterate over each server
    for (const server of servers) {
        // Check if the server exists and is accessible
        if (ns.serverExists(server)) {
            // List all files in the /logs directory of the current server
            const files = ns.ls(server, "/logs");

            // Filter out 'placeholder.txt' from the list of files to delete
            const filesToDelete = files.filter(file => file !== "/logs/placeholder.txt");

            // Delete each file in the filtered list
            for (const file of filesToDelete) {
                ns.rm(file, server);
                ns.tprint(`Deleted ${file} from ${server}`);
            }
        }
    }
}

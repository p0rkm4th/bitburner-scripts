/** @param {NS} ns */
export async function main(ns) {
    const refreshDelay = 600000;
    const batchDelay = 200;
    const secBuffer = 0.05;

    function scanAll(host="home",found=new Set()){
        found.add(host);
        for(const n of ns.scan(host)) if(!found.has(n)) scanAll(n,found);
        return [...found];
    }

    while(true){
        const playerHack=ns.getHackingLevel();
        const servers=scanAll().filter(s=>
            ns.hasRootAccess(s)&&ns.getServerMaxMoney(s)>0&&
            ns.getServerRequiredHackingLevel(s)<=playerHack
        );
        if(!servers.length){ ns.tprint("No hackable targets"); await ns.sleep(refreshDelay); continue; }

        // $/sec scoring
        const target=servers.map(s=>{
            const curM=ns.getServerMoneyAvailable(s), hChance=ns.hackAnalyzeChance(s);
            const cycleTime=(ns.getHackTime(s)+ns.getWeakenTime(s)+ns.getGrowTime(s)+ns.getWeakenTime(s))/1000;
            const moneyPerHack=ns.hackAnalyze(s)*curM;
            return {s, score:moneyPerHack*hChance/cycleTime};
        }).sort((a,b)=>b.score-a.score)[0].s;

        ns.tprint(`Deploying HWGW batches to target: ${target}`);

        const hosts=scanAll().filter(h=>ns.hasRootAccess(h));
        const ramPerThread=ns.getScriptRam("worker.js");
        const leftovers=[];
        let hostCount=0;

        for(const host of hosts){
            if(host!=="home"&&!ns.fileExists("worker.js",host)) await ns.scp("worker.js",host);
            ns.killall(host);

            const freeRam=ns.getServerMaxRam(host)-ns.getServerUsedRam(host);
            const totalThreads=Math.floor(freeRam/ramPerThread);
            if(totalThreads<4){ leftovers.push({host,threads:totalThreads}); continue; }

            const cycles=Math.floor(totalThreads/4), left=totalThreads-cycles*4;
            const minSec=ns.getServerMinSecurityLevel(target);
            const offsetBase=hostCount*50; hostCount++;

            for(let i=0;i<cycles;i++){
                const o=i*batchDelay+offsetBase;
                if(ns.getServerSecurityLevel(target)>minSec*(1+secBuffer)) ns.exec("worker.js",host,1,target,"weaken",o+50);
                ns.exec("worker.js",host,1,target,"hack",o);
                if(ns.getServerMoneyAvailable(target)<ns.getServerMaxMoney(target)*0.8) ns.exec("worker.js",host,1,target,"grow",o+100);
                if(ns.getServerSecurityLevel(target)>minSec*(1+secBuffer)) ns.exec("worker.js",host,1,target,"weaken",o+150);
            }

            if(left>0) leftovers.push({host,threads:left});
            ns.tprint(`| ${host.padEnd(15)} | ${cycles} full HWGW cycles${left?` | ${left} Smart Threads`:""}`);
        }

        // leftover threads
        const minSec=ns.getServerMinSecurityLevel(target), maxM=ns.getServerMaxMoney(target);
        for(const {host,threads} of leftovers){
            let hack=0,grow=0,weaken=0;
            for(let i=0;i<threads;i++){
                const sec=ns.getServerSecurityLevel(target), money=ns.getServerMoneyAvailable(target);
                if(sec>minSec*(1+secBuffer)){ ns.exec("worker.js",host,1,target,"weaken"); weaken++; }
                else if(money<maxM*0.8){ ns.exec("worker.js",host,1,target,"grow"); grow++; }
                else{ ns.exec("worker.js",host,1,target,"hack"); hack++; }
            }
            const parts=[];
            if(hack) parts.push(`hacking:${hack}`);
            if(grow) parts.push(`growing:${grow}`);
            if(weaken) parts.push(`weakening:${weaken}`);
            ns.tprint(`| ${host.padEnd(15)} | 0 full HWGW cycles | ${parts.join(" | ")}`);
        }

        await ns.sleep(refreshDelay);
    }
}

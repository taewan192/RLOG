const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(root,'public/gold.js'),'utf8'),context);
const {eligibleRaids,defaultGoldPlan,goldTotals,rosterTotals}=context.module.exports,rules=JSON.parse(fs.readFileSync(path.join(root,'public/raid-rewards.json'))),plain=v=>JSON.parse(JSON.stringify(v));
for(const raid of rules.raids){assert.equal(new Set(raid.variants.map(v=>v.id)).size,raid.variants.length);for(const v of raid.variants){assert(v.bound>=0&&v.bound<=v.gold);assert(Number.isInteger(v.gold));assert(eligibleRaids(v.level-.01,rules).find(r=>r.id===raid.id)?.variants.every(x=>x.id!==v.id)??true);assert(eligibleRaids(v.level,rules).find(r=>r.id===raid.id).variants.some(x=>x.id===v.id));}}
assert.deepEqual(plain(goldTotals(1712.17,defaultGoldPlan(1712.17,rules),rules)),{total:94000,bound:62000,tradable:32000,count:3});
assert.equal(goldTotals(1640,defaultGoldPlan(1640,rules),rules).total,19700);
assert.equal(goldTotals(1700,defaultGoldPlan(1700,rules,'all'),rules).total,84000);
assert.equal(goldTotals(1599.99,defaultGoldPlan(1599.99,rules),rules).total,0);
assert(goldTotals(1780,Object.fromEntries(rules.raids.map(r=>[r.id,r.variants.at(-1).id])),rules).count<=3);
const items=[1712.17,1700,1640,1640,1640,1640].map((level,i)=>({name:'char'+i,server:'serverA',level})),plans=Object.fromEntries(items.map(p=>[p.name,defaultGoldPlan(p.level,rules)])),selected=new Set(items.map(p=>p.name));
assert.deepEqual(plain(rosterTotals(items,selected,plans,rules,'serverA')),{total:250800,bound:180400,tradable:70400,count:6});
items.push({name:'otherServer',server:'serverB',level:1780},{name:'seventh',server:'serverA',level:1780});for(const name of ['otherServer','seventh']){plans[name]=defaultGoldPlan(1780,rules,'all');selected.add(name);}
assert.equal(rosterTotals(items,selected,plans,rules,'serverA').total,250800);assert.equal(rosterTotals(items,selected,plans,rules,'serverB').count,1);
assert.equal(goldTotals(1712.17,{kazeros:'hard-1730'},rules).total,0);
console.log('PASS: admission boundaries, difficulty exclusion, weekly3, roster6, server separation, tradable/bound totals');

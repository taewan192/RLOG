import { plain, officialURL, cleanProfile } from './parsers';

const text=(value:any)=>plain(String(value??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/\|/g,' '));
const list=(value:any):any[]=>Array.isArray(value)?value:[];
function tooltip(value:any){try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}}
function lines(value:any):string[]{
  const result:string[]=[];
  function visit(v:any,depth=0){if(depth>12||result.length>100)return;if(typeof v==='string'){
    if(/^(https?:|efui_|emoticon_)/i.test(v)||!v.trim())return;
    for(const part of v.replace(/<br\s*\/?\s*>/gi,'\n').replace(/\\n/g,'\n').split(/[\n|]+/)){const s=text(part);if(s&&s.length>1)result.push(s.slice(0,2400));}
  }else if(v&&typeof v==='object')for(const [k,w] of Object.entries(v)){if(!/^(slotData|iconData|iconPath|imagePath|bEquip|rtString)$/i.test(k))visit(w,depth+1);}}
  for(const e of Object.values(tooltip(value)) as any[])if(e&&typeof e==='object'&&e.type&&!['Progress','ShowMeTheMoney'].includes(e.type))visit(e.value);
  return [...new Set(result)];
}
function item(i:any){const tip=tooltip(i.Tooltip),title=(Object.values(tip) as any[]).find(e=>e?.type==='ItemTitle')?.value||{},level=text(title.leftStr2).match(/아이템 레벨\s*([\d,.]+)/),tier=text(title.leftStr2).match(/티어\s*(\d+)/),nameTag=(Object.values(tip) as any[]).find(e=>e?.type==='NameTagBox')?.value||'',color=String(nameTag).match(/COLOR\s*=\s*['"](#[a-f\d]{6})['"]/i)?.[1]||'';
  const optionGroups=(Object.values(tip) as any[]).filter(e=>e?.type==='ItemPartBox').map(e=>({label:text(e.value?.Element_000),entries:String(e.value?.Element_001||'').split(/<br\s*\/?\s*>/i).map(s=>({text:text(s),color:s.match(/COLOR\s*=\s*['"]#?([a-f\d]{6})['"]/i)?.[1]||''})).filter(e=>e.text)}));
  const refinement=lines(i.Tooltip).find(s=>s.includes('[상급 재련]'))?.match(/재련\]\s*(\d+)/)?.[1];
  return {type:text(i.Type),name:text(i.Name),image:officialURL(i.Icon||''),grade:text(i.Grade),gradeColor:color,quality:typeof title.qualityValue==='number'&&title.qualityValue>=0?title.qualityValue:null,itemLevel:level?Number(level[1].replace(/,/g,'')):null,tier:tier?Number(tier[1]):null,refinement:refinement?Number(refinement):null,optionGroups,details:lines(i.Tooltip)};
}
export function cleanArmory(raw:any){
  const engraving=raw.ArmoryEngraving||{},modern=list(engraving.ArkPassiveEffects),effects=modern.length?modern:list(engraving.Effects),slots=list(engraving.Engravings);
  const gems=raw.ArmoryGem||{},skills=Array.isArray(gems.Effects)?gems.Effects:list(gems.Effects?.Skills),cards=raw.ArmoryCard||{};
  return {
    profile:cleanProfile(raw.ArmoryProfile||{}),
    combatStats:list(raw.ArmoryProfile?.Stats).map(s=>({name:text(s.Type),value:text(s.Value),description:list(s.Tooltip).map(text).join('\n')})),
    arkTitle:text(raw.ArkPassive?.Title),
    passivePoints:list(raw.ArkPassive?.Points).map(p=>({name:text(p.Name),point:Number(p.Value||0),description:text(p.Description)})),
    passives:list(raw.ArkPassive?.Effects).map(e=>({name:text((Object.values(tooltip(e.ToolTip)) as any[]).find(t=>t?.type==='NameTagBox')?.value||e.Description),type:text(e.Name),image:officialURL(e.Icon||''),description:text(e.Description),details:lines(e.ToolTip)})),
    cores:list(raw.ArkGrid?.Slots).filter(c=>c.Name).map(c=>({...item(c),point:Number(c.Point||0)})),
    coreEffects:list(raw.ArkGrid?.Effects).map(e=>({name:text(e.Name),level:Number(e.Level||0),description:text(e.Tooltip)})),
    equipment:list(raw.ArmoryEquipment).map(item),
    avatars:list(raw.ArmoryAvatars).map(i=>({...item(i),inner:!!i.IsInner,set:!!i.IsSet})),
    gems:list(gems.Gems).map(g=>{const effect=skills.find((s:any)=>Number(s.GemSlot)===Number(g.Slot));return {...item(g),slot:Number(g.Slot),level:Number(g.Level||0),skill:effect?{name:text(effect.Name),image:officialURL(effect.Icon||''),description:(Array.isArray(effect.Description)?effect.Description:[effect.Description]).filter(Boolean).map(text).join(' · '),option:text(effect.Option)}:null};}).sort((a,b)=>a.slot-b.slot),
    gemSummary:text(gems.Effects?.Description),
    engravings:effects.map(e=>({name:text(e.Name),image:officialURL(e.Icon||slots.find(s=>text(s.Name)===text(e.Name))?.Icon||''),imageSource:'official-api',grade:text(e.Grade),level:Number(e.Level||0),stoneLevel:e.AbilityStoneLevel==null?null:Number(e.AbilityStoneLevel),description:text(e.Description),details:lines(e.Tooltip)})),
    engravingSlots:slots.map(item),engravingMode:modern.length?'아크 패시브 각인':'장착 각인',
    cards:list(cards.Cards).map(c=>({...item(c),slot:Number(c.Slot),awake:Number(c.AwakeCount||0),awakeMax:Number(c.AwakeTotal||0)})).sort((a,b)=>a.slot-b.slot),
    cardEffects:list(cards.Effects).flatMap(e=>list(e.Items).map(i=>({name:text(i.Name),description:text(i.Description)}))),
    collectibles:list(raw.Collectibles).map(c=>({name:text(c.Type),image:officialURL(c.Icon||''),point:Number(c.Point||0),max:Number(c.MaxPoint||0),points:list(c.CollectiblePoints).map(p=>({name:text(p.PointName),point:Number(p.Point||0),max:Number(p.MaxPoint||0)}))})),
  };
}

export function decodeHTML(input: string) {
  return input.replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(parseInt(c,16)))
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, c: string) => (({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[c] || ''));
}
export const plain = (s: string) => decodeHTML(s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
export function officialURL(value: string) {
  if(!value||!String(value).trim())return '';
  try { const u = new URL(decodeHTML(value), 'https://lostark.game.onstove.com'); return u.protocol==='https:' && (u.hostname==='lostark.game.onstove.com' || u.hostname==='cdn-lostark.game.onstove.com') ? u.href : ''; } catch { return ''; }
}
export function parseNotices(html: string) {
  const items: any[] = [];
  for(const match of html.matchAll(/<a\s+href="(\/News\/Notice\/Views\/[^"\s]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const block=match[2], title=block.match(/class="list__title"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    if(!title) continue;
    const utc=block.match(/data-utc="([^"]+)"/)?.[1];
    const category=block.match(/class="list__category"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    items.push({Title:plain(title),Link:officialURL(match[1]),Date:utc||null,Type:category?plain(category):'공지'});
  }
  return [...new Map(items.map(n=>[n.Link.split('?')[0],n])).values()].sort((a,b)=>Date.parse(b.Date||'')-Date.parse(a.Date||'')).slice(0,12);
}
export function parseEvents(html: string) {
  const items:any[]=[];
  for(const match of html.matchAll(/<li\b[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi)) {
    const block=match[2], title=block.match(/class="list__title"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    if(!title || !block.includes('list__thumb'))continue;
    const dates=[...block.matchAll(/data-utc="([^"]+)"/g)].map(m=>m[1]);
    const link=officialURL(match[1]);if(!link)continue;
    items.push({Title:plain(title),Link:link,Thumbnail:officialURL(block.match(/<img[^>]+src="([^"]+)"/)?.[1]||''),StartDate:dates[0]||null,EndDate:dates[1]||null});
  }
  return items;
}
export function apiDate(value: string) { return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'+09:00'); }
export function cleanProfile(p:any) {
  return {name:String(p.CharacterName||''), server:String(p.ServerName||''),job:String(p.CharacterClassName||''),
    level:Number(String(p.ItemAvgLevel||'0').replace(/,/g,'')),combat:Number(p.CharacterLevel||0),expedition:Number(p.ExpeditionLevel||0),
    guild:p.GuildName?String(p.GuildName):'',guildGrade:p.GuildMemberGrade||'',power:Number(String(p.CombatPower||'0').replace(/,/g,'')),
    title:p.Title||'',image:officialURL(p.CharacterImage||''),town:p.TownName||'',stats:Array.isArray(p.Stats)?p.Stats.map((s:any)=>({type:s.Type,value:s.Value})):[],honor:Number(p.HonorPoint||0)};
}

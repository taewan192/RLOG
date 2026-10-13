import { env } from 'cloudflare:workers';
import { parseNotices, parseEvents, cleanProfile, officialURL, apiDate } from './parsers';
import { cleanArmory } from './armory';
const API='https://developer-lostark.game.onstove.com';
const memo=new Map<string,{data:any;expiry:number}>();
const pending=new Map<string,Promise<any>>();
let minute=0,calls=0,blockedUntil=0;
const stamp=()=>new Date().toISOString();
class AppError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
const key=()=>String(env.LOSTARK_API_KEY||'').replace(/\s/g,'');
function db(){if(!env.DB)throw new AppError(503,'DATABASE_UNAVAILABLE','저장소 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.');return env.DB;}
async function cached(id:string,ttl:number,load:()=>Promise<any>){const c=memo.get(id);if(c&&c.expiry>Date.now())return c.data;if(pending.has(id))return pending.get(id);const p=load().then(data=>{if(memo.size>300)memo.delete(memo.keys().next().value!);memo.set(id,{data,expiry:Date.now()+ttl});return data;}).finally(()=>pending.delete(id));pending.set(id,p);return p;}
async function official(path:string,body?:any):Promise<any>{
  if(!key())throw new AppError(503,'API_KEY_MISSING','공식 API 연결을 준비 중입니다.');
  if(blockedUntil>Date.now())throw new AppError(429,'RATE_LIMIT','공식 API 요청량이 많습니다. 잠시 후 다시 시도해 주세요.');
  const m=Math.floor(Date.now()/60000);if(minute!==m){minute=m;calls=0;}if(++calls>85)throw new AppError(429,'RATE_LIMIT','조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  let r:Response;try{r=await fetch(API+path,{method:body?'POST':'GET',headers:{authorization:'bearer '+key(),accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{throw new AppError(502,'API_NETWORK','공식 서버 응답이 지연되고 있습니다.');}
  if(r.status===401||r.status===403)throw new AppError(503,'API_AUTH','공식 API 키 인증에 실패했습니다. 사이트 운영자의 키 확인이 필요합니다.');
  if(r.status===429){blockedUntil=Date.now()+60000;throw new AppError(429,'RATE_LIMIT','공식 API 조회 한도에 도달했습니다. 1분 후 다시 시도해 주세요.');}
  if(r.status===404)return null;
  if(!r.ok)throw new AppError(502,'API_ERROR','공식 API가 일시적으로 응답하지 않습니다.');
  try{return await r.json();}catch{throw new AppError(502,'API_RESPONSE','공식 응답을 읽지 못했습니다.');}
}
async function publicHTML(path:string){const r=await fetch('https://lostark.game.onstove.com'+path,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new AppError(502,'NEWS_UNAVAILABLE','공식 소식을 불러오지 못했습니다.');return r.text();}
async function news(type:'notices'|'events'){
  return cached('news:'+type,300000,async()=>{
    try{const raw=await official('/news/'+type);if(!Array.isArray(raw))throw Error('invalid');const items=raw.map((n:any)=>({...n,Link:officialURL(n.Link),Thumbnail:n.Thumbnail?officialURL(n.Thumbnail):undefined})).filter((n:any)=>n.Link);return {items,source:'official-api',updatedAt:stamp()};}
    catch{if(type==='notices'){const items=parseNotices(await publicHTML('/News/Notice/List'));if(!items.length)throw new AppError(502,'NEWS_UNAVAILABLE','공식 공지 목록을 읽지 못했습니다.');return {items,source:'official-web',updatedAt:stamp()};}
      const html=await publicHTML('/News/Event/Now');let items=parseEvents(html);if(/paging\.page\(2\)/.test(html)){try{items.push(...parseEvents(await publicHTML('/News/Event/Now?page=2')));}catch{}}
      items=[...new Map(items.map(n=>[n.Link,n])).values()].filter(n=>!n.EndDate||apiDate(n.EndDate).getTime()>Date.now());if(!items.length)throw new AppError(502,'NEWS_UNAVAILABLE','진행 중인 공식 이벤트를 읽지 못했습니다.');return {items,source:'official-web',updatedAt:stamp()};}
  });
}
async function character(name:string){
  if(!name||name.length>24||/[\x00-\x1f]/.test(name))throw new AppError(400,'INVALID_NAME','캐릭터 이름을 확인해 주세요.');
  const data=await cached('character:'+name,120000,async()=>{const raw=await official('/armories/characters/'+encodeURIComponent(name)+'/profiles');if(!raw?.CharacterName)throw new AppError(404,'NOT_FOUND','캐릭터를 찾지 못했습니다. 이름을 확인해 주세요.');return cleanProfile(raw);});
  await db().prepare(`INSERT INTO characters(name,server,job,guild,item_level,combat_power,profile,updated_at,searches) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(name) DO UPDATE SET server=excluded.server,job=excluded.job,guild=excluded.guild,item_level=excluded.item_level,combat_power=excluded.combat_power,profile=excluded.profile,updated_at=excluded.updated_at,searches=characters.searches+1`).bind(data.name,data.server,data.job,data.guild,data.level,data.power,JSON.stringify(data),stamp()).run();
  return {profile:data,updatedAt:stamp(),source:'official-api'};
}
async function portrait(name:string){
  if(!name||name.length>24||/[\x00-\x1f]/.test(name))throw new AppError(400,'INVALID_NAME','캐릭터 이름을 확인해 주세요.');
  return cached('portrait:'+name,600000,async()=>{
    const raw=await official('/armories/characters/'+encodeURIComponent(name)+'/profiles');
    if(!raw?.CharacterName)throw new AppError(404,'NOT_FOUND','공개된 캐릭터 이미지가 없습니다.');
    return cleanProfile(raw);
  });
}
async function characterGuild(name:string){
  if(!name||name.length>24||/[\x00-\x1f]/.test(name))throw new AppError(400,'INVALID_NAME','캐릭터 이름을 확인해 주세요.');
  const profile=await cached('character:'+name,120000,async()=>{
    const raw=await official('/armories/characters/'+encodeURIComponent(name)+'/profiles');
    if(!raw?.CharacterName)throw new AppError(404,'NOT_FOUND','캐릭터를 찾지 못했습니다.');
    return cleanProfile(raw);
  });
  if(!profile.guild)return {profile,members:[],summary:null,updatedAt:stamp(),scope:'RLOG에 조회된 같은 서버·같은 길드 캐릭터 기준'};
  const [members,summary]=await Promise.all([
    db().prepare('SELECT profile,updated_at FROM characters WHERE guild=? AND server=? ORDER BY item_level DESC,name ASC LIMIT 100').bind(profile.guild,profile.server).all(),
    db().prepare('SELECT COUNT(*) AS count,MAX(item_level) AS max_level,AVG(item_level) AS avg_level FROM characters WHERE guild=? AND server=?').bind(profile.guild,profile.server).first(),
  ]);
  return {profile,members:members.results.map((r:any)=>({...JSON.parse(r.profile),updatedAt:r.updated_at})),summary,updatedAt:stamp(),scope:'RLOG에 조회된 같은 서버·같은 길드 캐릭터 기준'};
}
async function guildMembers(guild:string,server:string,pageValue:string){
  if(!guild||!server||guild.length>40||server.length>40||/[\x00-\x1f]/.test(guild+server))throw new AppError(400,'INVALID_GUILD','길드 이름과 서버를 확인해 주세요.');
  const requested=Number(pageValue||1);
  if(!Number.isInteger(requested)||requested<1||requested>100000)throw new AppError(400,'INVALID_PAGE','페이지를 확인해 주세요.');
  const pageSize=12;
  const summary=await db().prepare('SELECT COUNT(*) AS count FROM characters WHERE guild=? AND server=?').bind(guild,server).first();
  const total=Number((summary as any)?.count||0),pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requested,pages);
  const rows=await db().prepare('SELECT profile,updated_at FROM characters WHERE guild=? AND server=? ORDER BY item_level DESC,name ASC LIMIT ? OFFSET ?').bind(guild,server,pageSize,(page-1)*pageSize).all();
  return {guild,server,items:rows.results.map((r:any)=>({...JSON.parse(r.profile),guild,server,updatedAt:r.updated_at})),total,page,pageSize,pages,scope:'RLOG에 조회된 같은 서버·같은 길드 캐릭터 기준',updatedAt:stamp()};
}
async function armory(name:string){
  if(!name||name.length>24||/[\x00-\x1f]/.test(name))throw new AppError(400,'INVALID_NAME','캐릭터 이름을 확인해 주세요.');
  const data=await cached('armory:'+name,120000,async()=>{
    const raw=await official('/armories/characters/'+encodeURIComponent(name));if(!raw?.ArmoryProfile?.CharacterName)throw new AppError(404,'NOT_FOUND','캐릭터를 찾지 못했습니다. 이름을 확인해 주세요.');
    const value=cleanArmory(raw);
    await Promise.allSettled(value.engravings.filter(e=>!e.image).map(async e=>{
      const image=await cached('engraving-image:'+e.name+':'+e.grade,86400000,async()=>{
        const books=await official('/markets/items',{Sort:'GRADE',CategoryCode:40000,ItemName:e.name+' 각인서',PageNo:1,SortCondition:'DESC'});
        const candidates=(books?.Items||[]).filter((i:any)=>String(i.Name||'').includes(e.name+' 각인서'));const match=candidates.find((i:any)=>i.Grade===e.grade)||candidates[0];return officialURL(match?.Icon||'');
      });if(image){e.image=image;e.imageSource='official-engraving-book';}
    }));return value;
  });
  const p=data.profile;
  // Update the snapshot used for rankings without counting a second search.
  await db().prepare(`INSERT INTO characters(name,server,job,guild,item_level,combat_power,profile,updated_at,searches) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(name) DO UPDATE SET server=excluded.server,job=excluded.job,guild=excluded.guild,item_level=excluded.item_level,combat_power=excluded.combat_power,profile=excluded.profile,updated_at=excluded.updated_at`).bind(p.name,p.server,p.job,p.guild,p.level,p.power,JSON.stringify(p),stamp()).run();
  const rank=await db().prepare(`SELECT COUNT(*) AS total,1+COALESCE(SUM(CASE WHEN item_level>? THEN 1 ELSE 0 END),0) AS item_rank,1+COALESCE(SUM(CASE WHEN combat_power>? THEN 1 ELSE 0 END),0) AS power_rank,COALESCE(SUM(CASE WHEN server=? THEN 1 ELSE 0 END),0) AS server_total,1+COALESCE(SUM(CASE WHEN server=? AND item_level>? THEN 1 ELSE 0 END),0) AS server_item_rank,1+COALESCE(SUM(CASE WHEN server=? AND combat_power>? THEN 1 ELSE 0 END),0) AS server_power_rank FROM characters WHERE job=?`).bind(p.level,p.power,p.server,p.server,p.level,p.server,p.power,p.job).first();
  return {...data,rankings:{...(rank as any),job:p.job,server:p.server,scope:'RLOG에 조회된 같은 직업 캐릭터 기준',metric:'아이템 레벨 / 전투력',ties:'동점 공동 순위'},updatedAt:stamp(),source:'official-api'};
}
function respond(data:any,status=200){return Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function json(request:Request){if(Number(request.headers.get('content-length')||0)>12000)throw new AppError(413,'TOO_LARGE','입력 내용이 너무 깁니다.');const text=await request.text();if(text.length>12000)throw new AppError(413,'TOO_LARGE','입력 내용이 너무 깁니다.');try{return JSON.parse(text);}catch{throw new AppError(400,'INVALID_JSON','입력 형식을 확인해 주세요.');}}
export async function handleAPI(request:Request,path:string[]){
  try{
    const url=new URL(request.url),route=path.join('/');
    if(request.method==='POST'&&request.headers.get('origin')!==url.origin)throw new AppError(403,'ORIGIN','다시 페이지를 열고 시도해 주세요.');
    if(route==='notices'&&request.method==='GET')return respond(await news('notices'));
    if(route==='events'&&request.method==='GET')return respond(await news('events'));
    if(route==='status'&&request.method==='GET'){
      try{await cached('status',60000,()=>official('/markets/options'));return respond({connected:true,updatedAt:stamp()});}
      catch(e){const x=e as AppError;return respond({connected:false,code:x.code||'API_ERROR',message:x.message,updatedAt:stamp()});}
    }
    if(route==='character'&&request.method==='GET')return respond(await character((url.searchParams.get('name')||'').trim()));
    if(route==='portrait'&&request.method==='GET')return respond({profile:await portrait((url.searchParams.get('name')||'').trim()),source:'official-api'});
    if(route==='character-guild'&&request.method==='GET')return respond(await characterGuild((url.searchParams.get('name')||'').trim()));
    if(route==='armory'&&request.method==='GET')return respond(await armory((url.searchParams.get('name')||'').trim()));
    if(route==='siblings'&&request.method==='GET'){const name=(url.searchParams.get('name')||'').trim();if(!name||name.length>24)throw new AppError(400,'INVALID_NAME','캐릭터 이름을 확인해 주세요.');return respond({items:await cached('siblings:'+name,120000,()=>official('/characters/'+encodeURIComponent(name)+'/siblings'))||[],updatedAt:stamp()});}
    if(route==='calendar'&&request.method==='GET')return respond({items:await cached('calendar',300000,()=>official('/gamecontents/calendar'))||[],source:'official-api',updatedAt:stamp()});
    if(route==='market/options'&&request.method==='GET')return respond({options:await cached('market-options',3600000,()=>official('/markets/options'))});
    if(route==='popular'&&request.method==='GET'){const rows=await db().prepare('SELECT profile,searches FROM characters ORDER BY searches DESC,name ASC LIMIT 5').all();return respond({items:rows.results.map((r:any)=>({...JSON.parse(r.profile),searches:r.searches}))});}
    if(route==='market/search'&&request.method==='POST'){
      const input=await json(request);const category=Number(input.CategoryCode);if(!Number.isInteger(category)||category<=0||category>999999)throw new AppError(400,'INVALID_CATEGORY','거래소 분류를 선택해 주세요.');const sort=['CURRENT_MIN_PRICE','YDAY_AVG_PRICE','RECENT_PRICE','GRADE'].includes(input.Sort)?input.Sort:'CURRENT_MIN_PRICE';
      const body={Sort:sort,CategoryCode:category,ItemName:String(input.ItemName||'').slice(0,50),PageNo:Math.max(1,Math.min(100,Number(input.PageNo)||1)),SortCondition:input.SortCondition==='DESC'?'DESC':'ASC',...(input.ItemTier?{ItemTier:Number(input.ItemTier)}:{})};
      return respond({data:await cached('market:'+JSON.stringify(body),60000,()=>official('/markets/items',body)),updatedAt:stamp()});
    }
    if(route==='ranking'&&request.method==='GET'){
      const server=url.searchParams.get('server')||'',sort=url.searchParams.get('sort')==='power'?'combat_power':'item_level';
      const rows=server?await db().prepare(`SELECT profile,updated_at,searches FROM characters WHERE server=? ORDER BY ${sort} DESC,name ASC LIMIT 100`).bind(server).all():await db().prepare(`SELECT profile,updated_at,searches FROM characters ORDER BY ${sort} DESC,name ASC LIMIT 100`).all();
      return respond({items:rows.results.map((r:any)=>({...JSON.parse(r.profile),updatedAt:r.updated_at,searches:r.searches})),scope:'RLOG에 조회된 캐릭터 기준',updatedAt:stamp()});
    }
    if(route==='stats'&&request.method==='GET'){const [jobs,servers,total]=await Promise.all([db().prepare('SELECT job AS label,COUNT(*) AS count,AVG(item_level) AS avg_level FROM characters GROUP BY job ORDER BY count DESC').all(),db().prepare('SELECT server AS label,COUNT(*) AS count FROM characters GROUP BY server ORDER BY count DESC').all(),db().prepare('SELECT COUNT(*) AS count FROM characters').first()]);return respond({jobs:jobs.results,servers:servers.results,total:(total as any)?.count||0,scope:'RLOG에 조회된 캐릭터 기준',updatedAt:stamp()});}
    if(route==='guilds'&&request.method==='GET'){const query=(url.searchParams.get('q')||'').trim().slice(0,40);const rows=await db().prepare(`SELECT guild,server,COUNT(*) AS count,MAX(item_level) AS max_level,AVG(item_level) AS avg_level FROM characters WHERE guild IS NOT NULL AND guild<>'' AND (?='' OR instr(guild,?)>0) GROUP BY guild,server ORDER BY count DESC,max_level DESC LIMIT 100`).bind(query,query).all();return respond({items:rows.results,scope:'RLOG에 조회된 길드 소속 캐릭터 기준'});}
    if(route==='guild-members'&&request.method==='GET')return respond(await guildMembers((url.searchParams.get('guild')||'').trim(),(url.searchParams.get('server')||'').trim(),url.searchParams.get('page')||'1'));
    if(route==='feedback'){
      const user=request.headers.get('oai-authenticated-user-id');if(!user)throw new AppError(401,'LOGIN_REQUIRED','건의·제보를 남기려면 로그인해 주세요.');
      if(request.method==='GET'){const rows=await db().prepare('SELECT id,category,title,body,status,created_at FROM feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(user).all();return respond({items:rows.results});}
      if(request.method==='POST'){const body=await json(request);const category=['건의','버그 제보','데이터 오류','기타'].includes(body.category)?body.category:'기타';const title=String(body.title||'').trim(),text=String(body.body||'').trim();if(title.length<2||title.length>100||text.length<5||text.length>3000)throw new AppError(400,'INVALID_FEEDBACK','제목은 2~100자, 내용은 5~3000자로 입력하세요.');const limit=await db().prepare('SELECT COUNT(*) AS count FROM feedback WHERE user_id=? AND created_at>?').bind(user,new Date(Date.now()-3600000).toISOString()).first();if(Number((limit as any)?.count)>9)throw new AppError(429,'FEEDBACK_LIMIT','한 시간에 최대 10건까지 접수할 수 있습니다.');const id=crypto.randomUUID();await db().prepare('INSERT INTO feedback(id,user_id,category,title,body,status,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,user,category,title,text,'접수',stamp()).run();return respond({id,status:'접수',message:'건의·제보가 저장되었습니다.'},201);}
    }
    throw new AppError(404,'NOT_FOUND','요청한 기능을 찾지 못했습니다.');
  }catch(error){const e=error as AppError;return respond({error:{code:e.code||'SERVER_ERROR',message:e.code?e.message:'일시적인 서버 오류입니다. 잠시 후 다시 시도해 주세요.'}},e.status||500);}
}

import * as XLSX from "npm:xlsx@0.18.5";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const SOURCE_ID_ENV=Deno.env.get('GOOGLE_DRIVE_SOURCE_ID')||'';
const SERVICE_ACCOUNT_JSON=Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')||'';
const CACHE_MS=60000;
const HARD_REFRESH_MIN_MS=15000;
const enc=new TextEncoder();
let workbookCache:{at:number;fetchedAt:string;workbook:any;sourceMode:string}|null=null;
let googleTokenCache:{token:string;expiresAt:number}|null=null;
let sourceIdCache='';

function allowedOrigin(o:string){return o==='https://etos-palu.vercel.app'||/^https:\/\/etos-palu-[a-z0-9-]+-etosidpalu\.vercel\.app$/i.test(o)||/^http:\/\/localhost(?::\d+)?$/i.test(o)}
function cors(req:Request){
  const o=req.headers.get('origin')||'';
  return {'Access-Control-Allow-Origin':allowedOrigin(o)?o:'https://etos-palu.vercel.app','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
}
function json(req:Request,body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}})}
function clean(v:any){return v==null?'':String(v).trim()}
async function sha(v:string){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)));return[...h].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function db(path:string,opt:RequestInit={}){
  if(!SUPABASE_URL||!SERVICE_ROLE)throw new Error('Konfigurasi server Supabase belum tersedia.');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opt,headers:{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,'Content-Type':'application/json',Accept:'application/json',...(opt.headers||{})}});
  const raw=await r.text();let data:any=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
  if(!r.ok)throw new Error((data&&data.message)||raw||`Supabase ${r.status}`);return data;
}
async function sourceId(){
  if(clean(SOURCE_ID_ENV))return clean(SOURCE_ID_ENV);
  if(sourceIdCache)return sourceIdCache;
  const rows=await db('etos_server_settings?select=setting_value&setting_key=eq.google_drive_source_id&limit=1');
  const value=clean(rows&&rows[0]?.setting_value);if(!value)throw new Error('ID sumber Google Drive belum dikonfigurasi pada server.');
  sourceIdCache=value;return value;
}
async function requireSession(token:string){
  token=clean(token);if(!token)throw new Error('Sesi fasilitator diperlukan.');
  const h=await sha(token),now=new Date().toISOString();
  const rows=await db(`etos_access_sessions?select=id,scopes&token_hash=eq.${h}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&limit=1`);
  const s=rows&&rows[0];if(!s)throw new Error('Sesi akses berakhir. Masukkan sandi kembali.');
  if(!(s.scopes||[]).includes('facilitator'))throw new Error('Sesi tidak memiliki hak akses fasilitator.');
  return s;
}
function b64urlBytes(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64urlText(s:string){return b64urlBytes(enc.encode(s))}
function pemBytes(pem:string){const b64=pem.replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s+/g,'');const raw=atob(b64);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function serviceAccountConfigured(){return clean(SERVICE_ACCOUNT_JSON)!==''}
async function googleAccessToken(){
  if(!serviceAccountConfigured())return '';
  if(googleTokenCache&&Date.now()<googleTokenCache.expiresAt-60000)return googleTokenCache.token;
  let c:any;try{c=JSON.parse(SERVICE_ACCOUNT_JSON)}catch{throw new Error('Konfigurasi Google service account tidak valid.');}
  if(!c?.client_email||!c?.private_key)throw new Error('Google service account belum lengkap.');
  const now=Math.floor(Date.now()/1000),header={alg:'RS256',typ:'JWT'},payload={iss:c.client_email,scope:'https://www.googleapis.com/auth/drive.readonly',aud:c.token_uri||'https://oauth2.googleapis.com/token',iat:now,exp:now+3600};
  const input=`${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(payload))}`;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(c.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(input)));
  const assertion=`${input}.${b64urlBytes(sig)}`;
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
  const r=await fetch(c.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const data=await r.json().catch(()=>null);if(!r.ok||!data?.access_token)throw new Error('Google service account gagal memperoleh access token.');
  googleTokenCache={token:String(data.access_token),expiresAt:Date.now()+Number(data.expires_in||3600)*1000};return googleTokenCache.token;
}
async function fetchSourceFile(){
  const id=await sourceId();
  if(serviceAccountConfigured()){
    const token=await googleAccessToken();
    const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/octet-stream'}});
    if(!r.ok)throw new Error(`Sumber IDP terautentikasi tidak dapat dibaca (HTTP ${r.status}).`);
    return {bytes:new Uint8Array(await r.arrayBuffer()),sourceMode:'google_drive_authenticated'};
  }
  const r=await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,{redirect:'follow',headers:{'User-Agent':'ETOS-IDP-Live/4.0'}});
  if(!r.ok)throw new Error(`Sumber IDP transisi tidak dapat dibaca (HTTP ${r.status}).`);
  return {bytes:new Uint8Array(await r.arrayBuffer()),sourceMode:'google_drive_public_transition'};
}
function normalizeName(value:any){let s=clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();s=s.replace(/^\s*\d+\s*[.\-_:)]*\s*/,'').replace(/^\s*(idp|pdp|individual\s+development\s+plan)\s*[.\-_:]*\s*/i,'').replace(/\s*[.\-_:]*\s*(idp|pdp|individual\s+development\s+plan)\s*$/i,'').replace(/\s*[\[(]?20\d{2}[\])]?\s*$/i,'').replace(/\s*[.\-_:]*\s*angkatan\s*20\d{2}\s*$/i,'');return s.replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function sheetAliases(name:string){const raw=clean(name),vars=[raw,raw.replace(/^\s*\d+\s*[.\-_:)]*\s*/,''),raw.replace(/^\s*(idp|pdp|individual\s+development\s+plan)\s*[.\-_:]*\s*/i,''),raw.replace(/\s*[.\-_:]*\s*(idp|pdp|individual\s+development\s+plan)\s*$/i,''),raw.replace(/\s*[\[(]?20\d{2}[\])]?\s*$/i,''),raw.replace(/\s*[.\-_:]*\s*angkatan\s*20\d{2}\s*$/i,'')];return[...new Set(vars.map(normalizeName).filter(Boolean))]}
function findSheet(workbook:any,personName:string){const target=normalizeName(personName);let fuzzy:string|null=null;for(const name of workbook.SheetNames||[]){const aliases=sheetAliases(name);if(aliases.includes(target))return name;if(!fuzzy&&aliases.some(a=>a.length>4&&(a.includes(target)||target.includes(a))))fuzzy=name}return fuzzy}
function displayRows(ws:any){const raw:any[][]=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:true});let lastRow=-1,lastCol=-1;for(let r=0;r<raw.length;r++){const row=raw[r]||[];for(let c=0;c<row.length;c++){if(clean(row[c])!==''){if(r>lastRow)lastRow=r;if(c>lastCol)lastCol=c}}}if(lastRow<0||lastCol<0)return[];const out:any[][]=[];for(let r=0;r<=lastRow;r++){const src=raw[r]||[],row:any[]=[];for(let c=0;c<=lastCol;c++)row.push(src[c]==null?'':String(src[c]));out.push(row)}return out}
function stats(values:any[][]){let filledRows=0,filledCells=0,lastColumn=0;for(const row of values){let rowFilled=false;lastColumn=Math.max(lastColumn,row.length);for(const v of row)if(clean(v)!==''){filledCells++;rowFilled=true}if(rowFilled)filledRows++}return{filledRows,filledCells,lastRow:values.length,lastColumn}}
async function getWorkbook(force=false){
  const now=Date.now();
  if(workbookCache&&now-workbookCache.at<HARD_REFRESH_MIN_MS)return workbookCache;
  if(!force&&workbookCache&&now-workbookCache.at<CACHE_MS)return workbookCache;
  const source=await fetchSourceFile();const workbook=XLSX.read(source.bytes,{type:'array',cellDates:false,raw:false});
  workbookCache={at:now,fetchedAt:new Date().toISOString(),workbook,sourceMode:source.sourceMode};return workbookCache;
}
async function activeAwardees(){const rows=await db('awardees?select=id,awardee_code,name,cohort,status&order=name.asc');return(rows||[]).filter((a:any)=>clean(a.status).toLowerCase()==='aktif')}
async function cacheSnapshots(items:any[],fetchedAt:string,sourceMode:string){
  const body=items.filter(x=>x.connected&&x.values).map(x=>({awardee_id:x.uuid,source_file:'IDP Pusat — cache server',source_sheet:x.sheetName,source_updated_at:fetchedAt,values_json:x.values,summary:{filledRows:x.filledRows,filledCells:x.filledCells,lastRow:x.lastRow,lastColumn:x.lastColumn,truncated:false,source_mode:sourceMode,sourceType:sourceMode,fetched_at:fetchedAt},legacy_source:'google_drive_live',updated_at:fetchedAt}));
  if(!body.length)return;await db('idp_snapshots?on_conflict=awardee_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
}
async function buildLive(force=false){const [{workbook,fetchedAt,sourceMode},awardees]=await Promise.all([getWorkbook(force),activeAwardees()]);const items:any[]=[];for(const a of awardees){const sheetName=findSheet(workbook,a.name);if(!sheetName){items.push({uuid:a.id,id:a.awardee_code,nama:a.name,angkatan:a.cohort,status:a.status,connected:false,sheetName:'',filledRows:0,filledCells:0,lastRow:0,lastColumn:0,truncated:false,sourceType:sourceMode,fetchedAt});continue}const values=displayRows(workbook.Sheets[sheetName]),st=stats(values);items.push({uuid:a.id,id:a.awardee_code,nama:a.name,angkatan:a.cohort,status:a.status,connected:true,sheetName,values,...st,truncated:false,sourceType:sourceMode,fetchedAt})}try{await cacheSnapshots(items,fetchedAt,sourceMode)}catch(e){console.error('[IDP cache]',e)}return{items,fetchedAt,sheetCount:(workbook.SheetNames||[]).length,sourceMode}}
async function fallbackOverview(){const awardees=await activeAwardees(),snaps=await db('idp_snapshots?select=awardee_id,source_sheet,source_updated_at,summary'),byId=new Map((snaps||[]).map((s:any)=>[s.awardee_id,s]));const items=awardees.map((a:any)=>{const s:any=byId.get(a.id),m=s?.summary||{};return{id:a.awardee_code,nama:a.name,angkatan:a.cohort,status:a.status,connected:!!s,sheetName:s?.source_sheet||'',filledRows:Number(m.filledRows||0),filledCells:Number(m.filledCells||0),lastRow:Number(m.lastRow||0),lastColumn:Number(m.lastColumn||0),truncated:!!m.truncated,sourceType:'supabase_fallback_cache',sourceUpdatedAt:s?.source_updated_at||''}}),connected=items.filter((x:any)=>x.connected).length;return{sourceName:'IDP Pusat — cache server',sourceMode:'fallback_cache',totalActive:items.length,connected,missing:items.length-connected,items}}
async function fallbackDetail(key:string){const awardees=await activeAwardees(),needle=normalizeName(key),a=awardees.find((x:any)=>normalizeName(x.name)===needle||clean(x.awardee_code).toLowerCase()===clean(key).toLowerCase());if(!a)throw new Error('Awardee aktif tidak ditemukan.');const rows=await db(`idp_snapshots?select=source_sheet,source_updated_at,values_json,summary&awardee_id=eq.${a.id}&limit=1`),s=rows&&rows[0];if(!s)throw new Error('Live IDP gagal dan cache server belum tersedia.');const values=s.values_json||[];return{nama:a.name,angkatan:a.cohort,status:a.status,sheetName:s.source_sheet||'-',sourceName:'IDP Pusat — cache server',sourceMode:'fallback_cache',values,totalRows:values.length,totalColumns:Number(s.summary?.lastColumn||0),truncated:!!s.summary?.truncated,sourceUpdatedAt:s.source_updated_at||''}}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method==='GET')return json(req,{success:false,error:'Method not allowed'},405);
  if(req.method!=='POST')return json(req,{success:false,error:'Method not allowed'},405);
  try{
    const b=await req.json().catch(()=>({}));await requireSession(clean(b.token));
    const action=clean(b.action),payload=b.payload||{};
    if(action==='getIDPOverview'){
      try{const live=await buildLive(!!payload.forceRefresh),items=live.items.map(({values,uuid,...x}:any)=>x),connected=items.filter((x:any)=>x.connected).length;return json(req,{success:true,data:{sourceName:live.sourceMode==='google_drive_authenticated'?'IDP Pusat — LIVE authenticated':'IDP Pusat — LIVE transition',sourceMode:live.sourceMode,fetchedAt:live.fetchedAt,totalActive:items.length,connected,missing:items.length-connected,items}})}catch{return json(req,{success:true,data:await fallbackOverview()})}
    }
    if(action==='getIDPDetail'){
      const key=clean(payload.nama||payload.id_awardee||payload.id);if(!key)throw new Error('Nama mahasiswa IDP tidak ditemukan pada permintaan.');
      try{const live=await buildLive(!!payload.forceRefresh),needle=normalizeName(key),item=live.items.find((x:any)=>normalizeName(x.nama)===needle||clean(x.id).toLowerCase()===key.toLowerCase());if(!item||!item.connected)throw new Error('Tab IDP awardee belum ditemukan pada file pusat.');return json(req,{success:true,data:{nama:item.nama,angkatan:item.angkatan,status:item.status,sheetName:item.sheetName,sourceName:live.sourceMode==='google_drive_authenticated'?'IDP Pusat — LIVE authenticated':'IDP Pusat — LIVE transition',sourceMode:live.sourceMode,fetchedAt:live.fetchedAt,values:item.values,totalRows:item.lastRow,totalColumns:item.lastColumn,truncated:false}})}catch{return json(req,{success:true,data:await fallbackDetail(key)})}
    }
    throw new Error('Endpoint Live IDP belum dipetakan.');
  }catch(e:any){return json(req,{success:false,error:e?.message||String(e)},200)}
});

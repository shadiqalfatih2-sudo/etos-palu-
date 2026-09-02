const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const SESSION_SECONDS=21600;
const CREDENTIAL_KEY='admin_facilitator';
const enc=new TextEncoder();
const clean=(v:any)=>v==null?'':String(v).trim();
const OPS_PUBLIC=new Set(['getPeriodePembinaanList','getAbsensiList']);
const OPS_SECURE=new Set(['getCoachingList','saveCoaching','getAbsensiEntryOptions','saveAbsensiEntry','savePeriodePembinaan']);
const PUBLIC_REFLECTION=new Set(['getPublicKajianReflectionForm','verifyKajianReflectionParticipant','submitKajianReflection']);
const PARITY_WRITE=new Set(['saveAwardee','saveAkademik','savePrestasi','saveOrganisasi','saveAlumniPortfolio','saveAwardeePhoto']);
const ASSESSMENT=new Set(['getAssessmentHub','verifyAssessmentAccess','saveAssessment']);
const ANALYSIS=new Set(['analyzeAwardeeWithRules']);
const AWARDEE360=new Set(['getAwardee360']);
const PROFILE=new Set(['getAwardeeProfile']);
const ALUMNI=new Set(['getAlumniList']);
const ADMIN=new Set(['getAbsensiEntryOptions','saveAbsensiEntry','savePeriodePembinaan']);
function allowedOrigin(o:string){return o==='https://etos-palu.vercel.app'||/^https:\/\/etos-palu-[a-z0-9-]+-etosidpalu\.vercel\.app$/i.test(o)||/^http:\/\/localhost(?::\d+)?$/i.test(o)}
function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':allowedOrigin(o)?o:'https://etos-palu.vercel.app','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}}
function json(req:Request,body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}})}
function b64Bytes(s:string){const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0))}
function bytesB64(a:Uint8Array){let s='';for(const b of a)s+=String.fromCharCode(b);return btoa(s)}
function hex(a:Uint8Array){return[...a].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sha(v:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v))))}
async function pbkdf2(pin:string,salt:Uint8Array,it:number){const k=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:it},k,256))}
function same(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0}
function randomToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return bytesB64(a).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function db(path:string,opt:any={}){if(!SUPABASE_URL||!SERVICE_ROLE)throw new Error('Konfigurasi server Supabase belum tersedia.');const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opt,headers:{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,'Content-Type':'application/json',Accept:'application/json',Prefer:'return=representation',...(opt.headers||{})}});const raw=await r.text();let data:any=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}if(!r.ok)throw new Error((data&&data.message)||raw||`Supabase ${r.status}`);return data}
const rows=(t:string,q='select=*')=>db(`${t}?${q}`).then((x:any)=>x||[]);
const insert=(t:string,b:any)=>db(t,{method:'POST',body:JSON.stringify(b)});
const patch=(t:string,q:string,b:any)=>db(`${t}?${q}`,{method:'PATCH',body:JSON.stringify(b)});
async function rpc(name:string,body:any){return await db(`rpc/${name}`,{method:'POST',body:JSON.stringify(body||{})})}
async function login(req:Request,pin:string){
  pin=clean(pin);if(pin.length<6)throw new Error('Sandi minimal 6 karakter.');
  const ip=clean(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0];
  const source=await sha(`etos-v2:${ip}`),since=new Date(Date.now()-300000).toISOString();
  const [events,globalFailures]=await Promise.all([
    rows('etos_access_login_events',`select=success&source_hash=eq.${source}&created_at=gte.${encodeURIComponent(since)}&limit=20`),
    rows('etos_access_login_events',`select=id&success=eq.false&created_at=gte.${encodeURIComponent(since)}&limit=60`)
  ]);
  if(events.filter((x:any)=>!x.success).length>=10||globalFailures.length>=50)throw new Error('Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.');
  const c=(await rows('etos_access_credentials',`select=*&credential_key=eq.${CREDENTIAL_KEY}&limit=1`))[0];
  if(!c||!c.enabled)throw new Error('Akses admin/fasilitator belum dikonfigurasi.');
  const ok=same(await pbkdf2(pin,b64Bytes(c.salt_b64),Number(c.iterations)),b64Bytes(c.hash_b64));
  await insert('etos_access_login_events',{source_hash:source,success:ok});
  if(!ok){await new Promise(r=>setTimeout(r,250));throw new Error('Sandi tidak sesuai.');}
  const token=randomToken(),tokenHash=await sha(token),expiresAt=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();
  await insert('etos_access_sessions',{token_hash:tokenHash,credential_key:CREDENTIAL_KEY,scopes:['facilitator','admin'],expires_at:expiresAt});
  return{token,expiresInSeconds:SESSION_SECONDS,expiresAt};
}
async function requireSession(token:string,scope:string){token=clean(token);if(!token)throw new Error(scope==='admin'?'Silakan masuk sebagai admin.':'Sesi fasilitator diperlukan.');const h=await sha(token),now=new Date().toISOString();const s=(await rows('etos_access_sessions',`select=*&token_hash=eq.${h}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&limit=1`))[0];if(!s)throw new Error(scope==='admin'?'Sesi admin berakhir. Silakan masuk kembali.':'Sesi akses berakhir. Masukkan sandi kembali.');if(scope&&!(s.scopes||[]).includes(scope))throw new Error('Sesi tidak memiliki hak akses yang diperlukan.');await patch('etos_access_sessions',`id=eq.${s.id}`,{last_seen_at:now});return s}
async function logout(token:string){token=clean(token);if(!token)return{};await patch('etos_access_sessions',`token_hash=eq.${await sha(token)}`,{revoked_at:new Date().toISOString()});return{}}
async function refreshLiveIdp(token:string){try{const r=await fetch(`${SUPABASE_URL}/functions/v1/etos-idp-live`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'getIDPOverview',payload:{forceRefresh:true},token})});const raw=await r.text();let data:any=null;try{data=raw?JSON.parse(raw):null}catch{}if(!r.ok||!data||data.success!==true)throw new Error((data&&data.error)||raw||`IDP refresh ${r.status}`);return data.data}catch(e){console.error('[ETOS secure] live IDP refresh failed; using last cache',e);return null}}
async function dispatch(action:string,payload:any,token:string){
  if(PUBLIC_REFLECTION.has(action))return await rpc('etos_v2_public_dispatch',{p_action:action,p_payload:payload||{}});
  if(OPS_PUBLIC.has(action))return await rpc('etos_v2_operations_dispatch',{p_action:action,p_payload:payload||{}});
  const sessionToken=token||payload?.token||payload?.facilitator_token||'';
  await requireSession(sessionToken,ADMIN.has(action)?'admin':'facilitator');
  if(OPS_SECURE.has(action))return await rpc('etos_v2_operations_dispatch',{p_action:action,p_payload:payload||{}});
  if(PARITY_WRITE.has(action))return await rpc('etos_v2_parity_dispatch',{p_action:action,p_payload:payload||{}});
  if(ASSESSMENT.has(action))return await rpc('etos_v2_assessment_dispatch',{p_action:action,p_payload:payload||{}});
  if(ANALYSIS.has(action)){await refreshLiveIdp(sessionToken);return await rpc('etos_v2_analysis_live_dispatch',{p_payload:payload||{}});}
  if(AWARDEE360.has(action)){await refreshLiveIdp(sessionToken);return await rpc('etos_v2_awardee360_dispatch',{p_payload:payload||{}});}
  if(PROFILE.has(action))return await rpc('etos_v2_profile_dispatch',{p_action:action,p_payload:typeof payload==='string'?{value:payload}:(payload||{})});
  if(ALUMNI.has(action))return await rpc('etos_v2_alumni_dispatch',{p_payload:payload||{}});
  return await rpc('etos_v2_secure_dispatch',{p_action:action,p_payload:payload||{}});
}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});if(req.method==='GET')return json(req,{ok:true,service:'etos-secure-api',version:'2026.09.02-auth16-cors-throttle'});if(req.method!=='POST')return json(req,{success:false,error:'Method not allowed'},405);try{const b=await req.json().catch(()=>({})),action=clean(b.action);if(action==='login')return json(req,{success:true,data:await login(req,b.pin||b.payload?.pin||b.payload)});if(action==='logout')return json(req,{success:true,data:await logout(b.token||b.payload?.token||b.payload)});if(!action)throw new Error('Action wajib diisi.');return json(req,{success:true,data:await dispatch(action,b.payload||{},clean(b.token))})}catch(e:any){const msg=e?.message||String(e);return json(req,{success:false,error:msg},/Terlalu banyak percobaan/.test(msg)?429:200)}});

/* ETOS ID PALU V2 — secure compatibility overlay. */
(function(){
  'use strict';
  const URL='https://jrrmgfzfpcrjtyjqpaff.supabase.co/functions/v1/etos-secure-api';
  const IDP_URL='https://jrrmgfzfpcrjtyjqpaff.supabase.co/functions/v1/etos-idp-live';
  const KEY='sb_publishable_VyCXSeR2FaGERAoEUDU5DA_vMigqty3';
  const VERSION='ETOS-V2-SECURE-2026.09.01-AUTH9-LIVE-IDP';
  const baseRun=window.google&&window.google.script&&window.google.script.run;
  if(!baseRun){ console.error('[ETOS secure] base google.script.run shim not found'); return; }

  const IDP=new Set(['getIDPOverview','getIDPDetail']);
  const SECURE=new Set([
    'getAwardeeProfile','getIDPOverview','getIDPDetail','getCoachingList','getFacilitatorAssessmentHub','getFacilitatorAssessmentReport',
    'getMentoringCases','getMentoringCommandCenter','getCohortDevelopmentAnalytics','getAwardee360',
    'getLatestAwardeeRuleAnalysis','analyzeAwardeeWithRules','saveMentoringCase','updateMentoringCase','saveCompetencyEvidence',
    'getAbsensiEntryOptions','saveAbsensiEntry','savePeriodePembinaan','saveCoaching',
    'getFasilitatorProfile','saveFasilitatorProfile','getPeriodePembinaanList','getAbsensiList',
    'getAssessmentHub','saveAssessment',
    'saveAwardee','saveAkademik','savePrestasi','saveOrganisasi','saveAlumniPortfolio','saveAwardeePhoto',
    'getPublicKajianReflectionForm','verifyKajianReflectionParticipant','submitKajianReflection'
  ]);
  const ADMIN=new Set(['getAbsensiEntryOptions','saveAbsensiEntry','savePeriodePembinaan']);
  const PUBLIC=new Set([
    'getPeriodePembinaanList','getAbsensiList',
    'getPublicKajianReflectionForm','verifyKajianReflectionParticipant','submitKajianReflection'
  ]);
  const LOGIN=new Set(['verifyFacilitatorAccess','verifyAbsensiAdminPin']);
  const LOGOUT=new Set(['logoutFacilitatorAccess','logoutAbsensiAdmin']);

  function sessionGet(key){ try{return sessionStorage.getItem(key)||'';}catch(_){return '';} }
  function sessionSetBoth(token){
    try{
      if(token){
        sessionStorage.setItem('etos_facilitator_access_token',String(token));
        sessionStorage.setItem('etos_absensi_admin_token',String(token));
      }
    }catch(_){}
  }
  function sessionClearBoth(){
    try{
      sessionStorage.removeItem('etos_facilitator_access_token');
      sessionStorage.removeItem('etos_absensi_admin_token');
    }catch(_){}
  }
  function pickToken(name,p){
    if(p&&typeof p==='object'){
      if(p.token) return String(p.token);
      if(p.facilitator_token) return String(p.facilitator_token);
    }
    if(PUBLIC.has(name)) return '';
    return ADMIN.has(name)?(sessionGet('etos_absensi_admin_token')||sessionGet('etos_facilitator_access_token')):(sessionGet('etos_facilitator_access_token')||sessionGet('etos_absensi_admin_token'));
  }
  async function edge(action,payload,token,pin,endpoint){
    const target=endpoint||URL;
    const timeout=IDP.has(action)?25000:15000;
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const r=await fetch(target,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:action,payload:payload==null?{}:payload,token:token||'',pin:pin||''}),signal:ctl.signal});
      const raw=await r.text(); let data=null; try{data=raw?JSON.parse(raw):null;}catch(_){data=null;}
      if(!r.ok) throw new Error((data&&data.error)||raw||('HTTP '+r.status));
      if(!data||data.success!==true) throw new Error((data&&data.error)||'Permintaan secure gagal.');
      return data.data;
    } finally { clearTimeout(timer); }
  }
  function delegate(method,args,success,failure){
    try{
      let r=baseRun;
      if(typeof success==='function') r=r.withSuccessHandler(success);
      if(typeof failure==='function') r=r.withFailureHandler(failure);
      r[method].apply(r,args);
    }catch(e){ if(typeof failure==='function')failure(e); else if(typeof success==='function')success({success:false,error:e.message||String(e)}); }
  }
  function ok(success,data){ if(typeof success==='function')success({success:true,data:data}); }
  function fail(success,failure,err){
    const msg=err&&err.message?err.message:String(err);
    if(err&&err.name==='AbortError'){ if(typeof failure==='function')failure(new Error('Koneksi ke server timeout.')); else if(typeof success==='function')success({success:false,error:'Koneksi ke server timeout.'}); return; }
    if(typeof success==='function') success({success:false,error:msg});
    else if(typeof failure==='function') failure(err);
    else console.error('[ETOS secure]',err);
  }
  function runSecure(name,payload,success,failure){
    if(LOGIN.has(name)){
      const pin=typeof payload==='string'?payload:(payload&&payload.pin)||'';
      edge('login',{},'',pin,URL).then(function(d){ sessionSetBoth(d&&d.token); ok(success,d); }).catch(e=>fail(success,failure,e)); return;
    }
    if(LOGOUT.has(name)){
      const token=(typeof payload==='string'?payload:'')||pickToken(name,payload);
      edge('logout',{},token,'',URL).then(function(d){ sessionClearBoth(); ok(success,d||{}); }).catch(e=>fail(success,failure,e)); return;
    }
    const token=pickToken(name,payload);
    const endpoint=IDP.has(name)?IDP_URL:URL;
    let requestPayload=payload||{};
    if(name==='getIDPOverview') requestPayload=Object.assign({},requestPayload,{forceRefresh:true});
    edge(name,requestPayload,token,'',endpoint).then(d=>ok(success,d)).catch(e=>fail(success,failure,e));
  }
  function makeRunner(success,failure){
    return new Proxy({}, {get:function(_,prop){
      if(prop==='withSuccessHandler') return fn=>makeRunner(fn,failure);
      if(prop==='withFailureHandler') return fn=>makeRunner(success,fn);
      return function(){
        const args=[].slice.call(arguments),method=String(prop);
        if(method==='backendInvoke'){
          const name=String(args[0]||''),payload=args[1];
          if(LOGIN.has(name)||LOGOUT.has(name)||SECURE.has(name)){ runSecure(name,payload,success,failure); return; }
          delegate('backendInvoke',args,success,failure); return;
        }
        if(LOGIN.has(method)||LOGOUT.has(method)||SECURE.has(method)){ runSecure(method,args.length<=1?args[0]:args,success,failure); return; }
        delegate(method,args,success,failure);
      };
    }});
  }
  window.google.script.run=makeRunner(null,null);
  window.ETOS_SECURE={version:VERSION,mode:'edge-session',endpoint:URL,idpEndpoint:IDP_URL};
  console.info('[ETOS V2] secure auth overlay ready',VERSION);
})();

/* ETOS V2 — runtime polish: cache coherence + mobile ergonomics + truthful source states. */
(function(){
  'use strict';

  var refreshPromise=null;
  var originalClear=window.clearAllBackendCache;

  if(typeof originalClear==='function'){
    window.clearAllBackendCache=function(){
      var result=originalClear.apply(this,arguments);
      try{
        if(window.ETOS_DIRECT&&typeof window.ETOS_DIRECT.reload==='function'){
          var p=Promise.resolve(window.ETOS_DIRECT.reload());
          refreshPromise=p;
          p.catch(function(err){console.warn('[ETOS cache refresh]',err);})
           .finally(function(){if(refreshPromise===p)refreshPromise=null;});
        }
      }catch(e){console.warn('[ETOS cache invalidate]',e);}
      return result;
    };
  }

  function waitForFreshPublicData(name){
    var original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(){
      var self=this,args=arguments;
      if(refreshPromise)return refreshPromise.then(function(){return original.apply(self,args);},function(){return original.apply(self,args);});
      return original.apply(self,args);
    };
  }
  ['loadDash','loadDropdownOptions','loadAwardeeList','loadAkademikView','loadPrestasiView','loadDetailOrganisasi'].forEach(waitForFreshPublicData);

  /* Remove visual controls that never had a backed feature. */
  try{
    Array.prototype.forEach.call(document.querySelectorAll('header button'),function(button){
      var icon=button.querySelector('[data-lucide="mail"],[data-lucide="bell"]');
      if(icon){button.classList.add('hidden');button.setAttribute('aria-hidden','true');button.setAttribute('tabindex','-1');}
    });
    var fakeGlobalSearch=document.querySelector('header input[placeholder="Search task or data..."]');
    if(fakeGlobalSearch){
      var searchWrap=fakeGlobalSearch.parentElement;
      if(searchWrap){searchWrap.classList.add('hidden');searchWrap.setAttribute('aria-hidden','true');}
    }
  }catch(e){console.warn('[ETOS header cleanup]',e);}

  /* Neutral unauthenticated facilitator header; real values load after session. */
  try{
    var topName=document.getElementById('top-fas-nama');
    var topEmail=document.getElementById('top-fas-email');
    var hasSession=false;
    try{hasSession=!!(sessionStorage.getItem('etos_facilitator_access_token')||sessionStorage.getItem('etos_absensi_admin_token'));}catch(_){}
    if(!hasSession){if(topName)topName.textContent='Profil Fasilitator';if(topEmail)topEmail.textContent='Masuk untuk melihat profil';}
  }catch(e){console.warn('[ETOS facilitator placeholder]',e);}

  /* Awardee 360 must distinguish authenticated live access, transition access, and server cache. */
  var previousRender360=window.renderAwardee360;
  if(typeof previousRender360==='function'){
    window.renderAwardee360=function(data){
      var result=previousRender360.apply(this,arguments);
      try{
        var idp=(data&&data.idp)||{};
        var root=document.getElementById('awardee-360-content');
        if(!root)return result;
        var label=idp.liveAuthenticated?'Cakupan baris terisi • LIVE Authenticated':
          idp.transitionSource?'Cakupan baris terisi • LIVE Transition':
          idp.liveSynced?'Cakupan baris terisi • LIVE':
          'Cakupan baris terisi • Cache Server';
        Array.prototype.forEach.call(root.querySelectorAll('p'),function(p){
          var text=(p.textContent||'').trim();
          if(/^Cakupan baris terisi/.test(text)||text==='Kelengkapan elemen terdeteksi') p.textContent=label;
        });
      }catch(e){console.warn('[ETOS IDP source label]',e);}
      return result;
    };
  }

  /* Small-screen forms: avoid squeezed columns and iOS input zoom. */
  var style=document.createElement('style');
  style.id='etos-batch7-responsive-polish';
  style.textContent='\
@media (max-width: 640px){\
  #modal-add-awd .grid.grid-cols-2,\
  #modal-add-akd .grid.grid-cols-2,\
  #modal-add-prs .grid.grid-cols-2,\
  #modal-add-org .grid.grid-cols-2{grid-template-columns:minmax(0,1fr)!important;}\
  .glass-overlay>.bg-white{padding:1.25rem!important;border-radius:1.25rem!important;}\
  .glass-overlay input,.glass-overlay select,.glass-overlay textarea{font-size:16px!important;max-width:100%!important;}\
  .glass-overlay button{min-height:44px;}\
  #feat-angkatan,#feat-kampus,#feat-status,#alumni-angkatan,#alumni-kampus,#absensi-periode{min-width:0!important;width:100%!important;max-width:100%!important;}\
  #modal-idp-detail,#modal-rule-analysis,#modal-awardee-360,#modal-isi-absensi{padding:.5rem!important;}\
}\
@media (max-width: 420px){\
  #content-area{padding-left:.75rem!important;padding-right:.75rem!important;}\
  .glass-overlay{padding:.5rem!important;}\
}';
  document.head.appendChild(style);

  window.ETOS_RUNTIME_POLISH={version:'ETOS-V2-POLISH-2026.09.02-BATCH10-IDP-SOURCE-MODES'};
})();

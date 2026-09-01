/* ETOS V2 — Batch 7 runtime polish: cache coherence + mobile ergonomics. */
(function(){
  'use strict';

  var refreshPromise=null;
  var originalClear=window.clearAllBackendCache;

  /*
   * Legacy cache and Supabase Direct cache are separate. After a successful
   * write, refresh the public bootstrap once and make public list loaders wait
   * for it, so a saved record is visible immediately instead of up to 45s later.
   */
  if(typeof originalClear==='function'){
    window.clearAllBackendCache=function(){
      var result=originalClear.apply(this,arguments);
      try{
        if(window.ETOS_DIRECT&&typeof window.ETOS_DIRECT.reload==='function'){
          var p=Promise.resolve(window.ETOS_DIRECT.reload());
          refreshPromise=p;
          p.catch(function(err){console.warn('[ETOS cache refresh]',err);})
           .finally(function(){if(refreshPromise===p) refreshPromise=null;});
        }
      }catch(e){console.warn('[ETOS cache invalidate]',e);}
      return result;
    };
  }

  function waitForFreshPublicData(name){
    var original=window[name];
    if(typeof original!=='function') return;
    window[name]=function(){
      var self=this,args=arguments;
      if(refreshPromise){
        return refreshPromise.then(function(){return original.apply(self,args);},function(){return original.apply(self,args);});
      }
      return original.apply(self,args);
    };
  }

  [
    'loadDash','loadDropdownOptions','loadAwardeeList','loadAkademikView',
    'loadPrestasiView','loadDetailOrganisasi'
  ].forEach(waitForFreshPublicData);

  /* Small-screen forms: avoid squeezed two-column controls and iOS input zoom. */
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

  window.ETOS_RUNTIME_POLISH={version:'ETOS-V2-POLISH-2026.09.02-BATCH7-1'};
})();

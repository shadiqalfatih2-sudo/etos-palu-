/* ETOS V2 — protected legacy actions UX. Loaded after canonical inline script. */
(function(){
  'use strict';

  function hasSession(){
    try{
      return !!(sessionStorage.getItem('etos_facilitator_access_token') || sessionStorage.getItem('etos_absensi_admin_token'));
    }catch(_){ return false; }
  }

  function requestAccess(retry,title){
    if(typeof window.openFacilitatorAccessModal==='function'){
      window.openFacilitatorAccessModal(retry,title||'Akses Fasilitator');
      return;
    }
    if(typeof window.showNotification==='function'){
      window.showNotification('Masuk melalui Admin Access terlebih dahulu.',false);
    }
  }

  function protectFunction(name,title){
    var original=window[name];
    if(typeof original!=='function') return;
    window[name]=function(){
      var self=this,args=arguments;
      if(hasSession()) return original.apply(self,args);
      requestAccess(function(){ original.apply(self,args); },title);
    };
  }

  /* Full profile contains WA/email; never request it anonymously. */
  protectFunction('viewAwardeeDetail','Akses Detail Awardee');

  /* Development records are facilitator-only. */
  protectFunction('loadCoachingView','Akses Coaching & IDP');
  protectFunction('refreshIDPData','Akses Refresh IDP Pusat');
  protectFunction('loadAssessmentView','Akses Asesmen & Development');
  protectFunction('submitCurrentAssessment','Akses Simpan Asesmen');
  protectFunction('openAwardee360','Akses Awardee 360°');
  protectFunction('openAwardeeRuleAnalysis','Akses Analisis Otomatis');

  /* Master/write operations. */
  protectFunction('submitAwd','Akses Tambah Awardee');
  protectFunction('submitAkd','Akses Simpan Akademik');
  protectFunction('submitCch','Akses Simpan Coaching');
  protectFunction('submitPrs','Akses Simpan Prestasi');
  protectFunction('submitOrg','Akses Simpan Organisasi');
  protectFunction('submitPortfolio','Akses Kelola Portofolio Alumni');
  protectFunction('submitCompetencyEvidence','Akses Evidence Kompetensi');
  protectFunction('submitMentoringCase','Akses Pendampingan');

  /*
   * Canonical Awardee 360 expects `skor_kelengkapan`. Live V2 deliberately
   * exposes rowCoveragePct instead because filled sheet area is not a quality
   * or performance score. Adapt the old card without changing canonical HTML.
   */
  var originalRender360=window.renderAwardee360;
  if(typeof originalRender360==='function'){
    window.renderAwardee360=function(data){
      data=data||{};
      var idp=data.idp||{};
      if(idp.rowCoveragePct!=null && idp.skor_kelengkapan==null){
        idp.skor_kelengkapan=Number(idp.rowCoveragePct);
      }
      data.idp=idp;
      originalRender360.call(this,data);

      try{
        var root=document.getElementById('awardee-360-content');
        if(!root) return;
        Array.prototype.forEach.call(root.querySelectorAll('p'),function(p){
          if((p.textContent||'').trim()==='Kelengkapan elemen terdeteksi'){
            p.textContent=(idp.liveSynced?'Cakupan baris terisi • LIVE GDrive':'Cakupan baris terisi • cache terakhir');
            if(idp.sheetName || idp.sourceUpdatedAt){
              var meta=document.createElement('p');
              meta.className='text-[10px] text-slate-400 mt-1 leading-relaxed';
              var when=idp.sourceUpdatedAt?String(idp.sourceUpdatedAt).replace('T',' ').replace(/\+00:00$/,' UTC'):'';
              meta.textContent=[idp.sheetName||'',when?('Sinkron '+when):''].filter(Boolean).join(' • ');
              p.parentNode.appendChild(meta);
            }
          }
        });
      }catch(e){ console.warn('[ETOS 360 IDP metadata]',e); }
    };
  }

  window.ETOS_PROTECTED_ACTIONS={version:'ETOS-V2-PROTECTED-2026.09.02-3-LIVE-IDP-360'};
})();

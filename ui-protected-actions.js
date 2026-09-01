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

  /* Assessment data and writes are part of facilitator development records. */
  protectFunction('loadAssessmentView','Akses Asesmen & Development');
  protectFunction('submitCurrentAssessment','Akses Simpan Asesmen');

  /* Master/write operations. */
  protectFunction('submitAwd','Akses Tambah Awardee');
  protectFunction('submitAkd','Akses Simpan Akademik');
  protectFunction('submitCch','Akses Simpan Coaching');
  protectFunction('submitPrs','Akses Simpan Prestasi');
  protectFunction('submitOrg','Akses Simpan Organisasi');
  protectFunction('submitPortfolio','Akses Kelola Portofolio Alumni');
  protectFunction('submitCompetencyEvidence','Akses Evidence Kompetensi');
  protectFunction('submitMentoringCase','Akses Pendampingan');

  window.ETOS_PROTECTED_ACTIONS={version:'ETOS-V2-PROTECTED-2026.09.01-1'};
})();

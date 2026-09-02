/* ETOS ID PALU V2 — facilitator session UX only. */
(function () {
  'use strict';

  var SUPABASE_URL='https://jrrmgfzfpcrjtyjqpaff.supabase.co';
  var SUPABASE_KEY='sb_publishable_VyCXSeR2FaGERAoEUDU5DA_vMigqty3';

  function hasFacilitatorSession(){
    try{
      if(typeof window.getFacilitatorAccessToken==='function') return !!window.getFacilitatorAccessToken();
      return !!(sessionStorage.getItem('etos_facilitator_access_token')||sessionStorage.getItem('etos_absensi_admin_token'));
    }catch(_){return false;}
  }
  function facilitatorToken(){
    try{return sessionStorage.getItem('etos_facilitator_access_token')||sessionStorage.getItem('etos_absensi_admin_token')||'';}catch(_){return '';}
  }
  function clearSession(){
    try{sessionStorage.removeItem('etos_facilitator_access_token');sessionStorage.removeItem('etos_absensi_admin_token');}catch(_){}
  }

  function setText(id,text){var el=document.getElementById(id);if(el) el.textContent=text;}
  function neutralHeader(){
    setText('top-fas-nama','Profil Fasilitator');
    setText('top-fas-email','Masuk untuk melihat profil');
    var avatar=document.getElementById('top-avatar');
    if(avatar) avatar.src='https://ui-avatars.com/api/?name=FA&background=155e3f&color=fff';
  }

  /* Only the non-sensitive active-awardee count is read publicly. */
  async function publicActiveCount(){
    var res=await fetch(SUPABASE_URL+'/rest/v1/v_etos_v2_stats?select=awardees_active&limit=1',{headers:{apikey:SUPABASE_KEY,Accept:'application/json'}});
    var raw=await res.text(),data=null;
    try{data=raw?JSON.parse(raw):null;}catch(_){}
    if(!res.ok) throw new Error((data&&data.message)||raw||('Supabase HTTP '+res.status));
    return data&&data[0]?Number(data[0].awardees_active||0):0;
  }

  function loadPublicActiveCount(){
    publicActiveCount().then(function(value){setText('cmd-active',String(value));}).catch(function(){
      if(typeof window.executeBackend==='function'){
        window.executeBackend('getDashboardStats',null,function(stats){if(stats&&stats.aktif!=null)setText('cmd-active',String(stats.aktif));},'Gagal memuat jumlah Awardee aktif',{silent:true,loaderOwned:false});
      }
    });
  }

  function renderLockedCommandCenter(){
    setText('cmd-active','…');
    setText('cmd-attention','—');
    setText('cmd-overdue','—');
    setText('cmd-momentum','—');
    setText('cmd-high-attention','Masuk untuk melihat sinyal');
    setText('cmd-stale-coaching','Masuk untuk melihat tindak lanjut');
    setText('cmd-period-note','Command Center terlindungi. Buka sesi fasilitator untuk melihat data pendampingan.');
    loadPublicActiveCount();
    var attention=document.getElementById('cmd-attention-list');
    if(attention) attention.innerHTML='<div class="p-7 text-sm text-slate-400 text-center">Data pendampingan disembunyikan sampai sesi fasilitator dibuka.</div>';
    var actions=document.getElementById('cmd-actions-list');
    if(actions) actions.innerHTML='<div class="p-7 text-sm text-slate-400 text-center">Masuk sebagai fasilitator untuk melihat RTL dan case.</div>';
    var cohorts=document.getElementById('cmd-cohort-table');
    if(cohorts) cohorts.innerHTML='<tr><td colspan="8" class="px-5 py-8 text-center text-slate-400">Analitik pendampingan tersedia setelah login fasilitator.</td></tr>';
    setText('cmd-positive-list','Data terlindungi');
  }

  var originalHeader=window.loadFasilitatorHeader;
  if(typeof originalHeader==='function'){
    window.loadFasilitatorHeader=function(){
      if(!hasFacilitatorSession()){neutralHeader();return;}
      return originalHeader.apply(this,arguments);
    };
  }

  var originalSubmitAccess=window.submitFacilitatorAccess;
  if(typeof originalSubmitAccess==='function'){
    window.submitFacilitatorAccess=function(){
      var result=originalSubmitAccess.apply(this,arguments);
      [250,700,1400].forEach(function(ms){setTimeout(function(){if(hasFacilitatorSession()&&typeof window.loadFasilitatorHeader==='function')window.loadFasilitatorHeader();},ms);});
      return result;
    };
  }

  function finishLogout(){
    clearSession();
    neutralHeader();
    renderLockedCommandCenter();
    try{if(typeof window.closeFacilitatorAccessModal==='function')window.closeFacilitatorAccessModal();}catch(_){}
    try{if(typeof window.navigate==='function')window.navigate('dashboard');}catch(_){}
    try{if(typeof window.showNotification==='function')window.showNotification('Sesi fasilitator telah ditutup.',true);}catch(_){}
  }
  window.logoutFacilitatorSession=function(){
    var token=facilitatorToken();
    if(!token){finishLogout();return;}
    try{
      window.google.script.run.withSuccessHandler(finishLogout).withFailureHandler(function(){finishLogout();}).logoutFacilitatorAccess(token);
    }catch(_){finishLogout();}
  };

  function installLogoutButton(){
    if(document.getElementById('etos-facilitator-logout')) return;
    var form=document.querySelector('#view-profil form');
    if(!form) return;
    var wrap=document.createElement('div');
    wrap.className='pt-4 mt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';
    var note=document.createElement('p');
    note.className='text-xs text-slate-400';
    note.textContent='Sesi akses tersimpan hanya pada tab browser ini dan akan berakhir otomatis.';
    var button=document.createElement('button');
    button.id='etos-facilitator-logout';button.type='button';
    button.className='px-5 py-2.5 rounded-full border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-extrabold';
    button.textContent='Keluar Sesi Fasilitator';
    button.addEventListener('click',window.logoutFacilitatorSession);
    wrap.appendChild(note);wrap.appendChild(button);form.appendChild(wrap);
  }
  installLogoutButton();

  var originalCommandCenter=window.loadMentoringCommandCenter;
  if(typeof originalCommandCenter==='function'){
    window.loadMentoringCommandCenter=function(){
      if(!hasFacilitatorSession()){renderLockedCommandCenter();return;}
      return originalCommandCenter.apply(this,arguments);
    };
  }

  var originalRefresh=window.refreshMentoringCommandCenter;
  if(typeof originalRefresh==='function'){
    window.refreshMentoringCommandCenter=function(){
      if(!hasFacilitatorSession()){
        renderLockedCommandCenter();
        if(typeof window.openFacilitatorAccessModal==='function'){
          window.openFacilitatorAccessModal(function(){if(typeof window.loadMentoringCommandCenter==='function')window.loadMentoringCommandCenter(true);},'Akses Development Command Center');
        }
        return;
      }
      return originalRefresh.apply(this,arguments);
    };
  }

  var originalSessionFailure=window.handleFacilitatorSessionFailure;
  if(typeof originalSessionFailure==='function'){
    window.handleFacilitatorSessionFailure=function(message,retryAction,title){
      if(/sesi fasilitator diperlukan|sesi akses berakhir|sesi admin berakhir/i.test(String(message||''))){
        clearSession();neutralHeader();renderLockedCommandCenter();
        if(typeof window.openFacilitatorAccessModal==='function'){
          window.openFacilitatorAccessModal(retryAction,title||'Masukkan Sandi');
          return true;
        }
      }
      return originalSessionFailure.apply(this,arguments);
    };
  }

  if(!hasFacilitatorSession()) neutralHeader();
  window.ETOS_SESSION_UX={version:'ETOS-V2-SESSION-UX-2026.09.02-5-LOGOUT'};
})();
/* ETOS V2 — protected legacy actions UX. Loaded after canonical inline script. */
(function(){
  'use strict';

  function hasSession(){
    try{return !!(sessionStorage.getItem('etos_facilitator_access_token')||sessionStorage.getItem('etos_absensi_admin_token'));}
    catch(_){return false;}
  }

  function notify(message,ok){
    try{if(typeof window.showNotification==='function') window.showNotification(message,!!ok);}catch(_){}
  }

  /*
   * Legacy HTML contained offline/demo fallbacks that could report a fake
   * success when the Apps Script bridge was absent. Production must fail
   * closed instead: a broken runtime is an error, never simulated data.
   */
  function installFailClosedBridge(){
    var ready=!!(window.ETOS_DIRECT&&window.google&&window.google.script&&window.google.script.run);
    if(ready) return;
    var message='Backend ETOS tidak tersedia. Muat ulang halaman atau periksa koneksi; tidak ada data simulasi yang digunakan.';
    function runner(success,failure){
      return new Proxy({}, {get:function(_,prop){
        if(prop==='withSuccessHandler') return function(fn){return runner(fn,failure);};
        if(prop==='withFailureHandler') return function(fn){return runner(success,fn);};
        return function(){
          setTimeout(function(){
            var err=new Error(message);
            if(typeof failure==='function') failure(err);
            else if(typeof success==='function') success({success:false,error:message});
            else notify(message,false);
          },0);
        };
      }});
    }
    window.google=window.google||{};
    window.google.script=window.google.script||{};
    window.google.script.run=runner(null,null);
    try{window.isGoogleEnv=true;}catch(_){}
    console.error('[ETOS V2] runtime bridge missing; fail-closed shim installed');
  }
  installFailClosedBridge();

  window.simulateOfflineFallback=function(){
    try{window.pendingBackendRequests={};}catch(_){}
    try{if(typeof window.toggleLoader==='function') window.toggleLoader(false);}catch(_){}
    notify('Backend ETOS tidak tersedia. Data simulasi dinonaktifkan.',false);
  };

  function requestAccess(retry,title){
    if(typeof window.openFacilitatorAccessModal==='function'){
      window.openFacilitatorAccessModal(retry,title||'Akses Fasilitator');
      return;
    }
    notify('Masuk melalui Admin Access terlebih dahulu.',false);
  }

  function protectFunction(name,title){
    var original=window[name];
    if(typeof original!=='function') return;
    window[name]=function(){
      var self=this,args=arguments;
      if(hasSession()) return original.apply(self,args);
      requestAccess(function(){original.apply(self,args);},title);
    };
  }

  /* Avoid silent auth failures during background prefetch. */
  window.prefetchDashboardViews=function(){
    var requests=[
      {name:'getAwardeeList',params:null},
      {name:'getAkademikList',params:null},
      {name:'getAbsensiList',params:{periodeId:window.currentAbsensiPeriodId||''}},
      {name:'getPrestasiList',params:null}
    ];
    if(hasSession()){
      requests.push({name:'getAlumniList',params:null});
      requests.push({name:'getCoachingList',params:null});
    }
    if(typeof window.executeBackend!=='function') return;
    requests.forEach(function(r){
      window.executeBackend(r.name,r.params,function(){},'Gagal memuat data awal',{silent:true,loaderOwned:false});
    });
  };

  /* Full profile, facilitator profile and portfolio links contain personal data. */
  protectFunction('viewAwardeeDetail','Akses Detail Awardee');
  protectFunction('loadAlumniView','Akses Alumni & Portfolio');
  protectFunction('loadProfilFasilitatorView','Akses Profil Fasilitator');

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
  protectFunction('submitUpdateFoto','Akses Ubah Foto Awardee');
  protectFunction('submitProfilFasilitator','Akses Simpan Profil Fasilitator');
  protectFunction('submitCompetencyEvidence','Akses Evidence Kompetensi');
  protectFunction('submitMentoringCase','Akses Pendampingan');
  protectFunction('submitPeriodePembinaan','Akses Periode Pembinaan');

  /* Replace the old simulated 5-axis radar with sourced metrics only. */
  window.renderRadarAnalytics=function(dataList){
    var ctx=document.getElementById('radarChart');
    if(!ctx||typeof Chart==='undefined') return;
    dataList=Array.isArray(dataList)?dataList:[];
    function finish(attendanceItems){
      try{
        if(window.radarChartInstance) window.radarChartInstance.destroy();
        var attendanceMap={};
        (attendanceItems||[]).forEach(function(item){attendanceMap[String(item.id||'').trim().toUpperCase()]=Number(item.pct);});
        var groups={};
        dataList.forEach(function(a){
          var cohort=String(a.angkatan||'-');
          var g=groups[cohort]||(groups[cohort]={ipk:[],idp:[],attendance:[]});
          var ipk=Number(a.ipk); if(Number.isFinite(ipk)) g.ipk.push(ipk*25);
          if(a.progress!==null&&a.progress!==undefined&&a.progress!==''){
            var p=Number(a.progress); if(Number.isFinite(p)) g.idp.push(p);
          }
          var att=attendanceMap[String(a.id||'').trim().toUpperCase()];
          if(Number.isFinite(att)) g.attendance.push(att);
        });
        function mean(xs){return xs.length?Math.round(xs.reduce(function(x,y){return x+y;},0)/xs.length*10)/10:null;}
        var colors=[{border:'#155e3f',bg:'rgba(21,94,63,.10)'},{border:'#0284c7',bg:'rgba(2,132,199,.10)'},{border:'#7c3aed',bg:'rgba(124,58,237,.10)'}];
        var datasets=Object.keys(groups).sort().slice(0,3).map(function(cohort,idx){
          var g=groups[cohort],c=colors[idx%colors.length];
          return {label:'Angkatan '+cohort,data:[mean(g.ipk),mean(g.idp),mean(g.attendance)],borderColor:c.border,backgroundColor:c.bg,borderWidth:2,pointBackgroundColor:c.border};
        });
        window.radarChartInstance=new Chart(ctx,{type:'radar',data:{labels:['IPK rata-rata (skala 100)','Cakupan baris IDP','Kehadiran periode aktif'],datasets:datasets},options:{responsive:true,maintainAspectRatio:false,spanGaps:false,scales:{r:{suggestedMin:0,suggestedMax:100}},plugins:{legend:{position:'bottom'}}}});
        var parent=ctx.parentNode;
        if(parent&&!document.getElementById('etos-real-metric-note')){
          var note=document.createElement('p');
          note.id='etos-real-metric-note'; note.className='mt-2 text-[10px] text-slate-400 font-semibold';
          note.textContent='Hanya metrik bersumber data yang ditampilkan. Nilai yang tidak tersedia dibiarkan kosong, tanpa simulasi.';
          parent.appendChild(note);
        }
      }catch(e){console.warn('[ETOS real radar]',e);}
    }
    try{
      window.google.script.run.withSuccessHandler(function(response){
        var payload=response&&response.success?response.data:response;
        finish(payload&&payload.items?payload.items:[]);
      }).withFailureHandler(function(){finish([]);}).getAbsensiList({periodeId:''});
    }catch(_){finish([]);}
  };

  /* Awardee 360: technical IDP coverage is not a quality/performance score. */
  var originalRender360=window.renderAwardee360;
  if(typeof originalRender360==='function'){
    window.renderAwardee360=function(data){
      data=data||{}; var idp=data.idp||{};
      if(idp.rowCoveragePct!=null&&idp.skor_kelengkapan==null) idp.skor_kelengkapan=Number(idp.rowCoveragePct);
      data.idp=idp; originalRender360.call(this,data);
      try{
        var root=document.getElementById('awardee-360-content'); if(!root) return;
        Array.prototype.forEach.call(root.querySelectorAll('p'),function(p){
          if((p.textContent||'').trim()==='Kelengkapan elemen terdeteksi'){
            p.textContent=(idp.liveSynced?'Cakupan baris terisi • LIVE GDrive':'Cakupan baris terisi • cache terakhir');
            if(idp.sheetName||idp.sourceUpdatedAt){
              var meta=document.createElement('p'); meta.className='text-[10px] text-slate-400 mt-1 leading-relaxed';
              var when=idp.sourceUpdatedAt?String(idp.sourceUpdatedAt).replace('T',' ').replace(/\+00:00$/,' UTC'):'';
              meta.textContent=[idp.sheetName||'',when?('Sinkron '+when):''].filter(Boolean).join(' • '); p.parentNode.appendChild(meta);
            }
          }
        });
      }catch(e){console.warn('[ETOS 360 IDP metadata]',e);}
    };
  }

  var originalInitAbsensi=window.initializeAbsensiEntryForm;
  if(typeof originalInitAbsensi==='function'){
    window.initializeAbsensiEntryForm=function(data){
      data=data||{}; originalInitAbsensi.call(this,data);
      try{
        var periodSelect=document.getElementById('entry-absensi-periode');
        var oldBanner=document.getElementById('etos-empty-period-banner'); if(oldBanner) oldBanner.remove();
        if(periodSelect&&(!data.periods||!data.periods.length)){
          periodSelect.innerHTML=''; var opt=document.createElement('option');
          opt.value=''; opt.textContent='Belum ada periode — tambahkan periode pembinaan'; opt.selected=true; periodSelect.appendChild(opt);
          var banner=document.createElement('div'); banner.id='etos-empty-period-banner';
          banner.className='mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700 font-semibold leading-relaxed';
          banner.textContent='Absensi membutuhkan Periode Pembinaan. Tambahkan periode pertama terlebih dahulu, lalu buka kembali form absensi.';
          periodSelect.parentNode.appendChild(banner);
        }
      }catch(e){console.warn('[ETOS absensi empty period]',e);}
    };
  }

  var originalSubmitAbsensi=window.submitAbsensiEntry;
  if(typeof originalSubmitAbsensi==='function'){
    window.submitAbsensiEntry=function(e){
      var periodSelect=document.getElementById('entry-absensi-periode');
      if(!periodSelect||!String(periodSelect.value||'').trim()){
        if(e&&typeof e.preventDefault==='function') e.preventDefault();
        notify('Belum ada Periode Pembinaan. Tambahkan periode terlebih dahulu.',false);
        if(typeof window.closeAbsensiEntry==='function') window.closeAbsensiEntry();
        setTimeout(function(){if(typeof window.toggleModal==='function') window.toggleModal('modal-add-periode');},120);
        return;
      }
      return originalSubmitAbsensi.apply(this,arguments);
    };
  }

  window.ETOS_PROTECTED_ACTIONS={version:'ETOS-V2-PROTECTED-2026.09.02-6-BATCH7-FAIL-CLOSED'};
})();

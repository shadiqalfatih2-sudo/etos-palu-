/* ETOS ID PALU V2 — facilitator session UX + legacy parity guard. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://jrrmgfzfpcrjtyjqpaff.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_VyCXSeR2FaGERAoEUDU5DA_vMigqty3';

  function hasFacilitatorSession() {
    try {
      if (typeof window.getFacilitatorAccessToken === 'function') {
        return !!window.getFacilitatorAccessToken();
      }
      return !!sessionStorage.getItem('etos_facilitator_access_token');
    } catch (_) {
      return false;
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  async function publicRest(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPABASE_KEY, Accept: 'application/json' }
    });
    var raw = await res.text();
    var data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    if (!res.ok) throw new Error((data && data.message) || raw || ('Supabase HTTP ' + res.status));
    return data;
  }

  function loadPublicActiveCount() {
    publicRest('v_etos_v2_stats?select=awardees_active&limit=1').then(function (rows) {
      var value = rows && rows[0] ? Number(rows[0].awardees_active || 0) : 0;
      setText('cmd-active', String(value));
    }).catch(function () {
      if (typeof window.executeBackend === 'function') {
        window.executeBackend('getDashboardStats', null, function (stats) {
          if (stats && stats.aktif != null) setText('cmd-active', String(stats.aktif));
        }, 'Gagal memuat jumlah Awardee aktif', { silent: true });
      }
    });
  }

  function renderLockedCommandCenter() {
    setText('cmd-active', '…');
    setText('cmd-attention', '—');
    setText('cmd-overdue', '—');
    setText('cmd-momentum', '—');
    setText('cmd-high-attention', 'Masuk untuk melihat sinyal');
    setText('cmd-stale-coaching', 'Masuk untuk melihat tindak lanjut');
    setText('cmd-period-note', 'Command Center terlindungi. Buka sesi fasilitator untuk melihat data pendampingan.');
    loadPublicActiveCount();

    var attention = document.getElementById('cmd-attention-list');
    if (attention) {
      attention.innerHTML = '<div class="p-7 text-sm text-slate-400 text-center">Data pendampingan disembunyikan sampai sesi fasilitator dibuka.</div>';
    }
    var actions = document.getElementById('cmd-actions-list');
    if (actions) {
      actions.innerHTML = '<div class="p-7 text-sm text-slate-400 text-center">Masuk sebagai fasilitator untuk melihat RTL dan case.</div>';
    }
    var cohorts = document.getElementById('cmd-cohort-table');
    if (cohorts) {
      cohorts.innerHTML = '<tr><td colspan="8" class="px-5 py-8 text-center text-slate-400">Analitik pendampingan tersedia setelah login fasilitator.</td></tr>';
    }
    setText('cmd-positive-list', 'Data terlindungi');
  }

  var originalCommandCenter = window.loadMentoringCommandCenter;
  if (typeof originalCommandCenter === 'function') {
    window.loadMentoringCommandCenter = function () {
      if (!hasFacilitatorSession()) {
        renderLockedCommandCenter();
        return;
      }
      return originalCommandCenter.apply(this, arguments);
    };
  }

  var originalRefresh = window.refreshMentoringCommandCenter;
  if (typeof originalRefresh === 'function') {
    window.refreshMentoringCommandCenter = function () {
      if (!hasFacilitatorSession()) {
        renderLockedCommandCenter();
        if (typeof window.openFacilitatorAccessModal === 'function') {
          window.openFacilitatorAccessModal(function () {
            if (typeof window.loadMentoringCommandCenter === 'function') {
              window.loadMentoringCommandCenter(true);
            }
          }, 'Akses Development Command Center');
        }
        return;
      }
      return originalRefresh.apply(this, arguments);
    };
  }

  /* Restore Tracking Alumni data parity from the safe public projection. */
  var originalAlumniView = window.loadAlumniView;
  window.loadAlumniView = function () {
    if (typeof window.toggleLoader === 'function') window.toggleLoader(true);
    publicRest('v_etos_v2_alumni?select=*&order=name.asc').then(function (rows) {
      var data = (rows || []).map(function (a) {
        var gpa = a.latest_gpa == null || a.latest_gpa === '' ? null : Number(a.latest_gpa);
        return {
          id: String(a.id || ''),
          nama: String(a.name || 'Unknown'),
          kampus: String(a.university || '-'),
          jurusan: String(a.major || '-'),
          angkatan: a.cohort == null ? '-' : String(a.cohort),
          status: String(a.status || 'Alumni'),
          motto: String(a.motto || ''),
          foto: String(a.photo_url || ''),
          ipk: Number.isFinite(gpa) ? gpa.toFixed(2) : '-',
          kontribusi: String(a.contribution || 'Belum bekerja/studi'),
          cv: String(a.cv_link || ''),
          gdrive: String(a.drive_link || ''),
          portfolioTersedia: !!a.portfolio_available
        };
      });

      window.globalAlumni = data;
      var cohortSelect = document.getElementById('alumni-angkatan');
      var campusSelect = document.getElementById('alumni-kampus');
      if (cohortSelect && campusSelect) {
        var currentCohortVal = cohortSelect.value;
        var currentCampusVal = campusSelect.value;
        var cohorts = [];
        var campuses = [];
        data.forEach(function (a) {
          if (cohorts.indexOf(a.angkatan) === -1) cohorts.push(a.angkatan);
          if (campuses.indexOf(a.kampus) === -1) campuses.push(a.kampus);
        });
        cohorts.sort();
        campuses.sort();
        cohortSelect.innerHTML = '<option value="">Semua Angkatan</option>';
        cohorts.forEach(function (c) { cohortSelect.innerHTML += '<option value="' + c + '">Angkatan ' + c + '</option>'; });
        cohortSelect.value = currentCohortVal;
        campusSelect.innerHTML = '<option value="">Semua Kampus</option>';
        campuses.forEach(function (c) { campusSelect.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
        campusSelect.value = currentCampusVal;
      }
      if (typeof window.renderAlumniGrid === 'function') window.renderAlumniGrid(data);
    }).catch(function (err) {
      console.error('[ETOS alumni parity]', err);
      if (typeof window.showNotification === 'function') window.showNotification('Gagal memuat data Tracking Alumni: ' + (err.message || err), false);
      if (typeof originalAlumniView === 'function') originalAlumniView.apply(window, arguments);
    }).finally(function () {
      if (typeof window.toggleLoader === 'function') window.toggleLoader(false);
    });
  };

  /*
   * Canonical legacy used generated percentages for Progress/Kajian/Tahsin/Tilawah.
   * V2 must never present synthetic values as operational data. Until those sources
   * exist, render only the real GPA cohort metric available from Supabase.
   */
  window.renderRadarAnalytics = function (dataList) {
    var ctx = document.getElementById('radarChart');
    if (!ctx || typeof Chart === 'undefined') return;
    try {
      if (window.radarChartInstance && typeof window.radarChartInstance.destroy === 'function') window.radarChartInstance.destroy();
    } catch (_) {}

    var grouped = {};
    (dataList || []).forEach(function (a) {
      var cohort = String(a.angkatan || '-');
      var gpa = Number(String(a.ipk == null ? '' : a.ipk).replace(',', '.'));
      if (!Number.isFinite(gpa)) return;
      if (!grouped[cohort]) grouped[cohort] = [];
      grouped[cohort].push(gpa);
    });
    var labels = Object.keys(grouped).sort();
    var values = labels.map(function (key) {
      var xs = grouped[key];
      return xs.length ? Number((xs.reduce(function (a, b) { return a + b; }, 0) / xs.length).toFixed(2)) : null;
    });

    if (!labels.length) {
      try {
        var parent = ctx.parentElement;
        if (parent && !parent.querySelector('[data-etos-no-analytics]')) {
          var note = document.createElement('div');
          note.setAttribute('data-etos-no-analytics', '1');
          note.className = 'h-full min-h-[220px] flex items-center justify-center text-center text-sm text-slate-400 p-6';
          note.textContent = 'Belum ada data nyata yang cukup untuk analitik perkembangan.';
          ctx.style.display = 'none';
          parent.appendChild(note);
        }
      } catch (_) {}
      return;
    }

    ctx.style.display = '';
    var oldNote = ctx.parentElement && ctx.parentElement.querySelector('[data-etos-no-analytics]');
    if (oldNote) oldNote.remove();
    window.radarChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.map(function (c) { return 'Angkatan ' + c; }),
        datasets: [{ label: 'Rata-rata IPK aktual', data: values, borderWidth: 1 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, suggestedMax: 4, max: 4 } },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: function (ctx) { return 'IPK ' + Number(ctx.raw || 0).toFixed(2); } } }
        }
      }
    });
  };

  /* Disable all hard-coded legacy demo data when the live backend fails. */
  window.simulateOfflineFallback = function (funcName, successCallback) {
    console.error('[ETOS V2] Backend tidak tersedia; data simulasi legacy dinonaktifkan:', funcName);
    if (typeof window.showNotification === 'function') {
      window.showNotification('Koneksi data V2 gagal. Data simulasi tidak ditampilkan.', false);
    }
    var empty;
    if (funcName === 'getDashboardStats') empty = { totalAwardee: '—', aktif: '—', warning: '—', avgIPK: '—', sourceUnavailable: true };
    else if (funcName === 'getIDPOverview') empty = { sourceName: 'Koneksi sumber IDP tidak tersedia', totalActive: 0, connected: 0, missing: 0, items: [], sourceUnavailable: true };
    else if (funcName === 'getAbsensiList') empty = { items: [], periods: [], selectedPeriod: null, legacyMode: false, unresolvedTahsin: 0, sourceUnavailable: true };
    else if (funcName === 'getAssessmentHub') empty = { awardees: [], records: {}, sourceUnavailable: true };
    else if (/List$|FeaturedAwardees|MentoringCases/.test(funcName)) empty = [];
    else if (funcName === 'getLatestAwardeeRuleAnalysis') empty = { available: false, sourceUnavailable: true };
    else empty = { sourceUnavailable: true };
    if (typeof successCallback === 'function') successCallback(empty);
  };

  var originalPrefetch = window.prefetchDashboardViews;
  if (typeof originalPrefetch === 'function') {
    window.prefetchDashboardViews = function () {
      if (hasFacilitatorSession()) {
        return originalPrefetch.apply(this, arguments);
      }
      if (typeof window.executeBackend !== 'function') return;
      [
        { name: 'getAwardeeList', params: null },
        { name: 'getAkademikList', params: null },
        { name: 'getAbsensiList', params: { periodeId: window.currentAbsensiPeriodId || '' } },
        { name: 'getPrestasiList', params: null }
      ].forEach(function (request) {
        window.executeBackend(request.name, request.params, function () {}, 'Gagal memuat data awal', { silent: true });
      });
    };
  }

  var originalSessionFailure = window.handleFacilitatorSessionFailure;
  if (typeof originalSessionFailure === 'function') {
    window.handleFacilitatorSessionFailure = function (message, retryAction, title) {
      if (/sesi fasilitator diperlukan|sesi akses berakhir|sesi admin berakhir/i.test(String(message || ''))) {
        try {
          sessionStorage.removeItem('etos_facilitator_access_token');
          sessionStorage.removeItem('etos_absensi_admin_token');
        } catch (_) {}
        if (typeof window.openFacilitatorAccessModal === 'function') {
          window.openFacilitatorAccessModal(retryAction, title || 'Masukkan Sandi');
          return true;
        }
      }
      return originalSessionFailure.apply(this, arguments);
    };
  }

  window.ETOS_NO_DUMMY = true;
  window.ETOS_SESSION_UX = { version: 'ETOS-V2-SESSION-UX-2026.09.01-3-NO-DUMMY' };
})();

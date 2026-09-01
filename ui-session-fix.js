/* ETOS ID PALU V2 — facilitator session UX guard. */
(function () {
  'use strict';

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

  function renderLockedCommandCenter() {
    setText('cmd-active', '—');
    setText('cmd-attention', '—');
    setText('cmd-overdue', '—');
    setText('cmd-momentum', '—');
    setText('cmd-high-attention', 'Masuk untuk melihat sinyal');
    setText('cmd-stale-coaching', 'Masuk untuk melihat tindak lanjut');
    setText('cmd-period-note', 'Command Center terlindungi. Buka sesi fasilitator untuk melihat data pendampingan.');

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

  var originalPrefetch = window.prefetchDashboardViews;
  if (typeof originalPrefetch === 'function') {
    window.prefetchDashboardViews = function () {
      if (hasFacilitatorSession()) {
        return originalPrefetch.apply(this, arguments);
      }
      if (typeof window.executeBackend !== 'function') return;
      [
        { name: 'getAwardeeList', params: null },
        { name: 'getAlumniList', params: null },
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
      if (/sesi fasilitator diperlukan/i.test(String(message || ''))) {
        try { sessionStorage.removeItem('etos_facilitator_access_token'); } catch (_) {}
        if (typeof window.openFacilitatorAccessModal === 'function') {
          window.openFacilitatorAccessModal(retryAction, title || 'Masukkan Sandi');
          return true;
        }
      }
      return originalSessionFailure.apply(this, arguments);
    };
  }

  window.ETOS_SESSION_UX = { version: 'ETOS-V2-SESSION-UX-2026.09.01-1' };
})();

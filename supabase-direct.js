/*
 * ETOS ID PALU — Supabase Direct Compatibility Layer
 * Public browser reads only. Sensitive/operational actions are handled by
 * supabase-secure.js through authenticated Edge Functions.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jrrmgfzfpcrjtyjqpaff.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VyCXSeR2FaGERAoEUDU5DA_vMigqty3';
  const DIRECT_VERSION = 'ETOS-V2-DIRECT-2026.09.02-DATA-INTEGRITY2';
  const CACHE_MS = 45000;
  const memory = { bootstrap: null, savedAt: 0, inflight: null, lastMs: null };

  function clean(v) { return v == null ? '' : String(v).trim(); }
  function low(v) { return clean(v).toLowerCase(); }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  function isActive(v) { return low(v) === 'aktif'; }
  function avg(values) {
    const xs = values.filter(Number.isFinite);
    return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null;
  }
  function clampPct(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  }

  async function rest(path, options) {
    options = options || {};
    const headers = Object.assign({
      apikey: SUPABASE_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }, options.headers || {});
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, options.timeout || 12000);
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
      if (!res.ok) {
        const detail = data && (data.message || data.details || data.hint);
        throw new Error(detail || raw || ('Supabase HTTP ' + res.status));
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadBootstrap(force) {
    const now = Date.now();
    if (!force && memory.bootstrap && now - memory.savedAt < CACHE_MS) return memory.bootstrap;
    if (!force && memory.inflight) return memory.inflight;
    const started = performance.now();
    memory.inflight = Promise.all([
      rest('v_etos_v2_stats?select=*'),
      rest('v_etos_v2_awardees?select=*&order=name.asc'),
      rest('v_etos_v2_academic?select=*&order=name.asc'),
      rest('v_etos_v2_achievements?select=*&order=achievement_year.desc.nullslast,name.asc'),
      rest('v_etos_v2_organizations?select=*&order=start_year.desc.nullslast,awardee_name.asc'),
      rest('v_etos_v2_idp_overview?select=*&order=name.asc')
    ]).then(function (all) {
      memory.lastMs = Math.round(performance.now() - started);
      memory.bootstrap = {
        stats: (all[0] && all[0][0]) || {},
        awardees: all[1] || [],
        academic: all[2] || [],
        achievements: all[3] || [],
        organizations: all[4] || [],
        idpOverview: all[5] || []
      };
      memory.savedAt = Date.now();
      memory.inflight = null;
      try { window.dispatchEvent(new CustomEvent('etos-direct-loaded', { detail: { ms: memory.lastMs } })); } catch (_) {}
      return memory.bootstrap;
    }).catch(function (err) {
      memory.inflight = null;
      throw err;
    });
    return memory.inflight;
  }

  function idpRowCoverage(db, awardeeCode) {
    const code = clean(awardeeCode);
    const r = (db.idpOverview || []).find(function (x) { return clean(x.awardee_code) === code; });
    if (!r || !r.connected) return null;
    const filled = Number(r.filled_rows || 0);
    const last = Number(r.last_row || 0);
    if (!last) return null;
    return clampPct((filled / last) * 100);
  }

  function mapAwardee(db, a) {
    const gpa = num(a.latest_gpa);
    const id = clean(a.id || a.awardee_code);
    return {
      id: id,
      nama: clean(a.name),
      kampus: clean(a.university) || '-',
      jurusan: clean(a.major) || '-',
      angkatan: clean(a.cohort),
      status: clean(a.status) || '-',
      motto: clean(a.motto),
      foto: clean(a.photo_url),
      ipk: gpa == null ? '-' : gpa.toFixed(2),
      progress: idpRowCoverage(db, id),
      progressSource: 'IDP_ROW_COVERAGE'
    };
  }

  function mapAcademic(r) {
    const g = num(r.gpa);
    const ips = num(r.ips);
    const semester = clean(r.semester || r.semester_number || r.semester_raw) || '-';
    return {
      id: clean(r.id || r.academic_code),
      awdId: clean(r.awardee_code),
      nama: clean(r.name) || 'Unknown',
      angkatan: clean(r.cohort),
      smt: semester,
      semester: semester,
      sks: r.sks == null || r.sks === '' ? '-' : String(r.sks),
      ips: ips == null ? '-' : ips.toFixed(2),
      ipk: g == null ? '-' : g.toFixed(2),
      status: clean(r.status) || '-'
    };
  }

  function mapAchievement(r) {
    return {
      id: clean(r.id || r.achievement_code), awdId: clean(r.awardee_code), nama: clean(r.name) || 'Unknown',
      prestasi: clean(r.achievement_name) || '-', penyelenggara: clean(r.organizer),
      thn: clean(r.achievement_year) || '-', tahun: clean(r.achievement_year) || '-',
      tingkat: clean(r.level) || '-', kategori: clean(r.category)
    };
  }

  function mapOrganization(r) {
    const start = clean(r.start_year);
    const end = clean(r.end_year_raw || r.end_year);
    const year = start && end ? (start + ' - ' + end) : (start || end || '-');
    return {
      id: clean(r.organization_code || r.id), awdId: clean(r.awardee_code),
      nama: clean(r.organization_name) || '-', jab: clean(r.position_title) || '-',
      thn: year, tingkat: clean(r.level) || '-'
    };
  }

  function idpOverview(db) {
    const items = (db.idpOverview || []).map(function (r) {
      return {
        id: clean(r.awardee_code), nama: clean(r.name), angkatan: clean(r.cohort), status: clean(r.status),
        connected: !!r.connected, sheetName: clean(r.source_sheet), filledRows: Number(r.filled_rows || 0),
        filledCells: Number(r.filled_cells || 0), lastRow: Number(r.last_row || 0),
        lastColumn: Number(r.last_column || 0), truncated: !!r.truncated,
        sourceType: clean(r.source_type) || 'supabase', sourceUpdatedAt: clean(r.source_updated_at),
        rowCoveragePct: r.connected && Number(r.last_row || 0) > 0
          ? clampPct(Number(r.filled_rows || 0) / Number(r.last_row) * 100)
          : null
      };
    });
    const connected = items.filter(function (x) { return x.connected; }).length;
    return {
      sourceName: 'Palu-IDP KI — cache server terakhir',
      totalActive: items.length,
      connected: connected,
      missing: items.length - connected,
      items: items
    };
  }

  function protectedAction(name) {
    throw new Error('Endpoint ' + name + ' memerlukan secure runtime. Muat ulang halaman jika pesan ini muncul.');
  }

  async function invoke(name) {
    const db = await loadBootstrap(false);
    switch (name) {
      case 'getDashboardStats': {
        const gpas = db.academic.map(function (r) { return num(r.gpa); }).filter(function (x) { return x != null; });
        const mean = avg(gpas);
        return {
          totalAwardee: Number(db.stats.awardees_total || db.awardees.length),
          aktif: Number(db.stats.awardees_active || db.awardees.filter(function (a) { return isActive(a.status); }).length),
          warning: db.awardees.filter(function (a) { return low(a.status).indexOf('warning') >= 0; }).length,
          avgIPK: mean == null ? '-' : mean.toFixed(2),
          directMs: memory.lastMs
        };
      }
      case 'getFeaturedAwardees': return db.awardees.map(function (a) { return mapAwardee(db, a); });
      case 'getAwardeeList': return db.awardees.map(function (a) { return mapAwardee(db, a); });
      case 'getDropdownOptions': return db.awardees.map(function (a) { return { id: clean(a.id || a.awardee_code), nama: clean(a.name) }; });
      case 'getAkademikList': return db.academic.map(mapAcademic);
      case 'getPrestasiList': return db.achievements.map(mapAchievement);
      case 'getOrganisasiList': return db.organizations.map(mapOrganization);
      case 'getIDPOverview': return idpOverview(db);
      case 'getAwardeeProfile':
      case 'getAlumniList':
      case 'getCoachingList':
      case 'getPeriodePembinaanList':
      case 'getAbsensiList':
      case 'getIDPDetail':
      case 'getAssessmentHub':
      case 'getFacilitatorAssessmentHub':
      case 'getFacilitatorAssessmentReport':
      case 'getMentoringCases':
      case 'getMentoringCommandCenter':
      case 'getCohortDevelopmentAnalytics':
      case 'getAwardee360':
      case 'getLatestAwardeeRuleAnalysis':
      case 'analyzeAwardeeWithRules':
      case 'verifyFacilitatorAccess':
      case 'verifyAbsensiAdminPin':
      case 'getAbsensiEntryOptions':
      case 'verifyAssessmentAccess':
      case 'getPublicKajianReflectionForm':
      case 'verifyKajianReflectionParticipant':
      case 'getFasilitatorProfile':
      case 'logoutAbsensiAdmin':
      case 'saveAssessment':
      case 'saveMentoringCase':
      case 'updateMentoringCase':
      case 'saveCompetencyEvidence':
      case 'saveAbsensiEntry':
      case 'savePeriodePembinaan':
      case 'saveAwardee':
      case 'saveAkademik':
      case 'saveCoaching':
      case 'savePrestasi':
      case 'saveOrganisasi':
      case 'saveAlumniPortfolio':
      case 'saveAwardeePhoto':
      case 'saveFasilitatorProfile':
      case 'submitKajianReflection':
        return protectedAction(name);
      default:
        throw new Error('Endpoint V2 belum dipetakan: ' + name);
    }
  }

  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { return makeRunner(fn, failureHandler); };
        if (prop === 'withFailureHandler') return function (fn) { return makeRunner(successHandler, fn); };
        return function () {
          const args = Array.prototype.slice.call(arguments);
          let method = String(prop);
          if (method === 'backendInvoke') method = args[0];
          invoke(method).then(function (data) {
            if (typeof successHandler === 'function') successHandler({ success: true, data: data });
          }).catch(function (err) {
            if (typeof failureHandler === 'function') failureHandler(err);
            else if (typeof successHandler === 'function') successHandler({ success: false, error: err && err.message ? err.message : String(err) });
            else console.error('[ETOS V2]', method, err);
          });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner(null, null);
  window.ETOS_DIRECT = {
    version: DIRECT_VERSION,
    mode: 'vercel-supabase',
    reload: function () { return loadBootstrap(true); },
    invoke: invoke,
    status: function () { return { loaded: !!memory.bootstrap, lastMs: memory.lastMs, savedAt: memory.savedAt }; }
  };
  loadBootstrap(false).catch(function (err) { console.error('[ETOS V2 bootstrap]', err); });
})();

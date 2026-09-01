/*
 * ETOS ID PALU — Supabase Direct Compatibility Layer
 * Vercel browser -> Supabase Data API. No Google Apps Script runtime.
 * Publishable key only. Sensitive reads/writes require authenticated server/RLS paths.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jrrmgfzfpcrjtyjqpaff.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VyCXSeR2FaGERAoEUDU5DA_vMigqty3';
  const DIRECT_VERSION = 'ETOS-V2-DIRECT-2026.09.01-PARITY2';
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
  function isAlumni(v) { return ['lulus', 'alumni', 'nonaktif', 'tidak aktif'].includes(low(v)); }
  function codeNumber(v) { const m = clean(v).match(/(\d+)$/); return m ? Number(m[1]) : 0; }
  function avg(values) {
    const xs = values.filter(Number.isFinite);
    return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null;
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

  function mapAwardee(a, featured) {
    const gpa = num(a.latest_gpa);
    const n = codeNumber(a.id || a.awardee_code);
    return {
      id: clean(a.id || a.awardee_code),
      nama: clean(a.name),
      kampus: clean(a.university) || '-',
      jurusan: clean(a.major) || '-',
      angkatan: clean(a.cohort),
      status: clean(a.status) || '-',
      motto: clean(a.motto),
      foto: clean(a.photo_url),
      ipk: gpa == null ? '0.00' : gpa.toFixed(2),
      progress: isAlumni(a.status) ? 100 : (featured ? ((n * 17) % 60 + 40) : 0)
    };
  }

  function mapAcademic(r) {
    const g = num(r.gpa);
    const semester = clean(r.semester || r.semester_number || r.semester_raw) || '-';
    return {
      id: clean(r.id), awdId: clean(r.awardee_code), nama: clean(r.name) || 'Unknown',
      angkatan: clean(r.cohort), smt: semester, semester: semester,
      ips: g == null ? '-' : g.toFixed(2), ipk: g == null ? '-' : g.toFixed(2), status: '-'
    };
  }

  function mapAchievement(r) {
    return {
      id: clean(r.id), awdId: clean(r.awardee_code), nama: clean(r.name) || 'Unknown',
      prestasi: clean(r.achievement_name) || '-', penyelenggara: clean(r.organizer),
      thn: clean(r.achievement_year) || '-', tahun: clean(r.achievement_year) || '-',
      tingkat: clean(r.level) || '-', kategori: clean(r.category)
    };
  }

  function mapOrganization(r) {
    return {
      id: clean(r.organization_code || r.id), awdId: clean(r.awardee_code),
      nama: clean(r.organization_name) || '-', jab: clean(r.position_title) || '-',
      thn: (clean(r.start_year) + ' - ' + clean(r.end_year)).trim(), tingkat: clean(r.level) || '-'
    };
  }

  function findAwardee(db, value) {
    const needle = low(value);
    const row = db.awardees.find(function (a) { return low(a.id || a.awardee_code) === needle || low(a.name) === needle; });
    if (!row) throw new Error('Awardee tidak ditemukan.');
    return row;
  }

  function publicProfile(db, value) {
    const a = findAwardee(db, value);
    return Object.assign(mapAwardee(a, false), { wa: 'Terlindungi', email: 'Terlindungi' });
  }

  function idpOverview(db) {
    const items = db.idpOverview.map(function (r) {
      return {
        id: clean(r.awardee_code), nama: clean(r.name), angkatan: clean(r.cohort), status: clean(r.status),
        connected: !!r.connected, sheetName: clean(r.source_sheet), filledRows: Number(r.filled_rows || 0),
        filledCells: Number(r.filled_cells || 0), lastRow: Number(r.last_row || 0),
        lastColumn: Number(r.last_column || 0), truncated: !!r.truncated,
        sourceType: clean(r.source_type) || 'supabase', sourceUpdatedAt: clean(r.source_updated_at)
      };
    });
    const connected = items.filter(function (x) { return x.connected; }).length;
    return { sourceName: 'Palu-IDP KI — Snapshot Supabase', totalActive: items.length, connected: connected, missing: items.length - connected, items: items };
  }

  function assessmentHub(db) {
    return { awardees: db.awardees.filter(function (a) { return isActive(a.status); }).map(function (a) {
      const x = mapAwardee(a, false);
      return { id: x.id, nama: x.nama, kampus: x.kampus, jurusan: x.jurusan, angkatan: x.angkatan, status: x.status, foto: x.foto };
    }) };
  }

  function commandCenterPublic(db) {
    const active = db.awardees.filter(function (a) { return isActive(a.status); });
    const byCode = {};
    db.academic.forEach(function (r) {
      const c = clean(r.awardee_code), g = num(r.gpa);
      if (c && g != null) (byCode[c] || (byCode[c] = [])).push(g);
    });
    const cohorts = {};
    active.forEach(function (a) {
      const key = clean(a.cohort) || '-';
      const c = cohorts[key] || (cohorts[key] = { cohort: key, active: 0, gpas: [] });
      c.active += 1;
      const xs = byCode[clean(a.id || a.awardee_code)] || [];
      if (xs.length) c.gpas.push(xs[xs.length - 1]);
    });
    return {
      stats: { active: active.length, needs_attention: 0, high_attention: 0, overdue_rtl: 0, stale_coaching: 0, positive_momentum: 0 },
      needsAttention: [], positiveMomentum: [], upcomingActions: [], rows: [], selectedPeriod: null,
      cohorts: Object.keys(cohorts).sort().map(function (k) {
        const c = cohorts[k];
        return { cohort: c.cohort, active: c.active, needs_attention: 0, avg_ipk: avg(c.gpas), avg_attendance: null, open_cases: 0, positive_momentum: 0, top_issues: [] };
      }),
      note: 'Ringkasan publik. Detail pendampingan memerlukan login fasilitator.'
    };
  }

  function public360(db, params) {
    const key = params && (params.id_awardee || params.nama);
    const profile = publicProfile(db, key || '');
    const academic = db.academic.filter(function (r) { return clean(r.awardee_code) === profile.id; }).map(mapAcademic);
    const achievements = db.achievements.filter(function (r) { return clean(r.awardee_code) === profile.id; }).map(mapAchievement);
    const organizations = db.organizations.filter(function (r) { return clean(r.awardee_code) === profile.id; }).map(function (r) { return { organisasi: clean(r.organization_name), jabatan: clean(r.position_title) }; });
    const idp = db.idpOverview.find(function (r) { return clean(r.awardee_code) === profile.id; });
    return {
      profile: profile,
      analysis: { tingkat_perhatian: 'Login fasilitator diperlukan', ringkasan: 'Data publik dasar tersedia. Analisis pendampingan, assessment, coaching dan case dilindungi.', catatan_peninjauan: 'Data sensitif tidak dikirim ke browser anonim.' },
      briefing: { text: 'Ringkasan publik dari Supabase. Login fasilitator diperlukan untuk Awardee 360 penuh.' },
      growth: {}, competencies: { dimensions: [], note: 'Dilindungi' },
      idp: { tersedia: !!(idp && idp.connected), skor_kelengkapan: idp && idp.connected ? 100 : 0, metadataOnly: true },
      reflection: { tersedia: false }, attendance: { tersedia: false }, assessment: { records: {}, completed: 0, needCheckin: false },
      cases: [], academic: academic.map(function (r) { return { semester: r.smt, ipk: r.ipk === '-' ? null : Number(r.ipk) }; }),
      coaching: [], organizations: organizations, achievements: achievements.map(function (r) { return { prestasi: r.prestasi, tingkat: r.tingkat }; }),
      portfolio: { tersedia: false }
    };
  }

  function authRequired() { throw new Error('Fitur ini memerlukan autentikasi fasilitator Supabase. Tidak ada token preview atau PIN palsu pada V2.'); }
  function writeRequired() { throw new Error('Operasi tulis memerlukan Supabase Auth/RLS atau endpoint server-side terautentikasi.'); }

  async function invoke(name, params) {
    const db = await loadBootstrap(false);
    switch (name) {
      case 'getDashboardStats': {
        const gpas = db.awardees.map(function (a) { return num(a.latest_gpa); }).filter(function (x) { return x != null; });
        const mean = avg(gpas);
        return { totalAwardee: Number(db.stats.awardees_total || db.awardees.length), aktif: Number(db.stats.awardees_active || db.awardees.filter(function (a) { return isActive(a.status); }).length), warning: db.awardees.filter(function (a) { return low(a.status).indexOf('warning') >= 0; }).length, avgIPK: mean == null ? '0.00' : mean.toFixed(2), directMs: memory.lastMs };
      }
      case 'getFeaturedAwardees': return db.awardees.map(function (a) { return mapAwardee(a, true); });
      case 'getAwardeeList': return db.awardees.map(function (a) { return mapAwardee(a, false); });
      case 'getDropdownOptions': return db.awardees.map(function (a) { return { id: clean(a.id || a.awardee_code), nama: clean(a.name) }; });
      case 'getAwardeeProfile': return publicProfile(db, params);
      case 'getAlumniList': return db.awardees.filter(function (a) { return isAlumni(a.status); }).map(function (a) { return Object.assign(mapAwardee(a, false), { kontribusi: 'Belum ada data kontribusi publik terbaru', cv: '', gdrive: '', portfolioTersedia: false }); });
      case 'getAkademikList': return db.academic.map(mapAcademic);
      case 'getPrestasiList': return db.achievements.map(mapAchievement);
      case 'getOrganisasiList': return db.organizations.map(mapOrganization);
      case 'getCoachingList': return [];
      case 'getPeriodePembinaanList': return [];
      case 'getAbsensiList': return { items: [], periods: [], selectedPeriod: null, legacyMode: false, unresolvedTahsin: 0 };
      case 'getIDPOverview': return idpOverview(db);
      case 'getIDPDetail': return authRequired();
      case 'getAssessmentHub': return assessmentHub(db);
      case 'getFacilitatorAssessmentHub': return authRequired();
      case 'getFacilitatorAssessmentReport': return authRequired();
      case 'getMentoringCases': return authRequired();
      case 'getMentoringCommandCenter': return commandCenterPublic(db);
      case 'getCohortDevelopmentAnalytics': return commandCenterPublic(db);
      case 'getAwardee360': return public360(db, params || {});
      case 'getLatestAwardeeRuleAnalysis': return authRequired();
      case 'analyzeAwardeeWithRules': return authRequired();
      case 'verifyFacilitatorAccess': return authRequired();
      case 'verifyAbsensiAdminPin': return authRequired();
      case 'getAbsensiEntryOptions': return authRequired();
      case 'verifyAssessmentAccess': return authRequired();
      case 'getPublicKajianReflectionForm': return authRequired();
      case 'verifyKajianReflectionParticipant': return authRequired();
      case 'getFasilitatorProfile': return { nama: 'Fasilitator ETOS ID Palu', email: '', wa: '', wilayah: 'Palu', bio: 'Dashboard V2 Direct Supabase' };
      case 'logoutAbsensiAdmin': return true;
      case 'saveAssessment': case 'saveMentoringCase': case 'updateMentoringCase': case 'saveCompetencyEvidence':
      case 'saveAbsensiEntry': case 'savePeriodePembinaan': case 'saveAwardee': case 'saveAkademik': case 'saveCoaching':
      case 'savePrestasi': case 'saveOrganisasi': case 'saveAlumniPortfolio': case 'saveAwardeePhoto': case 'saveFasilitatorProfile':
      case 'submitKajianReflection': return writeRequired();
      default: throw new Error('Endpoint V2 belum dipetakan: ' + name);
    }
  }

  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { return makeRunner(fn, failureHandler); };
        if (prop === 'withFailureHandler') return function (fn) { return makeRunner(successHandler, fn); };
        return function () {
          const args = Array.prototype.slice.call(arguments);
          let method = String(prop), payload;
          if (method === 'backendInvoke') { method = args[0]; payload = args[1]; }
          else payload = args.length <= 1 ? args[0] : args;
          invoke(method, payload).then(function (data) {
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

/*
 * ETOS ID PALU — Supabase Direct Compatibility Layer
 * Browser -> Supabase Data API. No Google Apps Script runtime.
 * Uses publishable key only. Never place service_role / secret key here.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jrrmgfzfpcrjtyjqpaff.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VyCXSeR2FaGERAoEUDU5DA_vMigqty3';
  const DIRECT_VERSION = 'ETOS-V2-DIRECT-2026.09.01';
  const CACHE_MS = 45000;
  const memory = { bootstrap: null, savedAt: 0, inflight: null, lastMs: null };

  function numberOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function clean(v) { return v == null ? '' : String(v).trim(); }
  function low(v) { return clean(v).toLowerCase(); }
  function isActive(v) { return low(v) === 'aktif'; }
  function isAlumni(v) { return ['lulus', 'alumni', 'tidak aktif'].includes(low(v)); }

  async function rest(path, options) {
    options = options || {};
    const headers = Object.assign({
      apikey: SUPABASE_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }, options.headers || {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
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
      rest('v_etos_v2_achievements?select=*&order=achievement_year.desc.nullslast,name.asc')
    ]).then(function (all) {
      memory.lastMs = Math.round(performance.now() - started);
      const value = {
        stats: (all[0] && all[0][0]) || {},
        awardees: all[1] || [],
        academic: all[2] || [],
        achievements: all[3] || []
      };
      memory.bootstrap = value;
      memory.savedAt = Date.now();
      memory.inflight = null;
      window.dispatchEvent(new CustomEvent('etos-direct-loaded', { detail: { ms: memory.lastMs } }));
      return value;
    }).catch(function (err) {
      memory.inflight = null;
      throw err;
    });
    return memory.inflight;
  }

  function mapAwardee(a) {
    const gpa = numberOrNull(a.latest_gpa);
    return {
      id: clean(a.id), nama: clean(a.name), kampus: clean(a.university) || '-', jurusan: clean(a.major) || '-',
      angkatan: clean(a.cohort), status: clean(a.status) || '-', motto: clean(a.motto), foto: clean(a.photo_url),
      ipk: gpa == null ? '' : gpa.toFixed(2), progress: isAlumni(a.status) ? 100 : 0
    };
  }

  function mapAcademic(r) {
    return { id: clean(r.id), awdId: clean(r.awardee_code), nama: clean(r.name), angkatan: clean(r.cohort), smt: clean(r.semester), semester: clean(r.semester), ipk: numberOrNull(r.gpa) };
  }

  function mapAchievement(r) {
    return { id: clean(r.id), awdId: clean(r.awardee_code), nama: clean(r.name), prestasi: clean(r.achievement_name), penyelenggara: '', tahun: clean(r.achievement_year), tingkat: clean(r.level), kategori: clean(r.category) };
  }

  function latestGpaByAwardee(academic) {
    const out = {};
    academic.forEach(function (r) { const id = clean(r.awardee_code), gpa = numberOrNull(r.gpa); if (id && gpa != null) out[id] = gpa; });
    return out;
  }

  function average(values) {
    const nums = values.filter(function (x) { return Number.isFinite(x); });
    return nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : null;
  }

  function buildCommandCenter(db) {
    const active = db.awardees.filter(function (a) { return isActive(a.status); });
    const gpaMap = latestGpaByAwardee(db.academic), cohorts = {};
    active.forEach(function (a) {
      const key = clean(a.cohort) || '-';
      if (!cohorts[key]) cohorts[key] = { cohort: key, active: 0, gpas: [] };
      cohorts[key].active += 1;
      if (gpaMap[a.id] != null) cohorts[key].gpas.push(gpaMap[a.id]);
    });
    return {
      summary: { active: active.length, needs_attention: 0, high_attention: 0, rtl_overdue: 0, stale_coaching: 0, positive_momentum: 0 },
      period: null, attention: [], upcomingActions: [],
      cohorts: Object.keys(cohorts).sort().map(function (key) { const c = cohorts[key]; return { cohort: c.cohort, active: c.active, needs_attention: 0, avg_ipk: average(c.gpas), avg_attendance: null, open_cases: 0, top_issues: [], positive_momentum: 0 }; }),
      positiveMomentum: []
    };
  }

  function getProfileById(db, idOrName) {
    const needle = low(idOrName);
    const a = db.awardees.find(function (x) { return low(x.id) === needle || low(x.name) === needle; });
    if (!a) throw new Error('Awardee tidak ditemukan.');
    return Object.assign({}, mapAwardee(a), { wa: 'Terlindungi', email: 'Terlindungi' });
  }

  function getAssessmentHub(db) {
    return { awardees: db.awardees.filter(function (a) { return isActive(a.status); }).map(function (a) { return { id: clean(a.id), nama: clean(a.name), kampus: clean(a.university), jurusan: clean(a.major), angkatan: clean(a.cohort) }; }) };
  }

  function getIdpOverview(db) {
    const active = db.awardees.filter(function (a) { return isActive(a.status); });
    const connectedCount = Number(db.stats.idp_connected || 0);
    return {
      sourceName: 'Supabase — IDP Snapshot', totalActive: active.length, connected: connectedCount, missing: Math.max(0, active.length - connectedCount),
      items: active.map(function (a, i) { const connected = i < connectedCount; return { id: clean(a.id), nama: clean(a.name), angkatan: clean(a.cohort), status: clean(a.status), connected: connected, sheetName: connected ? clean(a.name) : '', filledRows: 0, filledCells: 0, lastRow: 0, lastColumn: 0, truncated: false, sourceType: 'supabase' }; })
    };
  }

  function awardee360(db, params) {
    const profile = getProfileById(db, (params && (params.id_awardee || params.nama)) || '');
    const academic = db.academic.filter(function (x) { return clean(x.awardee_code) === profile.id; }).map(mapAcademic);
    const achievements = db.achievements.filter(function (x) { return clean(x.awardee_code) === profile.id; }).map(mapAchievement);
    let delta = null;
    if (academic.length >= 2 && academic[academic.length - 1].ipk != null && academic[academic.length - 2].ipk != null) delta = Number(academic[academic.length - 1].ipk) - Number(academic[academic.length - 2].ipk);
    return {
      profile: profile,
      briefing: { text: 'Ringkasan V2 dibaca langsung dari Supabase. Data sensitif tetap dilindungi sampai Supabase Auth/RLS fasilitator diaktifkan.' },
      analysis: { tingkat_perhatian: 'Belum cukup data', ringkasan: 'Data akademik dan prestasi sudah tersambung langsung. Sinyal coaching/IDP sensitif menunggu jalur autentikasi fasilitator.', catatan_peninjauan: 'Gunakan sebagai bahan percakapan pendampingan; verifikasi konteks bersama awardee.' },
      growth: { momentum: delta == null ? 'Belum cukup data' : (delta > 0 ? 'Positif' : delta < 0 ? 'Perlu dicermati' : 'Stabil'), academic_delta: delta },
      competencies: { items: [] }, idp: { tersedia: false, skor_kelengkapan: 0 }, reflection: { tersedia: false }, attendance: { tersedia: false }, assessment: { records: {}, completed: 0, needCheckin: false },
      academic: academic, coaching: [], organizations: [], achievements: achievements, portfolio: { tersedia: false }, cases: []
    };
  }

  async function invoke(name, params) {
    const db = await loadBootstrap(false);
    switch (name) {
      case 'getDashboardStats': { const gpas = db.awardees.map(function (a) { return numberOrNull(a.latest_gpa); }).filter(function (x) { return x != null; }), avg = average(gpas); return { totalAwardee: Number(db.stats.awardees_total || db.awardees.length), aktif: Number(db.stats.awardees_active || db.awardees.filter(function (a) { return isActive(a.status); }).length), warning: db.awardees.filter(function (a) { return low(a.status).indexOf('warning') !== -1; }).length, avgIPK: avg == null ? '-' : avg.toFixed(2), directMs: memory.lastMs }; }
      case 'getFeaturedAwardees': case 'getAwardeeList': return db.awardees.map(mapAwardee);
      case 'getAlumniList': return db.awardees.filter(function (a) { return isAlumni(a.status); }).map(function (a) { return Object.assign(mapAwardee(a), { kontribusi: 'Belum diperbarui', cv: '', gdrive: '' }); });
      case 'getAkademikList': return db.academic.map(mapAcademic);
      case 'getPrestasiList': return db.achievements.map(mapAchievement);
      case 'getAwardeeProfile': return getProfileById(db, params);
      case 'getOrganisasiList': return [];
      case 'getAbsensiList': return { items: [], periods: [], selectedPeriod: null, unresolvedTahsin: 0 };
      case 'getCoachingList': return [];
      case 'getIDPOverview': return getIdpOverview(db);
      case 'getIDPDetail': throw new Error('Detail IDP sensitif belum dipublikasikan ke role browser. Data tidak dihapus; jalur Supabase Auth/RLS sedang digunakan untuk versi penuh.');
      case 'getAssessmentHub': return getAssessmentHub(db);
      case 'getFacilitatorAssessmentHub': return { awardees: getAssessmentHub(db).awardees.map(function (a) { return Object.assign({}, a, { completed: 0, needCheckin: false }); }) };
      case 'getFacilitatorAssessmentReport': return { awardee: null, records: {}, completed: 0, needCheckin: false };
      case 'getMentoringCases': return [];
      case 'getMentoringCommandCenter': return buildCommandCenter(db);
      case 'getAwardee360': return awardee360(db, params || {});
      case 'getFasilitatorProfile': return { nama: 'Fasilitator ETOS ID Palu', email: 'admin@etosid.com', wa: '', wilayah: 'Palu', bio: 'Dashboard V2 Direct Supabase' };
      case 'getLatestAwardeeRuleAnalysis': return { nama: params && params.nama ? params.nama : '', available: false };
      case 'analyzeAwardeeWithRules': return { available: false, nama: params && params.nama ? params.nama : '', analysis: { ringkasan: 'Analisis rule-based sensitif akan diaktifkan melalui jalur autentikasi fasilitator.', tingkat_perhatian: 'Belum cukup data', kekuatan: [], area_perhatian: [], rekomendasi_pendampingan: [], pertanyaan_coaching: [], prioritas_aksi: [], indikator_aturan: [], kualitas_data: { data_tersedia: ['Akademik', 'Prestasi'], data_belum_tersedia: ['IDP sensitif', 'Coaching', 'Absensi'], catatan: 'Preview V2 direct Supabase.' }, catatan_peninjauan: 'Verifikasi bersama awardee.' } };
      case 'verifyFacilitatorAccess': case 'verifyAbsensiAdminPin': return { token: 'v2-safe-preview' };
      case 'getAbsensiEntryOptions': return { periods: [], agendas: [], awardees: db.awardees.filter(function (a) { return isActive(a.status); }).map(mapAwardee), cohorts: [] };
      case 'getPublicKajianReflectionForm': throw new Error('Form refleksi publik belum dipindahkan ke endpoint Supabase V2.');
      case 'verifyKajianReflectionParticipant': throw new Error('Verifikasi refleksi V2 belum diaktifkan.');
      case 'submitKajianReflection': throw new Error('Penyimpanan refleksi V2 belum diaktifkan.');
      case 'verifyAssessmentAccess': return { records: {} };
      case 'saveAssessment': throw new Error('Write operation membutuhkan Supabase Auth/RLS.');
      case 'saveMentoringCase': case 'updateMentoringCase': case 'saveCompetencyEvidence': case 'saveAbsensiEntry': case 'saveAwardee': case 'saveAkademik': case 'saveCoaching': case 'savePrestasi': case 'saveOrganisasi': case 'saveAlumniPortfolio': case 'saveAwardeePhoto': case 'saveFasilitatorProfile': throw new Error('Operasi admin V2 membutuhkan Supabase Auth/RLS. Data baca sudah direct Supabase.');
      case 'logoutAbsensiAdmin': return true;
      default: throw new Error('Endpoint V2 belum dipetakan: ' + name);
    }
  }

  function makeRunner(successHandler, failureHandler) {
    return new Proxy({}, { get: function (_, prop) {
      if (prop === 'withSuccessHandler') return function (fn) { return makeRunner(fn, failureHandler); };
      if (prop === 'withFailureHandler') return function (fn) { return makeRunner(successHandler, fn); };
      return function () {
        const args = Array.prototype.slice.call(arguments); let method = String(prop), payload;
        if (method === 'backendInvoke') { method = args[0]; payload = args[1]; } else payload = args.length <= 1 ? args[0] : args;
        invoke(method, payload).then(function (data) { if (typeof successHandler === 'function') successHandler({ success: true, data: data }); }).catch(function (err) { if (typeof failureHandler === 'function') failureHandler(err); else console.error('[ETOS V2]', method, err); });
        return makeRunner(successHandler, failureHandler);
      };
    }});
  }

  if (!window.google) window.google = {};
  if (!window.google.script) window.google.script = {};
  window.google.script.run = makeRunner(null, null);

  window.etosSupabaseDirect = { version: DIRECT_VERSION, url: SUPABASE_URL, invoke: invoke, refresh: function () { memory.savedAt = 0; return loadBootstrap(true); }, performance: function () { return { lastMs: memory.lastMs, savedAt: memory.savedAt }; } };
  loadBootstrap(false).catch(function (err) { console.error('[ETOS V2] Bootstrap failed:', err); });
  console.info(DIRECT_VERSION, 'Browser -> Supabase');
})();

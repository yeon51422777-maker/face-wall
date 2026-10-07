/* =========================================================
   FACE WALL 공통 코드 — 큰 화면 · 폰 · 관리자가 함께 씀
   - Firebase 연결 (LUCKY GRAB과 같은 프로젝트, 경로만 다름)
   - 그림 데이터 줄이기/풀기, 얼굴 그리기
   - ?local=1 을 붙이면 Firebase 없이 같은 브라우저 안에서만 연결 (연습·시연용)
   ========================================================= */
export const FB = {apiKey:"AIzaSyC_MlxFT3AFFb19l-XLwcKwxKtWam1g5To",authDomain:"teacher-letter-48131.firebaseapp.com",databaseURL:"https://teacher-letter-48131-default-rtdb.firebaseio.com",projectId:"teacher-letter-48131",storageBucket:"teacher-letter-48131.firebasestorage.app",messagingSenderId:"873083888112",appId:"1:873083888112:web:f157c8dc34f5c362dcbd35"};

const qs = new URLSearchParams(location.search);
export const ROOM = ((qs.get('room') || 'main').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)) || 'main';
export const LOCAL = qs.get('local') === '1';
export const ROOT = 'rolling/facewall/' + ROOM;
export const PASSWORD = '1212';

export const DEFAULTS = {
  showTitle: false,   // 큰 화면 왼쪽 위 제목 (레퍼런스처럼 기본은 숨김)
  size: 's',          // 큰 화면 얼굴 크기: xs·s·m·l
  eyebrow: '참여형 드로잉 월',
  title1: '그릴수록',
  title2: '화면이 채워져요',
  sub: 'QR을 찍고 내 얼굴을 그려 보세요. 큰 화면에 바로 나타나요.',
  max: 80,      // 화면에 한 번에 보이는 얼굴 수 (넘으면 오래된 것부터 빠짐)
  open: true,   // false면 폰에서 보내기 멈춤
};

/* ---------- 색 · 굵기 (폰 화면 1000칸 기준) ---------- */
// 앞 8개는 처음 버전과 같은 순서 (이미 저장된 그림이 그대로 보이게)
export const COLORS = ['#1D1D22', '#F2474D', '#FF7AC6', '#FF9A3D', '#FFC83A', '#3CC46E', '#3D6CF2', '#9B6BF2',
                       '#FFFFFF', '#8A8A8F', '#8B5A2B', '#B8F400', '#5BC8F5', '#1E2A78', '#9E1B32', '#F5C9A0'];
export const COLOR_KO = ['검정', '빨강', '분홍', '주황', '노랑', '초록', '파랑', '보라', '흰색(지우개)', '회색', '갈색', '연두', '하늘', '남색', '자주', '살구'];
export const WIDTHS = [12, 30, 72, 140];
export const isLine = (c) => c === 0 || c === 13;   // 검정·남색은 '선'으로 보고 나중에 그려지게

/* ---------- 점 목록 ↔ 짧은 문자열 (점 하나 = 4글자) ---------- */
const b36 = (n) => Math.max(0, Math.min(1295, n | 0)).toString(36).padStart(2, '0');
export function enc(pts) { let s = ''; for (const [x, y] of pts) s += b36(x) + b36(y); return s; }
export function dec(s) { const o = []; for (let i = 0; i + 3 < s.length; i += 4) o.push([parseInt(s.substr(i, 2), 36), parseInt(s.substr(i + 2, 2), 36)]); return o; }
export function unpack(strokes) { return (strokes || []).map((k) => ({ c: k.c | 0, w: k.w | 0, p: typeof k.p === 'string' ? dec(k.p) : k.p })); }

/* ---------- 작은 난수 ---------- */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- 그림이 차지하는 칸 (굵기 포함) ---------- */
export function bbox(strokes) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const k of strokes) { const r = WIDTHS[k.w] / 2; for (const [x, y] of k.p) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); } }
  if (x0 > x1) return { x: 0, y: 0, s: 1000 };
  const s = Math.max(x1 - x0, y1 - y0, 160);
  return { x: (x0 + x1) / 2 - s / 2, y: (y0 + y1) / 2 - s / 2, s };
}
export function countPoints(strokes) { let n = 0; for (const k of strokes) n += k.p.length; return n; }

/* ---------- 선 하나 그리기 (중간점 곡선으로 부드럽게) ---------- */
function line(ctx, pts) {
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
  const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]); ctx.stroke();
}

/* 얼굴 그리기
   fit: true면 그림 크기에 맞춰 칸을 꽉 채움 / false면 폰 화면 그대로(1000칸)
   wobble: 손그림이 살짝 떨리는 정도(0이면 그대로), seed: 떨림 모양
   progress: 0~1, 그려지는 중간 모습 */
export function drawFace(ctx, strokes, { x = 0, y = 0, size = 100, fit = true, wobble = 0, seed = 1, progress = 1, box } = {}) {
  const b = fit ? (box || bbox(strokes)) : { x: 0, y: 0, s: 1000 };
  const sc = size / b.s, R = wobble ? rng(seed) : null;
  let budget = progress >= 1 ? Infinity : Math.floor(countPoints(strokes) * progress);
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-b.x, -b.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const k of strokes) {
    if (budget <= 0) break;
    let pts = k.p.length > budget ? k.p.slice(0, budget) : k.p; budget -= pts.length;
    if (R) { const dx = (R() - .5) * wobble, dy = (R() - .5) * wobble; pts = pts.map(([px, py]) => [px + dx + (R() - .5) * wobble * .6, py + dy + (R() - .5) * wobble * .6]); }
    ctx.strokeStyle = ctx.fillStyle = COLORS[k.c] || COLORS[0];
    ctx.lineWidth = WIDTHS[k.w] * (R ? 0.94 + R() * 0.12 : 1);
    line(ctx, pts);
  }
  ctx.restore();
}

/* ---------- 연습용 얼굴 만들기 (손그림 느낌) ---------- */
export function demoFace(seed) {
  const R = rng(seed), out = [], cx = 500 + (R() - .5) * 60, cy = 520 + (R() - .5) * 60;
  const rx = 230 + R() * 110, ry = 230 + R() * 110, col = 1 + Math.floor(R() * 7);
  const wob = (t) => 1 + Math.sin(t * 3 + seed) * .05 + Math.sin(t * 5 + seed * 2) * .04;
  // 1) 얼굴 색칠 — 굵은 붓으로 빙글빙글
  const fill = [];
  for (let t = 0, r = 0.12; r < 0.9; t += 0.32, r += 0.012) fill.push([cx + Math.cos(t) * rx * r, cy + Math.sin(t) * ry * r]);
  out.push({ c: col, w: 2, p: fill });
  for (let t = 0; t < Math.PI * 2; t += .25) out.push({ c: col, w: 2, p: [[cx + Math.cos(t) * rx * .86 * wob(t), cy + Math.sin(t) * ry * .86 * wob(t)]] });
  // 2) 윤곽선 (가끔만)
  if (R() < .55) { const o = []; for (let t = 0; t <= Math.PI * 2 + .3; t += .18) o.push([cx + Math.cos(t) * rx * wob(t), cy + Math.sin(t) * ry * wob(t)]); out.push({ c: 0, w: 0, p: o }); }
  // 3) 눈
  const ey = cy - ry * (.15 + R() * .15), ex = rx * (.3 + R() * .12), kind = Math.floor(R() * 3);
  for (const sx of [-1, 1]) {
    const x = cx + sx * ex;
    if (kind === 0) out.push({ c: 0, w: 1, p: [[x, ey]] });
    else if (kind === 1) { const o = []; for (let t = 0; t <= 6.6; t += .5) o.push([x + Math.cos(t) * 34, ey + Math.sin(t) * 34]); out.push({ c: 0, w: 0, p: o }); out.push({ c: 0, w: 1, p: [[x + 6, ey + 4]] }); }
    else { const o = []; for (let t = 0; t < 12; t += .55) o.push([x + Math.cos(t) * t * 3.6, ey + Math.sin(t) * t * 3.6]); out.push({ c: 0, w: 0, p: o }); }
  }
  // 4) 입
  const my = cy + ry * (.32 + R() * .15), mw = rx * (.25 + R() * .25), smile = R() < .8 ? 1 : -1, m = [];
  for (let t = -1; t <= 1.01; t += .2) m.push([cx + t * mw, my + smile * (1 - t * t) * (30 + R() * 40)]);
  out.push({ c: 0, w: R() < .5 ? 0 : 1, p: m });
  // 5) 머리카락 (가끔)
  if (R() < .5) { const h = []; for (let t = -1; t <= 1; t += .08) h.push([cx + t * rx * .85, cy - ry * .95 + Math.sin(t * 14) * 22]); out.push({ c: R() < .5 ? 0 : 1 + Math.floor(R() * 7), w: 1, p: h }); }
  return out.map((k) => ({ ...k, p: k.p.map(([x, y]) => [Math.round(Math.max(0, Math.min(999, x))), Math.round(Math.max(0, Math.min(999, y)))]) }));
}
export const DEMO_NAMES = ['민지', '서준', '하윤', '도윤', '지우', '시우', '서아', '하준', '수아', '예준', '지호', '아린', '유나', '이안', '로아', '건우'];
export const DEMO_MSGS = ['안녕!', '반가워요', '나야 나', '오늘 신나요', '', '', '하이~', '최고!', '', '웃어요'];

/* =========================================================
   저장소 연결 — Firebase 또는 local(같은 브라우저)
   ========================================================= */
export async function connect() { return LOCAL ? localStore() : firebaseStore(); }

async function firebaseStore() {
  const [app, api] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js')]);
  const db = api.getDatabase(app.initializeApp(FB));
  const r = (p) => api.ref(db, ROOT + (p ? '/' + p : ''));
  return {
    kind: 'firebase',
    onConnected(cb) { api.onValue(api.ref(db, '.info/connected'), (s) => cb(s.val() === true)); },
    onFaces(added, removed) {
      api.onChildAdded(r('faces'), (s) => added(s.key, s.val()));
      api.onChildRemoved(r('faces'), (s) => removed(s.key));
    },
    async getFaces() { return (await api.get(r('faces'))).val() || {}; },
    async addFace(v) { const k = api.push(r('faces')); await api.set(k, v); return k.key; },
    removeFace(id) { return api.remove(r('faces/' + id)); },
    clearFaces() { return api.remove(r('faces')); },
    onSettings(cb) { api.onValue(r('settings'), (s) => cb({ ...DEFAULTS, ...(s.val() || {}) })); },
    setSettings(v) { return api.update(r('settings'), v); },
  };
}

function localStore() {
  const KEY = 'fw-local-' + ROOM, ch = new BroadcastChannel(KEY);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { faces: {}, settings: {} }; } catch (e) { return { faces: {}, settings: {} }; } };
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  const L = { added: [], removed: [], settings: [] };
  const emitSettings = () => { const s = { ...DEFAULTS, ...load().settings }; L.settings.forEach((f) => f(s)); };
  ch.onmessage = (e) => {
    const m = e.data;
    if (m.t === 'add') L.added.forEach((f) => f(m.id, m.v));
    if (m.t === 'del') m.ids.forEach((id) => L.removed.forEach((f) => f(id)));
    if (m.t === 'set') emitSettings();
  };
  const send = (m) => { ch.postMessage(m); ch.onmessage({ data: m }); };   // 다른 탭 + 나 자신
  return {
    kind: 'local',
    onConnected(cb) { cb(true); },
    onFaces(added, removed) { L.added.push(added); L.removed.push(removed); for (const [id, v] of Object.entries(load().faces).sort((a, b) => a[1].at - b[1].at)) added(id, v); },
    async getFaces() { return load().faces; },
    async addFace(v) { const d = load(), id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); d.faces[id] = v; save(d); send({ t: 'add', id, v }); return id; },
    async removeFace(id) { const d = load(); delete d.faces[id]; save(d); send({ t: 'del', ids: [id] }); },
    async clearFaces() { const d = load(), ids = Object.keys(d.faces); d.faces = {}; save(d); send({ t: 'del', ids }); },
    onSettings(cb) { L.settings.push(cb); cb({ ...DEFAULTS, ...load().settings }); },
    async setSettings(v) { const d = load(); d.settings = { ...d.settings, ...v }; save(d); send({ t: 'set' }); },
  };
}

/* 주소 만들기 (같은 폴더의 다른 파일, room·local 유지) */
export function pageUrl(file) {
  const u = new URL(file, location.href.split('#')[0].split('?')[0]);
  if (ROOM !== 'main') u.searchParams.set('room', ROOM);
  if (LOCAL) u.searchParams.set('local', '1');
  return u.href;
}

// Maktab test tizimi — Vercel server funksiyasi.
// Barcha /api/... so'rovlar shu faylga keladi (vercel.json ga qarang).
// Ma'lumotlar Supabase'da saqlanadi. npm paket kerak emas: fetch Node.js ichida bor.
const crypto = require('crypto');

// Vercel sozlamalaridan (Environment Variables) olinadi
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_KEY || '';           // service_role / secret kalit — faqat serverda!
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const LETTERS = ['A', 'B', 'C', 'D'];
const FILES_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/files/`;

// ---------- Yordamchilar ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (message, status = 400) => { throw new HttpError(status, message); };

const newId = () => crypto.randomBytes(6).toString('hex');
const newPassword = () => String(crypto.randomInt(100000, 1000000)); // 6 xonali parol

// Sana Toshkent vaqtida: "2026-10-29 16:58"
const localDate = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).slice(0, 16);

const byClassAndName = (a, b) =>
  String(a.cls).localeCompare(String(b.cls)) || String(a.last_name).localeCompare(String(b.last_name));

// Javoblar shu ko'rinishda saqlanadi: [{ q: savol raqami, a: 'B' }, ...]
function score(test, answers) {
  const total = answers.length;
  const correct = answers.filter(x => test.questions[x.q] && test.questions[x.q].answer === x.a).length;
  return { correct, total, percent: total ? Math.round((correct / total) * 100) : 0 };
}

// O'quvchiga nechta savol beriladi
const questionCount = t => t.pick || t.questions.length;

// Har bir o'quvchiga o'z savollari va o'z tartibi.
// Tasodif o'quvchi ID + test ID dan hisoblanadi (hash), shuning uchun
// sahifa yangilansa ham o'sha o'quvchiga aynan o'sha savollar chiqadi.
function questionOrder(t, studentId) {
  const order = t.questions.map((_, i) => i);
  if (t.type === 'pdf') return order; // PDF da tartib o'zgarmaydi
  const key = i => crypto.createHash('sha256').update(`${t.id}:${studentId}:${i}`).digest('hex');
  const keys = order.map(key);
  order.sort((a, b) => keys[a].localeCompare(keys[b]));
  return order.slice(0, questionCount(t));
}

// Excel to'g'ri ochishi uchun: BOM + nuqtali vergul
function csv(fileName, header, rows) {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return { csv: '﻿' + [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n'), fileName };
}

// ---------- Supabase ----------
function sbHeaders(extra = {}) {
  const h = { apikey: KEY, ...extra };
  if (KEY.startsWith('eyJ')) h.Authorization = `Bearer ${KEY}`; // eski turdagi (JWT) kalit uchun
  return h;
}

// Jadval bilan ishlash, masalan: db('GET', 'students?cls=eq.7-A')
async function db(method, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method,
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status === 409) fail('Bu yozuv allaqachon mavjud');
  if (!r.ok) { console.error(method, query, r.status, text); fail('Bazada xatolik', 500); }
  return text ? JSON.parse(text) : null;
}
const enc = encodeURIComponent;

// ---------- Kirish (login) ----------
// Server hech narsani eslab qolmaydi, shuning uchun kirish ma'lumoti
// cookie ichida turadi va soxtalashtirib bo'lmasligi uchun imzolanadi (HMAC).
const sign = data => crypto.createHmac('sha256', KEY).update(data).digest('hex');

function makeCookie(session) {
  const data = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 12 * 3600 * 1000 })).toString('base64url');
  return `sid=${data}.${sign(data)}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=43200`;
}

function readSession(req) {
  const m = /(?:^|;\s*)sid=([\w-]+)\.([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m || sign(m[1]) !== m[2]) return null;
  const s = JSON.parse(Buffer.from(m[1], 'base64url').toString());
  return s.exp > Date.now() ? s : null;
}

async function login(b, res) {
  const lg = String(b.login || '').trim();
  const pw = String(b.password || '').trim();
  let session = null;
  if (lg === 'admin' && pw === ADMIN_PASSWORD) session = { role: 'admin' };
  else if (lg && pw) {
    const [st] = await db('GET', `students?id=eq.${enc(lg)}&password=eq.${enc(pw)}`);
    if (st) session = { role: 'student', id: st.id };
  }
  if (!session) fail('ID yoki parol notoʻgʻri');
  res.setHeader('Set-Cookie', makeCookie(session));
  return { role: session.role };
}

// ---------- Testni tekshirish ----------
const isFileUrl = u => typeof u === 'string' && u.startsWith(FILES_PREFIX) && /^[a-f0-9]+\.(png|jpe?g|gif|webp|pdf)$/.test(u.slice(FILES_PREFIX.length));

function cleanTest(b) {
  const title = String(b.title || '').trim() || fail('Test nomini kiriting');
  const type = b.type === 'pdf' ? 'pdf' : 'questions';
  const list = Array.isArray(b.questions) ? b.questions : [];
  const questions = list.map((q, i) => {
    const answer = String(q.answer || '').toUpperCase();
    if (!LETTERS.includes(answer)) fail(`${i + 1}-savolning toʻgʻri javobini belgilang`);
    if (type === 'pdf') return { answer };
    const text = String(q.text || '').trim();
    const image = isFileUrl(q.image) ? q.image : '';
    if (!text && !image) fail(`${i + 1}-savolga matn yoki rasm qoʻshing`);
    const options = LETTERS.map((_, k) => String((q.options || [])[k] || '').trim());
    return { text, image, options, answer };
  });
  if (!questions.length) fail('Kamida bitta savol boʻlsin');
  const pdf = type === 'pdf' ? (isFileUrl(b.pdf) ? b.pdf : fail('PDF faylni yuklang')) : '';
  // Har bir o'quvchiga nechta savol (0 = hammasi). Savollar sonidan ko'p bo'lsa — hammasi.
  let pick = type === 'questions' ? Math.max(0, parseInt(b.pick, 10) || 0) : 0;
  if (pick >= questions.length) pick = 0;
  return { title, cls: String(b.cls || '').trim(), type, pdf, questions, pick };
}

async function getTest(id) {
  const [t] = await db('GET', `tests?id=eq.${enc(id)}`);
  return t || fail('Test topilmadi', 404);
}

// Natijalar + o'quvchi ismi (Supabase bog'langan jadvalni o'zi qo'shib beradi)
async function resultRows(testId) {
  const rows = await db('GET', `results?test_id=eq.${enc(testId)}&select=*,students(first_name,last_name,cls)`);
  return rows.map(({ students: s, ...r }) => ({ ...r, ...(s || {}), date: localDate(r.created_at) })).sort(byClassAndName);
}

// ---------- O'qituvchi (admin) uchun API ----------
const adminRoutes = {
  'GET students': () => db('GET', 'students?order=cls,last_name,first_name'),

  // Har qatorda "Familiya Ism" — birdaniga butun sinfni qo'shish mumkin
  'POST students/add': async b => {
    const cls = String(b.cls || '').trim() || fail('Sinfni kiriting');
    const used = new Set((await db('GET', 'students?select=id')).map(s => s.id));
    const rows = [];
    for (const line of String(b.text || '').split('\n')) {
      const parts = line.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;
      let id;
      do id = String(crypto.randomInt(100000, 1000000)); while (used.has(id));
      used.add(id);
      rows.push({ id, last_name: parts[0], first_name: parts.slice(1).join(' '), cls, password: newPassword() });
    }
    if (!rows.length) fail('Har bir qatorda "Familiya Ism" boʻlsin');
    return db('POST', 'students', rows);
  },

  // Natijalari ham o'chadi (bazada "on delete cascade")
  'POST students/delete': async b => { await db('DELETE', `students?id=eq.${enc(b.id)}`); return { ok: true }; },

  'POST students/reset': async b => {
    const [st] = await db('PATCH', `students?id=eq.${enc(b.id)}`, { password: newPassword() });
    return st || fail('Oʻquvchi topilmadi');
  },

  'GET students.csv': async () => csv('oquvchilar.csv', ['ID', 'Familiya', 'Ism', 'Sinf', 'Parol'],
    (await adminRoutes['GET students']()).map(s => [s.id, s.last_name, s.first_name, s.cls, s.password])),

  'GET tests': () => db('GET', 'tests?order=created_at.desc'),

  'POST tests/save': async b => {
    const t = cleanTest(b);
    if (!b.id) return (await db('POST', 'tests', { id: newId(), ...t }))[0];
    const [saved] = await db('PATCH', `tests?id=eq.${enc(b.id)}`, t);
    if (!saved) fail('Test topilmadi');
    // Kalit o'zgargan bo'lishi mumkin — eski natijalarni qayta hisoblaymiz
    for (const r of await db('GET', `results?test_id=eq.${enc(saved.id)}`)) {
      await db('PATCH', `results?id=eq.${enc(r.id)}`, score(saved, r.answers));
    }
    return saved;
  },

  'POST tests/delete': async b => { await db('DELETE', `tests?id=eq.${enc(b.id)}`); return { ok: true }; },

  'POST tests/toggle': async b => {
    const t = await getTest(b.id);
    return (await db('PATCH', `tests?id=eq.${enc(t.id)}`, { active: !t.active }))[0];
  },

  // Fayl Vercel orqali emas, brauzerdan to'g'ridan-to'g'ri Supabase'ga yuklanadi.
  // Server faqat bir martalik yuklash havolasini beradi.
  'POST upload-url': async b => {
    const ext = (/\.[a-z]+$/.exec(String(b.name || '').toLowerCase()) || [''])[0];
    if (!/^\.(png|jpe?g|gif|webp|pdf)$/.test(ext)) fail('Faqat rasm (png, jpg) yoki PDF yuklash mumkin');
    const name = newId() + ext;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/files/${name}`, { method: 'POST', headers: sbHeaders() });
    if (!r.ok) { console.error('upload sign', r.status, await r.text()); fail('Fayl yuklashda xatolik', 500); }
    const { url } = await r.json();
    return { uploadUrl: `${SUPABASE_URL}/storage/v1${url}`, publicUrl: FILES_PREFIX + name };
  },

  'GET results': (b, url) => resultRows(url.searchParams.get('test')),

  'GET results.csv': async (b, url) => {
    const t = await getTest(url.searchParams.get('test'));
    return csv(`natijalar - ${t.title}.csv`,
      ['№', 'Familiya', 'Ism', 'Sinf', 'ID', 'Toʻgʻri', 'Jami', 'Foiz', 'Sana'],
      (await resultRows(t.id)).map((r, i) => [i + 1, r.last_name, r.first_name, r.cls, r.student_id, r.correct, r.total, r.percent, r.date]));
  },

  // Jonli reyting: hozir ochiq turgan barcha testlar bo'yicha
  'GET rating': async () => {
    const tests = await db('GET', 'tests?active=is.true&order=created_at&select=id,title,questions,pick');
    if (!tests.length) return { tests: [], rows: [] };
    const ids = tests.map(t => `"${t.id}"`).join(',');
    const results = await db('GET', `results?test_id=in.(${enc(ids)})&select=*,students(first_name,last_name,cls)`);

    const byStudent = new Map();
    for (const r of results) {
      if (!r.students) continue;
      let row = byStudent.get(r.student_id);
      if (!row) {
        row = { id: r.student_id, name: `${r.students.last_name} ${r.students.first_name}`, cls: r.students.cls, scores: {}, sum: 0, last: '' };
        byStudent.set(r.student_id, row);
      }
      row.scores[r.test_id] = r.correct;
      row.sum += r.correct;
      if (r.created_at > row.last) row.last = r.created_at; // oxirgi topshirgan vaqti
    }

    // Ko'p ball yuqorida; ball teng bo'lsa — oldinroq tugatgan yuqorida
    const rows = [...byStudent.values()].sort((a, b) => b.sum - a.sum || a.last.localeCompare(b.last));
    return {
      tests: tests.map(t => ({ id: t.id, title: t.title, total: questionCount(t) })),
      rows: rows.map(r => ({ ...r, last: localDate(r.last) })),
    };
  },

  // Natijani o'chirish = qayta topshirishga ruxsat
  'POST results/delete': async b => { await db('DELETE', `results?id=eq.${enc(b.id)}`); return { ok: true }; },
};

// ---------- O'quvchi uchun API ----------
async function me(session) {
  const [st] = await db('GET', `students?id=eq.${enc(session.id)}`);
  return st || fail('Qaytadan kiring', 401);
}

const forClass = (t, st) => !t.cls || t.cls === st.cls;

async function availableTest(st, id) {
  const [t] = await db('GET', `tests?id=eq.${enc(id)}&active=is.true`);
  if (!t || !forClass(t, st)) fail('Test topilmadi yoki yopilgan');
  const done = await db('GET', `results?test_id=eq.${enc(t.id)}&student_id=eq.${enc(st.id)}&select=id`);
  if (done.length) fail('Siz bu testni topshirib boʻlgansiz');
  return t;
}

const studentRoutes = {
  'GET my-tests': async (b, url, session) => {
    const st = await me(session);
    const tests = (await db('GET', 'tests?active=is.true&order=created_at.desc')).filter(t => forClass(t, st));
    const results = await db('GET', `results?student_id=eq.${enc(st.id)}&select=test_id,correct,total,percent`);
    return tests.map(t => ({
      id: t.id, title: t.title, count: questionCount(t),
      result: results.find(r => r.test_id === t.id) || null,
    }));
  },

  // Testni beramiz, lekin to'g'ri javoblarsiz!
  'GET test': async (b, url, session) => {
    const st = await me(session);
    const t = await availableTest(st, url.searchParams.get('id'));
    return {
      id: t.id, title: t.title, type: t.type, pdf: t.pdf,
      questions: questionOrder(t, st.id).map(i => {
        const q = t.questions[i];
        return { text: q.text || '', image: q.image || '', options: q.options || [] };
      }),
    };
  },

  'POST submit': async (b, url, session) => {
    const st = await me(session);
    const t = await availableTest(st, b.id);
    const sent = Array.isArray(b.answers) ? b.answers : [];
    // k-o'rindagi javob o'quvchiga chiqqan k-savolga tegishli
    const answers = questionOrder(t, st.id).map((q, k) => ({ q, a: LETTERS.includes(sent[k]) ? sent[k] : '' }));
    const s = score(t, answers);
    await db('POST', 'results', { id: newId(), test_id: t.id, student_id: st.id, answers, ...s });
    return s;
  },
};

// ---------- Asosiy funksiya ----------
function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body); // Vercel o'zi o'qib qo'ygan
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new HttpError(400, 'Notoʻgʻri soʻrov')); }
    });
  });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  try {
    if (!SUPABASE_URL || !KEY || !ADMIN_PASSWORD) fail('Server sozlanmagan: SUPABASE_URL, SUPABASE_KEY, ADMIN_PASSWORD ni kiriting', 500);
    const url = new URL(req.url, 'http://localhost');
    const route = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\//, '');
    const body = req.method === 'POST' ? await readBody(req) : {};

    if (route === 'login') return send(res, 200, await login(body, res));
    if (route === 'logout') {
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; Secure; Path=/; Max-Age=0');
      return send(res, 200, { ok: true });
    }
    // Har kuni Vercel cron chaqiradi — Supabase "uxlab qolmasligi" uchun
    if (route === 'ping') { await db('GET', 'tests?select=id&limit=1'); return send(res, 200, { ok: true }); }

    const session = readSession(req) || fail('Avval tizimga kiring', 401);
    if (route === 'me') {
      if (session.role === 'admin') return send(res, 200, { role: 'admin' });
      const st = await me(session);
      return send(res, 200, { role: 'student', id: st.id, first_name: st.first_name, last_name: st.last_name, cls: st.cls });
    }

    const routes = session.role === 'admin' ? adminRoutes : studentRoutes;
    const handler = routes[`${req.method} ${route}`] || fail('Topilmadi', 404);
    const out = await handler(body, url, session);

    if (out && out.csv !== undefined) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.fileName)}`);
      return res.end(out.csv);
    }
    send(res, 200, out);
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    send(res, err.status || 500, { error: err.status ? err.message : 'Serverda xatolik' });
  }
};

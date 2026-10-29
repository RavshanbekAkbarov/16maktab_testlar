// Barcha sahifalar uchun umumiy yordamchilar
const LETTERS = ['A', 'B', 'C', 'D'];

// Serverga so'rov: data berilsa POST, bo'lmasa GET
async function api(url, data) {
  const opt = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
  const r = await fetch(url, opt);
  const json = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/'; throw new Error('login'); }
  if (!r.ok) { alert(json.error || 'Xatolik'); throw new Error(json.error); }
  return json;
}

// Matnni HTML ichiga xavfsiz qo'yish
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Faylni yuklash: server bir martalik havola beradi, fayl to'g'ridan-to'g'ri Supabase'ga ketadi.
// Faylning ochiq manzilini (URL) qaytaradi.
async function upload(file) {
  const { uploadUrl, publicUrl } = await api('/api/upload-url', { name: file.name });
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!r.ok) { alert('Fayl yuklanmadi'); throw new Error('upload'); }
  return publicUrl;
}

// Sana Toshkent vaqtida
const showDate = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).slice(0, 16);

async function logout() {
  await api('/api/logout', {});
  location.href = '/';
}

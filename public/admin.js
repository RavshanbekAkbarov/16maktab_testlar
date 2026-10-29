let students = [];
let tests = [];
let editing = null; // tahrirlanayotgan test

// ---------- Bo'limlar (tablar) ----------
const loaders = { students: loadStudents, tests: loadTests, results: loadResults, rating: loadRating };
let ratingTimer = null;

function showTab(name) {
  document.querySelectorAll('main > section').forEach(s => (s.hidden = s.id !== name));
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  // Reyting ochiq bo'lsa — har 5 soniyada yangilaymiz, boshqa bo'limda — to'xtatamiz
  clearInterval(ratingTimer);
  if (name === 'rating') ratingTimer = setInterval(loadRating, 5000);
  loaders[name]();
}
document.querySelectorAll('.tab').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));

// ---------- O'quvchilar ----------
async function loadStudents() {
  students = await api('/api/students');
  const classes = [...new Set(students.map(s => s.cls))];
  const current = sFilter.value;
  sFilter.innerHTML = '<option value="">Barcha sinflar</option>' +
    classes.map(c => `<option ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');
  renderStudents();
}

function renderStudents() {
  const list = students.filter(s => !sFilter.value || s.cls === sFilter.value);
  sTable.innerHTML = `<tr><th>№</th><th>Familiya Ism</th><th>Sinf</th><th>ID (login)</th><th>Parol</th><th class="no-print"></th></tr>` +
    list.map((s, i) => `<tr>
      <td>${i + 1}</td><td>${esc(s.last_name)} ${esc(s.first_name)}</td><td>${esc(s.cls)}</td>
      <td><b>${s.id}</b></td><td><b>${s.password}</b></td>
      <td class="no-print">
        <button class="link" data-reset="${s.id}">Yangi parol</button>
        <button class="link danger" data-del="${s.id}">Oʻchirish</button>
      </td></tr>`).join('');
}
sFilter.onchange = renderStudents;

sAdd.onclick = async () => {
  const added = await api('/api/students/add', { cls: sCls.value, text: sText.value });
  sText.value = '';
  alert(`${added.length} ta oʻquvchi qoʻshildi`);
  loadStudents();
};

sTable.onclick = async e => {
  const { reset, del } = e.target.dataset;
  if (reset) { await api('/api/students/reset', { id: reset }); loadStudents(); }
  if (del && confirm('Oʻquvchi va uning natijalari oʻchirilsinmi?')) { await api('/api/students/delete', { id: del }); loadStudents(); }
};

// ---------- Testlar ro'yxati ----------
async function loadTests() {
  tests = await api('/api/tests');
  tTable.innerHTML = `<tr><th>Nomi</th><th>Sinf</th><th>Savollar</th><th>Turi</th><th>Holati</th><th></th></tr>` +
    tests.map(t => `<tr>
      <td>${esc(t.title)}</td><td>${esc(t.cls) || 'Hammasi'}</td><td>${t.questions.length}${t.pick ? ` (${t.pick} tadan)` : ""}</td>
      <td>${t.type === 'pdf' ? 'PDF' : 'Savollar'}</td>
      <td>${t.active ? '<span class="ok">Ochiq</span>' : '<span class="muted">Yopiq</span>'}</td>
      <td>
        <button class="link" data-toggle="${t.id}">${t.active ? 'Yopish' : 'Ochish'}</button>
        <button class="link" data-edit="${t.id}">Tahrirlash</button>
        <button class="link" data-res="${t.id}">Natijalar</button>
        <button class="link danger" data-del="${t.id}">Oʻchirish</button>
      </td></tr>`).join('');
}

tTable.onclick = async e => {
  const d = e.target.dataset;
  if (d.toggle) { await api('/api/tests/toggle', { id: d.toggle }); loadTests(); }
  if (d.edit) openEditor(structuredClone(tests.find(t => t.id === d.edit)));
  if (d.res) { rTest.dataset.want = d.res; showTab('results'); }
  if (d.del && confirm('Test va uning barcha natijalari oʻchirilsinmi?')) { await api('/api/tests/delete', { id: d.del }); loadTests(); }
};

// ---------- Test muharriri ----------
const emptyQuestion = () => ({ text: '', image: '', options: ['', '', '', ''], answer: '' });

newTest.onclick = () => openEditor({ title: '', cls: '', type: 'questions', pdf: '', pick: 15, questions: [emptyQuestion()] });
cancelEdit.onclick = () => (editor.hidden = true);

function openEditor(test) {
  editing = test;
  edHead.textContent = test.id ? 'Testni tahrirlash' : 'Yangi test';
  tTitle.value = test.title;
  tCls.value = test.cls;
  tPick.value = test.pick || '';
  document.querySelector(`[name=tType][value=${test.type}]`).checked = true;
  if (test.type === 'questions') {
    test.questions.forEach(q => { q.options = q.options || ['', '', '', '']; q.text = q.text || ''; });
    pdfKey.value = '';
  } else {
    pdfKey.value = test.questions.map(q => q.answer).join('');
  }
  pdfName.textContent = test.pdf ? 'PDF yuklangan ✓' : '';
  switchMode();
  renderQuestions();
  editor.hidden = false;
  editor.scrollIntoView({ behavior: 'smooth' });
}

document.querySelectorAll('[name=tType]').forEach(r => (r.onchange = switchMode));
function switchMode() {
  const isPdf = document.querySelector('[name=tType]:checked').value === 'pdf';
  qMode.hidden = isPdf;
  pdfMode.hidden = !isPdf;
  updateKeyCount();
}

function renderQuestions() {
  qList.innerHTML = editing.questions.map((q, i) => `
    <div class="q" data-i="${i}">
      <div class="row"><b>${i + 1}-savol</b>
        <button class="link danger" data-act="del">Savolni oʻchirish</button></div>
      <textarea data-f="text" rows="2" placeholder="Savol matni (rasm boʻlsa, ixtiyoriy)">${esc(q.text)}</textarea>
      <div class="row" style="margin-top:8px">
        <label class="inline">Rasm: <input type="file" accept="image/*" data-act="img"></label>
        ${q.image ? '<button class="link danger" data-act="noimg">Rasmni olib tashlash</button>' : ''}
      </div>
      ${q.image ? `<img class="qimg" src="${esc(q.image)}">` : ''}
      <div class="opts">${LETTERS.map((L, k) => `
        <label class="opt">
          <input type="radio" name="ans${i}" value="${L}" data-f="answer" ${q.answer === L ? 'checked' : ''}> ${L})
          <input data-f="opt" data-k="${k}" value="${esc(q.options[k])}" placeholder="variant (ixtiyoriy)">
        </label>`).join('')}
      </div>
    </div>`).join('');
}

const questionOf = el => editing.questions[el.closest('.q').dataset.i];

// Yozilgan narsani darhol "editing" ichiga saqlab boramiz
qList.oninput = e => {
  const el = e.target, q = questionOf(el);
  if (el.dataset.f === 'text') q.text = el.value;
  if (el.dataset.f === 'opt') q.options[el.dataset.k] = el.value;
  if (el.dataset.f === 'answer') q.answer = el.value;
};

qList.onchange = async e => {
  const el = e.target;
  if (el.dataset.act !== 'img' || !el.files[0]) return;
  questionOf(el).image = await upload(el.files[0]);
  renderQuestions();
};

qList.onclick = e => {
  const act = e.target.dataset.act;
  if (act === 'del') { editing.questions.splice(e.target.closest('.q').dataset.i, 1); renderQuestions(); }
  if (act === 'noimg') { questionOf(e.target).image = ''; renderQuestions(); }
};

addQ.onclick = () => { editing.questions.push(emptyQuestion()); renderQuestions(); };

// PDF rejimi
pdfFile.onchange = async () => {
  if (!pdfFile.files[0]) return;
  pdfName.textContent = 'Yuklanmoqda...';
  editing.pdf = await upload(pdfFile.files[0]);
  pdfName.textContent = 'PDF yuklandi ✓';
};

const keyLetters = () => pdfKey.value.toUpperCase().replace(/[^ABCD]/g, '').split('');
function updateKeyCount() { keyCount.textContent = `Savollar soni: ${keyLetters().length}`; }
pdfKey.oninput = updateKeyCount;

saveTest.onclick = async () => {
  const type = document.querySelector('[name=tType]:checked').value;
  const questions = type === 'pdf' ? keyLetters().map(answer => ({ answer })) : editing.questions;
  await api('/api/tests/save', { ...editing, title: tTitle.value, cls: tCls.value, type, questions, pick: tPick.value });
  editor.hidden = true;
  alert('Saqlandi. Oʻquvchilar koʻrishi uchun testni "Ochish" tugmasi bilan oching.');
  loadTests();
};

// ---------- Natijalar ----------
async function loadResults() {
  tests = await api('/api/tests');
  const want = rTest.dataset.want || rTest.value || (tests[0] && tests[0].id);
  delete rTest.dataset.want;
  rTest.innerHTML = tests.map(t => `<option value="${t.id}" ${t.id === want ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
  showResults();
}

async function showResults() {
  if (!rTest.value) { rSummary.textContent = 'Hali test yoʻq.'; rTable.innerHTML = ''; return; }
  const rows = await api('/api/results?test=' + rTest.value);
  rCsv.href = '/api/results.csv?test=' + rTest.value;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : 0;
  rSummary.innerHTML = `Topshirganlar: <b>${rows.length}</b> ta &nbsp; | &nbsp; Oʻrtacha natija: <b>${avg}%</b>`;
  rTable.innerHTML = `<tr><th>№</th><th>Familiya Ism</th><th>Sinf</th><th>ID</th><th>Toʻgʻri</th><th>Foiz</th><th>Sana</th><th class="no-print"></th></tr>` +
    rows.map((r, i) => `<tr>
      <td>${i + 1}</td><td>${esc(r.last_name)} ${esc(r.first_name)}</td><td>${esc(r.cls)}</td><td>${r.student_id}</td>
      <td>${r.correct} / ${r.total}</td><td><b>${r.percent}%</b></td><td>${r.date}</td>
      <td class="no-print"><button class="link danger" data-del="${r.id}">Qayta topshirishga ruxsat</button></td>
    </tr>`).join('');
}
rTest.onchange = showResults;

rTable.onclick = async e => {
  const id = e.target.dataset.del;
  if (id && confirm('Natija oʻchiriladi va oʻquvchi testni qayta topshira oladi. Davom etilsinmi?')) {
    await api('/api/results/delete', { id });
    showResults();
  }
};

// ---------- Jonli reyting ----------
async function loadRating() {
  const { tests, rows } = await api('/api/rating');

  const classes = [...new Set(rows.map(r => r.cls))].sort();
  const current = gCls.value;
  gCls.innerHTML = '<option value="">Butun maktab</option>' +
    classes.map(c => `<option ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');

  if (!tests.length) { gTable.innerHTML = '<tr><td class="muted">Hozir ochiq test yoʻq.</td></tr>'; return; }

  const list = rows.filter(r => !gCls.value || r.cls === gCls.value);
  const max = tests.reduce((s, t) => s + t.total, 0);
  const medal = i => ['🥇', '🥈', '🥉'][i] || i + 1;

  gTable.innerHTML =
    `<tr><th>Oʻrin</th><th>Familiya Ism</th><th>Sinf</th>
      ${tests.map(t => `<th>${esc(t.title)}<br><span class="muted">/${t.total}</span></th>`).join('')}
      <th>Jami<br><span class="muted">/${max}</span></th><th>Foiz</th></tr>` +
    list.map((r, i) => `<tr>
      <td><b>${medal(i)}</b></td><td>${esc(r.name)}</td><td>${esc(r.cls)}</td>
      ${tests.map(t => `<td>${r.scores[t.id] ?? '<span class="muted">—</span>'}</td>`).join('')}
      <td><b>${r.sum}</b></td><td>${Math.round((r.sum / max) * 100)}%</td>
    </tr>`).join('');
}
gCls.onchange = loadRating;
fullBtn.onclick = () => ratingBox.requestFullscreen();

// ---------- Boshlash ----------
api('/api/me').then(u => {
  if (u.role !== 'admin') location.href = '/student.html';
  else showTab('students');
});

// O'quvchi sahifasi: testlar ro'yxati -> test yechish -> natija

// Fanlar navbat bilan: faqat birinchi topshirilmagan fanni boshlash mumkin
async function showList() {
  const tests = await api('/api/my-tests');
  const next = tests.find(t => !t.result);
  view.innerHTML = `<div class="card"><h2>Fanlar</h2><br>${tests.length ? `
    <table>
      <tr><th>№</th><th>Fan</th><th>Savollar</th><th></th></tr>
      ${tests.map((t, i) => `<tr>
        <td>${i + 1}</td><td>${esc(t.title)}</td><td>${t.count}</td>
        <td>${t.result
          ? `<span class="ok">✓ ${t.result.correct}/${t.result.total} (${t.result.percent}%)</span>`
          : t === next
            ? `<button data-start="${t.id}">Boshlash</button>`
            : '<span class="muted">Navbatda</span>'}</td>
      </tr>`).join('')}
    </table>` : '<p class="muted">Hozircha ochiq test yoʻq.</p>'}</div>`;
}

view.onclick = e => {
  if (e.target.dataset.start) startTest(e.target.dataset.start);
  if (e.target.id === 'back') showList();
};

// Natijadan keyin: keyingi fan tugmasi yoki "hammasi tugadi"
async function nextButton() {
  const next = (await api('/api/my-tests')).find(t => !t.result);
  return next
    ? `<button data-start="${next.id}">Keyingi fan: ${esc(next.title)} →</button>`
    : `<p class="ok">Barcha fanlar tugadi! 🎉</p><button id="back">Natijalarim</button>`;
}

async function startTest(id) {
  const t = await api('/api/test?id=' + id);

  // Har bir savol: matn va/yoki rasm + A B C D variantlar
  const sheet = t.questions.map((q, i) => `
    <div class="q">
      <b>${i + 1}.</b> ${esc(q.text).replace(/\n/g, '<br>')}
      ${q.image ? `<img class="qimg" src="${esc(q.image)}">` : ''}
      <div class="opts">${LETTERS.map((L, k) => `
        <label class="opt"><input type="radio" name="a${i}" value="${L}"> ${L}) ${esc(q.options[k] || '')}</label>`).join('')}
      </div>
    </div>`).join('');

  const isPdf = t.type === 'pdf';
  view.innerHTML = `
    <div class="card"><h2>${esc(t.title)}</h2></div>
    <form id="testForm">
      ${isPdf
        ? `<div class="split">
             <iframe src="${esc(t.pdf)}"></iframe>
             <div class="card sheet compact"><b>Javoblar varaqasi</b><br><br>${sheet}</div>
           </div>`
        : `<div class="card">${sheet}</div>`}
      <div class="card"><button>Testni yakunlash</button></div>
    </form>`;

  testForm.onsubmit = async e => {
    e.preventDefault();
    const answers = t.questions.map((_, i) => testForm.elements['a' + i].value);
    const empty = answers.filter(a => !a).length;
    const msg = empty ? `${empty} ta savolga javob berilmagan. Baribir yakunlaysizmi?` : 'Testni yakunlaysizmi?';
    if (!confirm(msg)) return;
    const r = await api('/api/submit', { id: t.id, answers });
    view.innerHTML = `<div class="card" style="text-align:center">
      <h2>${esc(t.title)}</h2>
      <div class="big">${r.percent}%</div>
      <p>Toʻgʻri javoblar: <b>${r.correct}</b> / ${r.total}</p>
      ${await nextButton()}
    </div>`;
    scrollTo(0, 0);
  };
}

api('/api/me').then(u => {
  if (u.role !== 'student') { location.href = '/admin.html'; return; }
  who.textContent = `${u.last_name} ${u.first_name} — ${u.cls} (ID: ${u.id})`;
  showList();
});

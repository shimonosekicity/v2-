'use strict';

// ===== State =====
const state = {
  lang: 'ja',
  i18n: {},
  subsidies: [],
  currentSubsidy: null,
  answers: {},          // reqId -> { value, disqualified }
  disqualifiedReq: null,
  filterCat: 'all',
  searchQuery: '',
};

// ===== Utility =====
function t(key) {
  return state.i18n[state.lang]?.[key] ?? state.i18n['ja']?.[key] ?? key;
}

function text(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[state.lang] || obj['ja'] || '';
}

function el(id) { return document.getElementById(id); }

function showScreen(name, pushHistory = true) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el('screen-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  sessionStorage.setItem('currentScreen', name);
  if (state.currentSubsidy) {
    sessionStorage.setItem('currentSubsidyId', state.currentSubsidy.id);
  } else {
    sessionStorage.removeItem('currentSubsidyId');
  }
  if (pushHistory) {
    history.pushState({ screen: name, subsidyId: state.currentSubsidy?.id ?? null }, '');
  }
}

// ===== Data loading =====
async function loadData() {
  const [subsidyRes, i18nRes] = await Promise.all([
    fetch('./data/subsidies.json'),
    fetch('./data/i18n.json'),
  ]);
  state.subsidies = (await subsidyRes.json()).subsidies;
  state.i18n = await i18nRes.json();
}

// ===== Language =====
function setLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  renderAll();
}

// ===== Screen 1: List =====
function renderList() {
  // Disclaimer
  el('disclaimer-text').textContent = t('disclaimer');

  // Search placeholder
  el('search-input').placeholder = t('search');

  // Category tabs
  const tabs = el('category-tabs');
  tabs.innerHTML = '';
  const cats = [
    { key: 'all', labelKey: 'tabAll' },
    { key: '移住・定住', labelKey: 'tabIjuu' },
    { key: '住宅', labelKey: 'tabJutaku' },
    { key: '子育て・妊娠', labelKey: 'tabKodomo' },
  ];
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab' + (state.filterCat === cat.key ? ' active' : '');
    btn.dataset.cat = cat.key;
    btn.textContent = t(cat.labelKey);
    btn.setAttribute('aria-label', t(cat.labelKey));
    btn.addEventListener('click', () => {
      state.filterCat = cat.key;
      renderList();
    });
    tabs.appendChild(btn);
  });

  // Filter subsidies
  const query = state.searchQuery.toLowerCase();
  const filtered = state.subsidies.filter(s => {
    const matchCat = state.filterCat === 'all' || s.category === state.filterCat;
    const nameJa = text(s.name).toLowerCase();
    const summaryJa = text(s.summary).toLowerCase();
    const matchQ = !query || nameJa.includes(query) || summaryJa.includes(query);
    return matchCat && matchQ;
  });

  const list = el('subsidy-list');
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = `<div class="no-results">${t('noResults')}</div>`;
    return;
  }

  filtered.forEach(sub => {
    const card = document.createElement('div');
    card.className = 'subsidy-card';
    card.dataset.cat = sub.category;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', text(sub.name));

    const isClosed = sub.status === 'closed';
    const badgeClass = isClosed ? 'badge-closed' : 'badge-active';
    const badgeText = isClosed ? t('statusClosed') : t('statusActive');

    const tel = sub.contact.tel;
    const contactStr = sub.contact.dept || sub.contact.name || '';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-name">${text(sub.name)}</div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="card-summary">${text(sub.summary)}</div>
      <div class="card-meta">
        <div class="card-meta-item">
          <span>💴</span>
          <strong>${text(sub.amount)}</strong>
        </div>
        <div class="card-meta-item">
          <span>🏢</span>
          <span>${contactStr}</span>
        </div>
      </div>
      <span class="card-arrow">›</span>
    `;

    const goCheck = () => openSubsidy(sub);
    card.addEventListener('click', goCheck);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') goCheck(); });

    list.appendChild(card);
  });
}

// ===== Screen 2: Check =====
function openSubsidy(sub) {
  state.currentSubsidy = sub;
  state.answers = {};
  state.disqualifiedReq = null;
  renderCheck();
  showScreen('check');
}

function renderCheck() {
  const sub = state.currentSubsidy;
  if (!sub) return;

  // Static labels
  el('back-from-check').textContent = t('back');

  // Info card
  const infoCard = el('info-card');
  infoCard.dataset.cat = sub.category;
  infoCard.innerHTML = `
    <div class="info-name">${text(sub.name)}</div>
    <div class="info-amount">💴 <strong>${text(sub.amount)}</strong></div>
    <div class="info-contact">
      ${sub.contact.tel ? `<a href="tel:${sub.contact.tel.replace(/-/g, '')}">📞 ${sub.contact.tel}</a>` : ''}
      <span class="info-dept">🏢 ${sub.contact.dept || sub.contact.name}</span>
    </div>
  `;

  // Requirements
  renderRequirements();
}

function renderRequirements() {
  const sub = state.currentSubsidy;
  const reqs = sub.requirements;
  const container = el('requirements-container');
  container.innerHTML = '';

  // Progress
  const answered = Object.keys(state.answers).length;
  const total = reqs.length;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  el('progress-fill').style.width = pct + '%';
  el('progress-label').textContent = `${t('checklistProgress')}: ${answered} / ${total}`;

  // Result banner (created but appended after the triggering card)
  const resultBanner = document.createElement('div');
  resultBanner.id = 'result-banner';
  resultBanner.className = 'result-banner hidden';

  const allAnswered = answered === total;
  const hasDisqualify = state.disqualifiedReq !== null;

  if (hasDisqualify) {
    const dq = state.disqualifiedReq;
    resultBanner.className = 'result-banner ng';
    resultBanner.innerHTML = `
      <div class="result-icon">✗</div>
      <div class="result-title">${t('result_ng')}</div>
      <div class="result-sub">${t('result_ng_sub')}</div>
      <div class="result-reason">${t('result_ng_group')}「${dq.group}」</div>
    `;
  } else if (allAnswered) {
    resultBanner.className = 'result-banner ok';
    resultBanner.innerHTML = `
      <div class="result-icon">✓</div>
      <div class="result-title">${t('result_ok')}</div>
      <div class="result-sub">${t('result_ok_sub')}</div>
    `;
  }

  // Group requirements by group label
  let currentGroup = null;

  reqs.forEach((req, idx) => {
    const isAnswered = !!state.answers[req.id];
    const isCurrent = !isAnswered && (idx === 0 || !!state.answers[reqs[idx - 1]?.id]);
    const isDisq = state.disqualifiedReq?.id === req.id;

    // Group label
    if (req.group !== currentGroup) {
      currentGroup = req.group;
      const groupEl = document.createElement('div');
      groupEl.className = 'req-group-label';
      groupEl.textContent = req.group;
      container.appendChild(groupEl);
    }

    // Question card
    const card = document.createElement('div');
    card.className = 'question-card' +
      (isAnswered ? ' answered' : '') +
      (isCurrent && !isAnswered ? ' current' : '') +
      (isDisq ? ' disqualified' : '');
    card.id = 'req-card-' + req.id;

    const questionText = text(req.question);
    const isJpOnly = state.lang !== 'ja' && questionText.includes('※');

    card.innerHTML = `
      <div class="question-num">${t('questionCount')} ${idx + 1} ${t('of')} ${reqs.length}</div>
      <div class="question-text">${questionText}</div>
    `;

    // Answer controls
    const answered_val = state.answers[req.id];

    if (req.type === 'yesno') {
      const btns = document.createElement('div');
      btns.className = 'answer-btns';

      const yesBtn = document.createElement('button');
      yesBtn.className = 'answer-btn' + (answered_val?.value === 'yes' ? ' selected-yes' : '');
      yesBtn.textContent = t('yes');
      yesBtn.setAttribute('aria-label', t('yes'));

      const noBtn = document.createElement('button');
      noBtn.className = 'answer-btn' + (answered_val?.value === 'no' ? ' selected-no' : '');
      noBtn.textContent = t('no');
      noBtn.setAttribute('aria-label', t('no'));

      const handleYesNo = (value) => {
        if (value === 'no' && req.required) {
          state.answers[req.id] = { value: 'no', disqualified: true };
          state.disqualifiedReq = req;
        } else {
          state.answers[req.id] = { value, disqualified: false };
          if (state.disqualifiedReq?.id === req.id) state.disqualifiedReq = null;
        }
        renderRequirements();
        scrollToNext(req.id, reqs, idx);
      };

      yesBtn.addEventListener('click', () => handleYesNo('yes'));
      noBtn.addEventListener('click', () => handleYesNo('no'));

      btns.appendChild(yesBtn);
      btns.appendChild(noBtn);
      card.appendChild(btns);

    } else if (req.type === 'choice') {
      const btns = document.createElement('div');
      btns.className = 'choice-btns';

      req.choices.forEach(choice => {
        const btn = document.createElement('button');
        const isSelected = answered_val?.value === choice.value;
        const isDisqChoice = choice.disqualify;
        btn.className = 'choice-btn' +
          (isSelected && !isDisqChoice ? ' selected-ok' : '') +
          (isSelected && isDisqChoice ? ' selected-ng' : '');
        btn.textContent = text(choice.label);

        btn.addEventListener('click', () => {
          if (isDisqChoice && req.required) {
            state.answers[req.id] = { value: choice.value, disqualified: true };
            state.disqualifiedReq = req;
          } else {
            state.answers[req.id] = { value: choice.value, disqualified: false };
            if (state.disqualifiedReq?.id === req.id) state.disqualifiedReq = null;
          }
          renderRequirements();
          scrollToNext(req.id, reqs, idx);
        });

        btns.appendChild(btn);
      });

      card.appendChild(btns);
    }

    container.appendChild(card);

    // バナーを対象外になった質問カードの直後に挿入
    if (hasDisqualify && isDisq) {
      container.appendChild(resultBanner);
    }
  });

  // 全問クリアの場合はリストの末尾に追加
  if (allAnswered && !hasDisqualify) {
    container.appendChild(resultBanner);
  }

  // Action buttons
  const actionDiv = el('check-actions');
  actionDiv.innerHTML = '';

  const restartBtn = document.createElement('button');
  restartBtn.className = 'btn-secondary';
  restartBtn.textContent = t('restart');
  restartBtn.addEventListener('click', () => {
    state.answers = {};
    state.disqualifiedReq = null;
    renderRequirements();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const detailBtn = document.createElement('button');
  detailBtn.className = 'btn-primary';
  detailBtn.textContent = t('detailsTitle');
  detailBtn.addEventListener('click', () => {
    renderDetails();
    showScreen('details');
  });

  actionDiv.appendChild(detailBtn);
  actionDiv.appendChild(restartBtn);
}

function scrollToNext(currentId, reqs, currentIdx) {
  const nextIdx = currentIdx + 1;
  if (nextIdx < reqs.length) {
    setTimeout(() => {
      const nextCard = document.getElementById('req-card-' + reqs[nextIdx].id);
      if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  } else {
    setTimeout(() => {
      const banner = document.getElementById('result-banner');
      if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }
}

// ===== Screen 3: Details =====
function renderDetails() {
  const sub = state.currentSubsidy;
  if (!sub) return;

  el('back-from-details').textContent = t('back');
  el('back-from-details-to-list').textContent = t('back');
  el('print-btn').textContent = t('printBtn');
  el('details-title').textContent = text(sub.name) + ' — ' + t('detailsTitle');

  // Links
  const linksDiv = el('details-links');
  linksDiv.innerHTML = '';

  if (sub.sourceUrl) {
    const a = document.createElement('a');
    a.className = 'detail-link';
    a.href = sub.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `🌐 ${t('sourceUrl')}`;
    linksDiv.appendChild(a);
  }

  if (sub.kiyouUrl) {
    const a = document.createElement('a');
    a.className = 'detail-link';
    a.href = sub.kiyouUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `📄 ${t('kiyouUrl')}`;
    linksDiv.appendChild(a);
  }

  if (sub.contact.tel) {
    const a = document.createElement('a');
    a.className = 'detail-link';
    a.href = `tel:${sub.contact.tel.replace(/-/g, '')}`;
    a.innerHTML = `📞 ${sub.contact.name || sub.contact.dept} ${sub.contact.tel}`;
    linksDiv.appendChild(a);
  }

  // Note
  const noteDiv = el('details-note');
  const noteText = text(sub.note);
  if (noteText) {
    noteDiv.classList.remove('hidden');
    noteDiv.querySelector('.note-text').textContent = noteText;
  } else {
    noteDiv.classList.add('hidden');
  }

  // Requirements list
  const reqList = el('details-req-list');
  reqList.innerHTML = '';
  sub.requirements.forEach((req, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="req-group-tag">${req.group}</div>
      <div>${req.question['ja'] || text(req.question)}</div>
      ${req.type === 'choice' ? `<ul style="margin-top:6px;padding-left:16px;font-size:13px;color:var(--color-text-sub);">${req.choices.map(c => `<li>${c.label['ja'] || text(c.label)}${c.disqualify ? ' <span style="color:var(--color-ng);">（対象外）</span>' : ''}</li>`).join('')}</ul>` : ''}
    `;
    reqList.appendChild(li);
  });
}

// ===== Global UI labels refresh =====
function renderAll() {
  // Update static labels
  el('app-title').textContent = t('appTitle');
  el('app-subtitle').textContent = t('appSubtitle');

  const screen = document.querySelector('.screen.active')?.id;
  if (screen === 'screen-list') {
    renderList();
  } else if (screen === 'screen-check') {
    renderCheck();
  } else if (screen === 'screen-details') {
    renderDetails();
  }
}

// ===== Init =====
async function init() {
  await loadData();

  // Language buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  // Back buttons
  el('back-from-check').addEventListener('click', () => {
    showScreen('list');
    renderList();
  });

  el('back-from-details').addEventListener('click', () => {
    showScreen('check');
  });

  el('back-from-details-to-list').addEventListener('click', () => {
    showScreen('list');
    renderList();
  });

  // Search
  el('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderList();
  });

  // Print button
  el('print-btn').addEventListener('click', () => window.print());

  // ブラウザ戻るボタンでアプリ画面を戻る
  window.addEventListener('popstate', (e) => {
    const s = e.state?.screen ?? 'list';
    const sid = e.state?.subsidyId;
    if (sid && s !== 'list') {
      const sub = state.subsidies.find(x => x.id === sid);
      if (sub) state.currentSubsidy = sub;
    }
    showScreen(s, false);
    if (s === 'list') renderList();
    else if (s === 'check') renderCheck();
    else if (s === 'details') renderDetails();
  });

  // Restore screen from sessionStorage
  const savedScreen = sessionStorage.getItem('currentScreen');
  const savedSubsidyId = sessionStorage.getItem('currentSubsidyId');
  if (savedScreen && savedScreen !== 'list' && savedSubsidyId) {
    const sub = state.subsidies.find(s => s.id === savedSubsidyId);
    if (sub) {
      state.currentSubsidy = sub;
      renderAll();
      showScreen(savedScreen);
      if (savedScreen === 'check') renderCheck();
      else if (savedScreen === 'details') renderDetails();
      return;
    }
  }
  renderAll();
  // 初期状態を history に記録（replaceState で余分な履歴を作らない）
  history.replaceState({ screen: 'list', subsidyId: null }, '');
  showScreen('list', false);
}

document.addEventListener('DOMContentLoaded', init);

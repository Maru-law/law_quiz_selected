// GASのウェブアプリURLをここに設定
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzC9opC7PHAxXn0f5CqAKf_tKw4yRoB2HMCo5_IlRgPm8m0PATAjEhMbe4dTFv7clPRYQ/exec';

let allQuestions = [];
let groupedSections = {};
let currentSectionData = [];
let currentQuestionIndex = 1;
let currentQuestion = null;
let isShowingTrue = true;
let totalSectionQuestions = 0;
let saveTimer = null;

const PENDING_MARKS_KEY = 'lawQuizPendingCheckedQuestionIds';
const SAVED_MARKS_KEY = 'lawQuizSavedCheckedQuestionIds';
const SYNC_DEBOUNCE_MS = 1500;

const views = {
  loading: document.getElementById('loading-view'),
  list: document.getElementById('list-view'),
  quiz: document.getElementById('quiz-view')
};

const markCheckbox = document.getElementById('mark-checkbox');
const syncStatus = document.getElementById('sync-status');

document.addEventListener('DOMContentLoaded', initApp);

document.getElementById('btn-true').onclick = () => handleAnswer(true);
document.getElementById('btn-false').onclick = () => handleAnswer(false);
document.getElementById('btn-next-question').onclick = () => {
  flushPendingMarks();
  currentQuestionIndex++;
  loadNextQuestion();
};
document.getElementById('btn-back-list').onclick = () => {
  flushPendingMarks();
  renderList();
  switchView('list');
};

markCheckbox.addEventListener('change', () => {
  if (!currentQuestion || !markCheckbox.checked) return;
  currentQuestion.checked = true;
  queueCheckedQuestion(currentQuestion.id);
});

window.addEventListener('pagehide', flushPendingMarksWithBeacon);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPendingMarksWithBeacon();
});

async function initApp() {
  try {
    const response = await fetch(GAS_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const text = await response.text();
    let fetchedData;

    try {
      fetchedData = JSON.parse(text);
    } catch (e) {
      console.error('受信したテキスト:', text);
      throw new Error('GASからの応答がJSON形式ではありません。HTMLやエラー画面が返却されています。');
    }

    if (typeof fetchedData === 'string') {
      try {
        fetchedData = JSON.parse(fetchedData);
      } catch (e) {
        throw new Error('データが純粋な文字列として返却されており、配列に変換できません。');
      }
    }

    if (fetchedData && typeof fetchedData === 'object' && !Array.isArray(fetchedData)) {
      if (Array.isArray(fetchedData.data)) {
        fetchedData = fetchedData.data;
      } else if (Array.isArray(fetchedData.items)) {
        fetchedData = fetchedData.items;
      } else {
        console.error('実際のデータ構造:', fetchedData);
        throw new Error('JSONデータは取得できましたが、配列ではありません。開発者ツール(F12)のConsoleを確認してください。');
      }
    }

    if (!Array.isArray(fetchedData)) {
      throw new Error('データを配列として認識できませんでした。');
    }

    const savedIds = getStoredIdSet(SAVED_MARKS_KEY);
    const pendingIds = getStoredIdSet(PENDING_MARKS_KEY);

    allQuestions = fetchedData.map(q => ({
      ...q,
      checked: q.checked === true || q.checked === 'TRUE' || savedIds.has(String(q.id)) || pendingIds.has(String(q.id))
    }));

    processData(allQuestions);
    renderList();
    switchView('list');

    // 前回終了時などに未送信のチェックが残っていれば、起動後にまとめて送信
    if (pendingIds.size > 0) scheduleFlushPendingMarks();
  } catch (error) {
    console.error('Data fetch error:', error);
    const loadingView = document.getElementById('loading-view');
    loadingView.innerHTML = `
      <h4>データの読み込みエラー</h4>
      <p>${error.message}</p>
      <p>※URLの設定ミスか、GASのデプロイ設定が更新されていない可能性があります。</p>
    `;
  }
}

function switchView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

function processData(data) {
  groupedSections = {};
  data.forEach(q => {
    if (!q.section) return;

    const parts = q.section.split('_');
    const category = parts[0];
    const year = parts[1] || 'その他';

    if (!groupedSections[category]) groupedSections[category] = {};
    if (!groupedSections[category][year]) groupedSections[category][year] = [];
    groupedSections[category][year].push(q);
  });
}

function renderList() {
  const container = document.getElementById('category-container');
  container.innerHTML = '';

  for (const [category, yearsObj] of Object.entries(groupedSections)) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'category-group';

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = category;
    groupDiv.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'year-grid';

    for (const [year, questions] of Object.entries(yearsObj)) {
      const btn = document.createElement('button');
      btn.className = 'year-btn';
      btn.textContent = year;
      btn.onclick = () => startQuiz(category, year, questions);
      grid.appendChild(btn);
    }

    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  }
}

function startQuiz(category, year, questions) {
  const remainingQuestions = [...questions];
  currentSectionData = remainingQuestions.sort(() => Math.random() - 0.5);
  totalSectionQuestions = questions.length;
  currentQuestionIndex = 1;

  document.getElementById('section-name-text').textContent = `${category}_${year}`;
  switchView('quiz');
  loadNextQuestion();
}

function parseMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function loadNextQuestion() {
  if (currentSectionData.length === 0) {
    alert('このセクションの問題を全て解き終えました！');
    flushPendingMarks();
    renderList();
    switchView('list');
    return;
  }

  currentQuestion = currentSectionData.pop();
  isShowingTrue = Math.random() >= 0.5;

  document.getElementById('q-num').textContent = currentQuestionIndex;
  document.getElementById('progress-text').textContent = `全${totalSectionQuestions}問中 ${currentQuestionIndex}問目`;

  const qText = isShowingTrue ? currentQuestion.question_true : currentQuestion.question_false;
  document.getElementById('question-text').innerHTML = parseMarkdown(qText);

  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('action-buttons').classList.add('hidden');
  syncStatus.textContent = '';
  markCheckbox.checked = !!currentQuestion.checked;

  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  [btnO, btnX].forEach(btn => {
    btn.classList.remove('disabled', 'dimmed');
  });

  document.getElementById('quiz-scroll-area').scrollTop = 0;
}

function handleAnswer(userSelectedTrue) {
  const isCorrect = (isShowingTrue === userSelectedTrue);
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');

  btnO.classList.add('disabled');
  btnX.classList.add('disabled');

  if (userSelectedTrue) {
    btnX.classList.add('dimmed');
  } else {
    btnO.classList.add('dimmed');
  }

  const resultCard = document.getElementById('result-card');
  const resultTitle = document.getElementById('result-title');
  const expText = document.getElementById('explanation-text');

  resultCard.classList.remove('hidden', 'correct', 'incorrect');

  if (isCorrect) {
    resultCard.classList.add('correct');
    resultTitle.textContent = '正解';
  } else {
    resultCard.classList.add('incorrect');
    resultTitle.textContent = '間違い';
  }

  expText.innerHTML = parseMarkdown(currentQuestion.explanation);
  markCheckbox.checked = !!currentQuestion.checked;
  syncStatus.textContent = currentQuestion.checked ? 'チェック済み' : '';

  const actionButtons = document.getElementById('action-buttons');
  const btnNext = document.getElementById('btn-next-question');
  actionButtons.classList.remove('hidden');

  if (currentSectionData.length === 0) {
    btnNext.style.display = 'none';
  } else {
    btnNext.style.display = 'block';
  }

  setTimeout(() => {
    const scrollArea = document.getElementById('quiz-scroll-area');
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
  }, 100);
}

function queueCheckedQuestion(questionId) {
  const id = String(questionId);
  const pendingIds = getStoredIdSet(PENDING_MARKS_KEY);
  const savedIds = getStoredIdSet(SAVED_MARKS_KEY);

  savedIds.add(id);
  pendingIds.add(id);

  setStoredIdSet(SAVED_MARKS_KEY, savedIds);
  setStoredIdSet(PENDING_MARKS_KEY, pendingIds);

  syncStatus.textContent = 'チェックを保存待ちです';
  scheduleFlushPendingMarks();
}

function scheduleFlushPendingMarks() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPendingMarks, SYNC_DEBOUNCE_MS);
}

function flushPendingMarks() {
  const pendingIds = getStoredIdSet(PENDING_MARKS_KEY);
  if (pendingIds.size === 0) return;

  clearTimeout(saveTimer);
  const ids = Array.from(pendingIds).map(Number).filter(Number.isFinite);
  if (ids.length === 0) {
    localStorage.removeItem(PENDING_MARKS_KEY);
    return;
  }

  sendMarks(ids)
    .then(() => {
      removePendingIds(ids);
      if (syncStatus) syncStatus.textContent = 'チェックを保存しました';
    })
    .catch(error => {
      console.warn('チェック保存に失敗しました。次回まとめて再送します。', error);
      if (syncStatus) syncStatus.textContent = '通信できませんでした。後で自動再送します';
    });
}

async function sendMarks(ids) {
  await fetch(GAS_API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({ action: 'markChecked', ids })
  });
}

function flushPendingMarksWithBeacon() {
  const pendingIds = getStoredIdSet(PENDING_MARKS_KEY);
  if (pendingIds.size === 0) return;

  const ids = Array.from(pendingIds).map(Number).filter(Number.isFinite);
  if (ids.length === 0) return;

  const body = JSON.stringify({ action: 'markChecked', ids });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const queued = navigator.sendBeacon(GAS_API_URL, blob);
    if (queued) removePendingIds(ids);
  } else {
    fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      keepalive: true
    }).then(() => removePendingIds(ids)).catch(() => {});
  }
}

function getStoredIdSet(key) {
  try {
    const raw = localStorage.getItem(key);
    const array = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(array) ? array.map(String) : []);
  } catch (e) {
    return new Set();
  }
}

function setStoredIdSet(key, idSet) {
  localStorage.setItem(key, JSON.stringify(Array.from(idSet)));
}

function removePendingIds(ids) {
  const pendingIds = getStoredIdSet(PENDING_MARKS_KEY);
  ids.map(String).forEach(id => pendingIds.delete(id));

  if (pendingIds.size === 0) {
    localStorage.removeItem(PENDING_MARKS_KEY);
  } else {
    setStoredIdSet(PENDING_MARKS_KEY, pendingIds);
  }
}

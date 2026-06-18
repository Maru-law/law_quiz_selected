// GASのウェブアプリURLをここに設定
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzC9opC7PHAxXn0f5CqAKf_tKw4yRoB2HMCo5_IlRgPm8m0PATAjEhMbe4dTFv7clPRYQ/exec';

let allQuestions = [];
let groupedSections = {};
let currentSectionData = [];
let currentQuestionIndex = 1;
let currentQuestion = null;
let isShowingTrue = true;
let totalSectionQuestions = 0;

// ▼変更箇所1: GASへの送信待ちデータを溜め込む変数
let pendingUpdates = {}; 

const views = {
  loading: document.getElementById('loading-view'),
  list: document.getElementById('list-view'),
  quiz: document.getElementById('quiz-view')
};

document.addEventListener('DOMContentLoaded', initApp);

// ページを隠した時や閉じる時にも、未送信のデータがあれば送信を試みる
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    syncUpdates();
  }
});

async function initApp() {
  try {
    const response = await fetch(GAS_API_URL);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const text = await response.text();
    let fetchedData;

    try { fetchedData = JSON.parse(text); } 
    catch (e) { throw new Error("GASからの応答がJSON形式ではありません。"); }

    if (typeof fetchedData === 'string') fetchedData = JSON.parse(fetchedData);
    if (fetchedData && typeof fetchedData === 'object' && !Array.isArray(fetchedData)) {
      if (Array.isArray(fetchedData.data)) fetchedData = fetchedData.data;
      else if (Array.isArray(fetchedData.items)) fetchedData = fetchedData.items;
    }

    if (!Array.isArray(fetchedData)) throw new Error("データを配列として認識できませんでした。");

    allQuestions = fetchedData;
    processData(allQuestions);
    renderList();
    switchView('list');

  } catch (error) {
    const loadingView = document.getElementById('loading-view');
    loadingView.innerHTML = `
      <div style="padding: 20px; color: #F44336; line-height: 1.5; word-break: break-all;">
        <h3 style="margin-bottom: 12px;">データの読み込みエラー</h3>
        <p><strong>${error.message}</strong></p>
      </div>
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
  let remainingQuestions = [...questions];
  currentSectionData = remainingQuestions.sort(() => Math.random() - 0.5);
  totalSectionQuestions = questions.length;
  currentQuestionIndex = 1;

  document.getElementById('section-name-text').textContent = `${category}_${year}`;
  switchView('quiz');
  loadNextQuestion();
}

function parseMarkdown(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function loadNextQuestion() {
  if (currentSectionData.length === 0) {
    syncUpdates(); // ▼変更箇所2: セクションを解き終えたタイミングで一括送信
    alert('このセクションの問題を全て解き終えました！');
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
  
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  [btnO, btnX].forEach(btn => btn.classList.remove('disabled', 'dimmed'));

  document.getElementById('quiz-scroll-area').scrollTop = 0;
}

document.getElementById('btn-true').onclick = () => handleAnswer(true);
document.getElementById('btn-false').onclick = () => handleAnswer(false);

function handleAnswer(userSelectedTrue) {
  const isCorrect = (isShowingTrue === userSelectedTrue);
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  
  btnO.classList.add('disabled');
  btnX.classList.add('disabled');
  
  if (userSelectedTrue) btnX.classList.add('dimmed');
  else btnO.classList.add('dimmed');

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

  // ▼変更箇所3: チェックボックスの初期表示をセット
  const reviewCheck = document.getElementById('review-checkbox');
  reviewCheck.checked = currentQuestion.isChecked || false;

  const actionButtons = document.getElementById('action-buttons');
  const btnNext = document.getElementById('btn-next-question');
  actionButtons.classList.remove('hidden');
  
  if (currentSectionData.length === 0) btnNext.style.display = 'none';
  else btnNext.style.display = 'block';

  setTimeout(() => {
    const scrollArea = document.getElementById('quiz-scroll-area');
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
  }, 100);
}

// ▼変更箇所4: チェックボックスが操作されたらキューに記録する
document.getElementById('review-checkbox').onchange = (e) => {
  const checked = e.target.checked;
  currentQuestion.isChecked = checked; // 現在のデータの状態も更新
  pendingUpdates[currentQuestion.id] = checked; // 送信待ちキューに追加
};

// ▼変更箇所5: まとめてGASへ送信する非同期関数
function syncUpdates() {
  if (Object.keys(pendingUpdates).length === 0) return;

  const updates = Object.keys(pendingUpdates).map(id => ({
    id: parseInt(id, 10),
    isChecked: pendingUpdates[id]
  }));

  pendingUpdates = {}; // 通信前にキューをリセットして二重送信を防止

  // Github PagesからGASへPOSTする際のCORS対策として text/plain を使用します
  fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(updates)
  }).catch(err => console.error('同期エラー:', err)); // UIはブロックせずエラーはコンソールに出すだけ
}

document.getElementById('btn-next-question').onclick = () => {
  currentQuestionIndex++;
  loadNextQuestion();
};

document.getElementById('btn-back-list').onclick = () => {
  syncUpdates(); // ▼変更箇所6: 一覧に戻るタイミングで一括送信
  renderList();
  switchView('list');
};
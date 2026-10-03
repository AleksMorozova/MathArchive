const elements = {
  status: document.querySelector('#status'),
  model: document.querySelector('#model'),
  installCommand: document.querySelector('#install-command'),
  file: document.querySelector('#file'),
  fileName: document.querySelector('#file-name'),
  preview: document.querySelector('#preview'),
  analyze: document.querySelector('#analyze'),
  cancel: document.querySelector('#cancel'),
  progress: document.querySelector('#progress'),
  error: document.querySelector('#error'),
  result: document.querySelector('#result'),
  title: document.querySelector('#result-title'),
  sourceLanguage: document.querySelector('#source-language'),
  grade: document.querySelector('#grade'),
  topic: document.querySelector('#topic'),
  resultModel: document.querySelector('#result-model'),
  duration: document.querySelector('#duration'),
  sections: document.querySelector('#sections'),
  warningsPanel: document.querySelector('#warnings-panel'),
  warnings: document.querySelector('#warnings'),
  json: document.querySelector('#json'),
  rawDetails: document.querySelector('#raw-details'),
  raw: document.querySelector('#raw'),
  copyJson: document.querySelector('#copy-json'),
  reanalyze: document.querySelector('#reanalyze')
};

let selectedFile = null;
let previewUrl = null;
let abortController = null;
let connected = false;

async function refreshStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    connected = status.connected && status.modelInstalled;
    elements.model.textContent = status.model;
    elements.status.innerHTML = `<span class="dot ${connected ? 'connected' : 'error'}"></span>${escapeHtml(status.message)}`;
    elements.installCommand.hidden = !status.installCommand;
    elements.installCommand.textContent = status.installCommand || '';
    updateAnalyzeState();
  } catch {
    connected = false;
    elements.status.innerHTML = '<span class="dot error"></span>Ollama недоступно. Запустіть Ollama та повторіть спробу.';
    updateAnalyzeState();
  }
}

elements.file.addEventListener('change', () => {
  selectedFile = elements.file.files?.[0] || null;
  clearError();
  elements.result.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;
  elements.preview.hidden = !previewUrl;
  elements.preview.src = previewUrl || '';
  elements.fileName.textContent = selectedFile ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}` : 'PNG, JPEG або WEBP, до 10 МБ';
  updateAnalyzeState();
});

elements.analyze.addEventListener('click', analyze);
elements.reanalyze.addEventListener('click', analyze);
elements.cancel.addEventListener('click', () => abortController?.abort());
elements.copyJson.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.json.textContent || '');
  const original = elements.copyJson.textContent;
  elements.copyJson.textContent = 'Скопійовано';
  setTimeout(() => { elements.copyJson.textContent = original; }, 1200);
});
window.addEventListener('beforeunload', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });

async function analyze() {
  if (!selectedFile || abortController) return;
  clearError();
  elements.result.hidden = true;
  abortController = new AbortController();
  elements.progress.hidden = false;
  elements.cancel.hidden = false;
  updateAnalyzeState();

  const body = new FormData();
  body.append('file', selectedFile);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', body, signal: abortController.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.title || 'Не вдалося проаналізувати зображення.');
    renderResult(payload);
  } catch (error) {
    if (error.name === 'AbortError') showError('Аналіз скасовано.');
    else showError(error.message || 'Не вдалося проаналізувати зображення.');
  } finally {
    abortController = null;
    elements.progress.hidden = true;
    elements.cancel.hidden = true;
    updateAnalyzeState();
    refreshStatus();
  }
}

function renderResult(payload) {
  const analysis = payload.analysis;
  elements.title.textContent = analysis.title;
  elements.sourceLanguage.textContent = analysis.sourceLanguage;
  elements.grade.textContent = analysis.suggestedGrade ? `${analysis.suggestedGrade} клас` : 'Не визначено';
  elements.topic.textContent = analysis.suggestedTopic;
  elements.resultModel.textContent = payload.model;
  elements.duration.textContent = formatDuration(payload.processingTimeMilliseconds);
  elements.sections.replaceChildren(...analysis.sections.map(renderSection));
  elements.warningsPanel.hidden = analysis.warnings.length === 0;
  elements.warnings.replaceChildren(...analysis.warnings.map(warning => {
    const item = document.createElement('li');
    item.textContent = `${warning.sectionId ? `Розділ ${warning.sectionId}: ` : ''}${warning.message}`;
    return item;
  }));
  elements.json.textContent = JSON.stringify(analysis, null, 2);
  elements.rawDetails.hidden = !payload.rawResponse;
  elements.raw.textContent = payload.rawResponse || '';
  elements.result.hidden = false;
  elements.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSection(section) {
  const article = document.createElement('article');
  article.className = 'section';
  article.innerHTML = `<span class="section-type">${escapeHtml(section.id)} · ${escapeHtml(section.type)}</span><h3>${escapeHtml(section.title)}</h3>`;
  if (section.text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = section.text;
    article.append(paragraph);
  }
  if (section.formulas?.length) {
    const formulas = document.createElement('div');
    formulas.className = 'formulas';
    for (const value of section.formulas) {
      const formula = document.createElement('code');
      formula.className = 'formula';
      formula.textContent = value;
      formulas.append(formula);
    }
    article.append(formulas);
  }
  if (section.table) article.append(renderTable(section.table));
  if (section.visual) {
    const visual = document.createElement('pre');
    visual.className = 'visual';
    visual.textContent = JSON.stringify(section.visual, null, 2);
    article.append(visual);
  }
  return article;
}

function renderTable(data) {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  data.headers.forEach(value => { const cell = document.createElement('th'); cell.textContent = value; head.append(cell); });
  const body = table.createTBody();
  data.rows.forEach(row => { const tr = body.insertRow(); row.forEach(value => { const cell = tr.insertCell(); cell.textContent = value; }); });
  return table;
}

function updateAnalyzeState() { elements.analyze.disabled = !selectedFile || !connected || Boolean(abortController); elements.reanalyze.disabled = !selectedFile || !connected || Boolean(abortController); }
function showError(message) { elements.error.textContent = message; elements.error.hidden = false; }
function clearError() { elements.error.hidden = true; elements.error.textContent = ''; }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`; }
function formatDuration(milliseconds) { return milliseconds < 1000 ? `${milliseconds} мс` : `${(milliseconds / 1000).toFixed(1)} с`; }
function escapeHtml(value) { const element = document.createElement('span'); element.textContent = String(value); return element.innerHTML; }

refreshStatus();

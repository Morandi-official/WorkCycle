const els = {
  prevMonth: document.querySelector('#prevMonth'),
  nextMonth: document.querySelector('#nextMonth'),
  monthTitle: document.querySelector('#monthTitle'),
  calendarGrid: document.querySelector('#calendarGrid'),
  dayTemplate: document.querySelector('#dayTemplate'),
  selectedDateTitle: document.querySelector('#selectedDateTitle'),
  saveStatus: document.querySelector('#saveStatus'),
  editor: document.querySelector('#editor'),
  saveNow: document.querySelector('#saveNow'),
  clearFormat: document.querySelector('#clearFormat')
};

let viewDate = startOfMonth(new Date());
let selectedDate = stripTime(new Date());
let records = new Map();
let localMode = false;
let saveTimer = null;
let savedRange = null;

const allowedHighlightColors = new Set(['yellow', 'green', 'blue', 'pink', 'orange', 'purple', 'gray']);
const styleColorMap = new Map([
  ['255, 240, 168', 'yellow'],
  ['215, 242, 216', 'green'],
  ['217, 234, 255', 'blue'],
  ['255, 224, 234', 'pink'],
  ['255, 217, 179', 'orange'],
  ['231, 221, 255', 'purple'],
  ['230, 227, 221', 'gray']
]);

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return stripTime(next);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function displayDate(date) {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function displayMonth(date) {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function cycleIndex(date) {
  const epochThursday = new Date(2024, 0, 4);
  const diff = Math.floor((stripTime(date) - epochThursday) / 86400000);
  return Math.floor(diff / 7);
}

function isWednesday(date) {
  return date.getDay() === 3;
}

function isSameDate(a, b) {
  return formatDate(a) === formatDate(b);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function localKey(month) {
  return `workcycle-records:${month}`;
}

function colorFromElement(node) {
  const explicit = node.dataset?.color;
  if (allowedHighlightColors.has(explicit)) return explicit;

  for (const color of allowedHighlightColors) {
    if (node.classList?.contains(`mark-${color}`) || node.classList?.contains(`mark-${color}-highlight`)) return color;
  }

  const styleText = `${node.getAttribute?.('style') || ''} ${node.style?.backgroundColor || ''}`.toLowerCase();
  for (const [rgb, color] of styleColorMap.entries()) {
    if (styleText.includes(rgb)) return color;
  }

  return null;
}

function htmlToPreview(html) {
  const source = document.createElement('div');
  source.innerHTML = html || '';

  if (!source.textContent.trim()) return '';

  const preview = document.createElement('div');

  function copySafe(node, target) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(document.createTextNode(node.textContent));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') {
      target.append(document.createElement('br'));
      return;
    }

    const color = colorFromElement(node);
    if ((tag === 'mark' || tag === 'span') && color) {
      const mark = document.createElement('mark');
      mark.dataset.color = color;
      node.childNodes.forEach((child) => copySafe(child, mark));
      target.append(mark);
      return;
    }

    if (tag === 'div' || tag === 'p') {
      if (target.childNodes.length) target.append(document.createElement('br'));
      node.childNodes.forEach((child) => copySafe(child, target));
      return;
    }

    node.childNodes.forEach((child) => copySafe(child, target));
  }

  source.childNodes.forEach((child) => copySafe(child, preview));
  return preview.innerHTML;
}

function currentDateKey() {
  return formatDate(selectedDate);
}

function syncCurrentRecordPreview() {
  const dateKey = currentDateKey();
  const content = els.editor.innerHTML.trim();
  records.set(dateKey, content);
  updateDayPreview(dateKey, content);
}

async function loadMonthRecords() {
  const key = monthKey(viewDate);
  els.saveStatus.textContent = '正在读取记录…';

  if (localMode) {
    records = readLocalRecords(key);
    els.saveStatus.textContent = '本地模式';
    return;
  }

  try {
    const response = await fetchWithTimeout(`/api/records?month=${encodeURIComponent(key)}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    records = new Map(data.map((item) => [item.day, item.content || '']));
    els.saveStatus.textContent = '云端已连接';
  } catch (error) {
    console.warn('云端读取失败，切换为本地模式：', error);
    localMode = true;
    records = readLocalRecords(key);
    els.saveStatus.textContent = '本地模式';
  }
}

function readLocalRecords(month) {
  try {
    const object = JSON.parse(localStorage.getItem(localKey(month)) || '{}');
    return new Map(Object.entries(object));
  } catch {
    return new Map();
  }
}

function writeLocalRecord(dateKey, content) {
  const month = dateKey.slice(0, 7);
  const map = readLocalRecords(month);
  map.set(dateKey, content);
  localStorage.setItem(localKey(month), JSON.stringify(Object.fromEntries(map)));
}

async function saveRecord() {
  syncCurrentRecordPreview();
  const dateKey = currentDateKey();
  const content = records.get(dateKey) || '';

  if (localMode) {
    writeLocalRecord(dateKey, content);
    els.saveStatus.textContent = `本地已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    return;
  }

  try {
    els.saveStatus.textContent = '正在保存…';
    const response = await fetchWithTimeout('/api/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: dateKey, content })
    });
    if (!response.ok) throw new Error(await response.text());
    els.saveStatus.textContent = `云端已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    console.warn('云端保存失败，改为本地保存：', error);
    localMode = true;
    writeLocalRecord(dateKey, content);
    els.saveStatus.textContent = '云端不可用，已本地保存';
  }
}

function scheduleSave() {
  syncCurrentRecordPreview();
  clearTimeout(saveTimer);
  els.saveStatus.textContent = '等待自动保存…';
  saveTimer = setTimeout(saveRecord, 650);
}

function renderCalendar() {
  els.monthTitle.textContent = displayMonth(viewDate);
  els.calendarGrid.textContent = '';

  const first = startOfMonth(viewDate);
  const start = addDays(first, -mondayIndex(first));
  const today = stripTime(new Date());

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    const dateKey = formatDate(date);
    const node = els.dayTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.date = dateKey;
    node.classList.toggle('outside', date.getMonth() !== viewDate.getMonth());
    node.classList.toggle('report-day', isWednesday(date));
    node.classList.toggle('today', isSameDate(date, today));
    node.classList.toggle('selected', isSameDate(date, selectedDate));
    node.classList.add(cycleIndex(date) % 2 === 0 ? 'cycle-a' : 'cycle-b');
    node.querySelector('.day-number').textContent = date.getDate();
    node.querySelector('.day-preview').innerHTML = htmlToPreview(records.get(dateKey));
    node.addEventListener('click', () => selectDate(date));
    els.calendarGrid.append(node);
  }
}

function updateDayPreview(dateKey, content) {
  const cell = els.calendarGrid.querySelector(`[data-date="${dateKey}"]`);
  if (cell) cell.querySelector('.day-preview').innerHTML = htmlToPreview(content);
}

function selectDate(date) {
  selectedDate = stripTime(date);
  if (selectedDate.getMonth() !== viewDate.getMonth()) {
    viewDate = startOfMonth(selectedDate);
    loadMonthRecords().then(() => {
      renderCalendar();
      updateEditor();
    });
    return;
  }
  renderCalendar();
  updateEditor();
}

function updateEditor() {
  const dateKey = currentDateKey();
  els.selectedDateTitle.textContent = displayDate(selectedDate);
  els.editor.innerHTML = records.get(dateKey) || '';
}

function saveSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!els.editor.contains(range.commonAncestorContainer)) return;
  savedRange = range.cloneRange();
}

function restoreSelection() {
  const selection = window.getSelection();
  if (!selection || !savedRange) return null;
  selection.removeAllRanges();
  selection.addRange(savedRange);
  return savedRange;
}

function unwrapElement(element) {
  const parent = element.parentNode;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
  parent.normalize();
}

function unwrapMarksInFragment(fragment) {
  fragment.querySelectorAll('mark, span').forEach((element) => {
    if (element.tagName.toLowerCase() === 'mark' || colorFromElement(element)) unwrapElement(element);
  });
  return fragment;
}

function removeAllHighlights() {
  els.editor.querySelectorAll('mark, span').forEach((element) => {
    if (element.tagName.toLowerCase() === 'mark' || colorFromElement(element)) unwrapElement(element);
  });
  scheduleSave();
}

function applyHighlight(color) {
  els.editor.focus();
  const range = restoreSelection();
  if (!range || range.collapsed || !allowedHighlightColors.has(color)) return;

  const mark = document.createElement('mark');
  mark.dataset.color = color;
  mark.className = `mark-${color}`;
  const fragment = unwrapMarksInFragment(range.extractContents());
  mark.append(fragment);
  range.insertNode(mark);

  const selection = window.getSelection();
  selection.removeAllRanges();
  savedRange = null;
  scheduleSave();
}

function clearFormat() {
  els.editor.focus();
  const range = restoreSelection();

  if (!range || range.collapsed) {
    removeAllHighlights();
    return;
  }

  const fragment = unwrapMarksInFragment(range.extractContents());
  range.insertNode(fragment);

  const selection = window.getSelection();
  selection.removeAllRanges();
  savedRange = null;
  scheduleSave();
}

async function changeMonth(amount) {
  await saveRecord();
  viewDate = addMonths(viewDate, amount);
  if (selectedDate.getMonth() !== viewDate.getMonth() || selectedDate.getFullYear() !== viewDate.getFullYear()) {
    selectedDate = startOfMonth(viewDate);
  }
  await loadMonthRecords();
  renderCalendar();
  updateEditor();
}

function bindEvents() {
  els.prevMonth.addEventListener('click', () => changeMonth(-1));
  els.nextMonth.addEventListener('click', () => changeMonth(1));
  els.editor.addEventListener('input', scheduleSave);
  els.editor.addEventListener('mouseup', saveSelection);
  els.editor.addEventListener('keyup', saveSelection);
  els.editor.addEventListener('touchend', saveSelection);
  els.saveNow.addEventListener('click', saveRecord);
  els.clearFormat.addEventListener('mousedown', (event) => event.preventDefault());
  els.clearFormat.addEventListener('click', clearFormat);
  document.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => applyHighlight(button.dataset.color));
  });
}

async function init() {
  bindEvents();
  await loadMonthRecords();
  renderCalendar();
  updateEditor();
}

init().catch((error) => {
  console.error(error);
  els.saveStatus.textContent = `初始化失败：${error.message}`;
});

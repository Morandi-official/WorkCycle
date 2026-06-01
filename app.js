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
let previewTimer = null;
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

function cacheCurrentEditorContent() {
  records.set(currentDateKey(), els.editor.innerHTML.trim());
}

function syncCurrentRecordPreview() {
  cacheCurrentEditorContent();
  const dateKey = currentDateKey();
  updateDayPreview(dateKey, records.get(dateKey) || '');
}

function schedulePreviewSync() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(syncCurrentRecordPreview, 180);
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
  cacheCurrentEditorContent();
  schedulePreviewSync();
  clearTimeout(saveTimer);
  els.saveStatus.textContent = '等待自动保存…';
  saveTimer = setTimeout(saveRecord, 1100);
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
  savedRange = null;
}

function nodeInsideEditor(node) {
  if (!node) return false;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(element && els.editor.contains(element));
}

function getLiveEditorRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!nodeInsideEditor(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

function rangeIsUsable(range) {
  try {
    return Boolean(range && !range.collapsed && nodeInsideEditor(range.commonAncestorContainer));
  } catch {
    return false;
  }
}

function saveSelection() {
  const range = getLiveEditorRange();
  if (range) savedRange = range;
}

function getUsableRange() {
  const liveRange = getLiveEditorRange();
  if (liveRange) {
    savedRange = liveRange.cloneRange();
    return liveRange;
  }
  return rangeIsUsable(savedRange) ? savedRange.cloneRange() : null;
}

function restoreRange(range) {
  const selection = window.getSelection();
  if (!selection || !range) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAfter(node) {
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  restoreRange(range);
}

function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
  parent.normalize();
}

function isHighlightElement(element) {
  return element?.tagName?.toLowerCase() === 'mark' || Boolean(colorFromElement(element));
}

function unwrapHighlightsIn(container) {
  const elements = Array.from(container.querySelectorAll('mark, span'))
    .filter(isHighlightElement)
    .reverse();
  elements.forEach(unwrapElement);
  return container;
}

function removeAllHighlights() {
  Array.from(els.editor.querySelectorAll('mark, span'))
    .filter(isHighlightElement)
    .reverse()
    .forEach(unwrapElement);
  syncCurrentRecordPreview();
  scheduleSave();
}

function applyHighlight(color) {
  if (!allowedHighlightColors.has(color)) return;

  const range = getUsableRange();
  if (!range) {
    els.saveStatus.textContent = '请先选中文字';
    return;
  }

  els.editor.focus({ preventScroll: true });
  restoreRange(range);

  try {
    const mark = document.createElement('mark');
    mark.dataset.color = color;
    mark.className = `mark-${color}`;
    const fragment = unwrapHighlightsIn(range.extractContents());
    mark.append(fragment);
    range.insertNode(mark);
    placeCaretAfter(mark);
    savedRange = null;
    syncCurrentRecordPreview();
    scheduleSave();
  } catch (error) {
    console.warn('高亮失败：', error);
    els.saveStatus.textContent = '高亮失败，请重新选中文字';
  }
}

function clearFormat() {
  const range = getUsableRange();
  els.editor.focus({ preventScroll: true });

  if (!range) {
    removeAllHighlights();
    return;
  }

  restoreRange(range);

  try {
    const fragment = unwrapHighlightsIn(range.extractContents());
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) placeCaretAfter(lastNode);
    savedRange = null;
    syncCurrentRecordPreview();
    scheduleSave();
  } catch (error) {
    console.warn('清除高亮失败：', error);
    els.saveStatus.textContent = '清除失败，请重新选中文字';
  }
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

function handleFormatButtonPointerDown(event) {
  saveSelection();
  event.preventDefault();
}

function bindEvents() {
  els.prevMonth.addEventListener('click', () => changeMonth(-1));
  els.nextMonth.addEventListener('click', () => changeMonth(1));
  els.editor.addEventListener('input', scheduleSave);
  els.editor.addEventListener('mouseup', saveSelection);
  els.editor.addEventListener('keyup', saveSelection);
  els.editor.addEventListener('touchend', saveSelection);
  document.addEventListener('selectionchange', saveSelection);

  els.saveNow.addEventListener('click', saveRecord);
  els.clearFormat.addEventListener('pointerdown', handleFormatButtonPointerDown);
  els.clearFormat.addEventListener('mousedown', handleFormatButtonPointerDown);
  els.clearFormat.addEventListener('click', clearFormat);

  document.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('pointerdown', handleFormatButtonPointerDown);
    button.addEventListener('mousedown', handleFormatButtonPointerDown);
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

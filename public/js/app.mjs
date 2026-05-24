import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  get,
  getDatabase,
  ref,
  set
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { firebaseConfig } from './firebase-config.mjs';
import {
  COURSE_CATALOG,
  PRICING_RULES,
  calculateTuitionAllocation,
  formatMoney
} from './pricing.mjs';

const storageKey = 'bearhigh.accounting.v1';
const accountingRoot = 'accounting';
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const state = loadState();
let clearArmedUntil = 0;
let currentUser = null;

state.tuitionPayments ||= [];
state.membershipEvents ||= [];
state.payrollRuns ||= [];
state.importSnapshot ||= null;

const elements = {
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  tuitionForm: document.querySelector('#tuitionForm'),
  eventForm: document.querySelector('#eventForm'),
  payrollForm: document.querySelector('#payrollForm'),
  pricingVersion: document.querySelector('#pricingVersion'),
  packageId: document.querySelector('#packageId'),
  courseOptions: document.querySelector('#courseOptions'),
  allocationTotal: document.querySelector('#allocationTotal'),
  allocationWarnings: document.querySelector('#allocationWarnings'),
  allocationRows: document.querySelector('#allocationRows'),
  eventRows: document.querySelector('#eventRows'),
  payrollRows: document.querySelector('#payrollRows'),
  tuitionRecords: document.querySelector('#tuitionRecords'),
  payrollRecords: document.querySelector('#payrollRecords'),
  importStatus: document.querySelector('#importStatus'),
  importSummary: document.querySelector('#importSummary'),
  importSheetRows: document.querySelector('#importSheetRows'),
  importTeacherRows: document.querySelector('#importTeacherRows'),
  importPayrollBlockRows: document.querySelector('#importPayrollBlockRows'),
  importStudentRows: document.querySelector('#importStudentRows'),
  importStudentSearch: document.querySelector('#importStudentSearch'),
  authStatus: document.querySelector('#authStatus'),
  cloudStatus: document.querySelector('#cloudStatus'),
  signInGoogle: document.querySelector('#signInGoogle'),
  signOutGoogle: document.querySelector('#signOutGoogle'),
  loadCloudImport: document.querySelector('#loadCloudImport'),
  saveTuition: document.querySelector('#saveTuition'),
  storageStatus: document.querySelector('#storageStatus')
};

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {
      tuitionPayments: [],
      membershipEvents: [],
      payrollRuns: [],
      importSnapshot: null
    };
  } catch {
    return {
      tuitionPayments: [],
      membershipEvents: [],
      payrollRuns: [],
      importSnapshot: null
    };
  }
}

function saveState() {
  const persistedState = {
    tuitionPayments: state.tuitionPayments,
    membershipEvents: state.membershipEvents,
    payrollRuns: state.payrollRuns,
    importSnapshot: null
  };
  localStorage.setItem(storageKey, JSON.stringify(persistedState));
  elements.storageStatus.textContent = `本機草稿 ${state.tuitionPayments.length + state.membershipEvents.length + state.payrollRuns.length} 筆`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderOptions() {
  elements.pricingVersion.innerHTML = Object.entries(PRICING_RULES.versions)
    .map(([value, rule]) => `<option value="${escapeHtml(value)}">${escapeHtml(rule.label)}</option>`)
    .join('');
  elements.pricingVersion.value = 'current_21600_24';

  elements.packageId.innerHTML = Object.entries(PRICING_RULES.specialPackages)
    .map(([value, rule]) => `<option value="${escapeHtml(value)}">${escapeHtml(rule.label)}</option>`)
    .join('');

  elements.courseOptions.innerHTML = COURSE_CATALOG.map((course) => `
    <label class="course-toggle">
      <input type="checkbox" name="courses" value="${escapeHtml(course.id)}">
      <span>${escapeHtml(course.name)}</span>
    </label>
  `).join('');
}

function getFormData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.courses = Array.from(form.querySelectorAll('input[name="courses"]:checked')).map((input) => input.value);
  return data;
}

function renderAllocationPreview() {
  const data = getFormData(elements.tuitionForm);
  const result = calculateTuitionAllocation(data);

  elements.allocationTotal.textContent = `$${formatMoney(result.totals.paid)}`;
  const messages = [
    ...result.errors.map((message) => `<div class="error">${escapeHtml(message)}</div>`),
    ...result.warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`)
  ];
  elements.saveTuition.disabled = result.errors.length > 0;
  elements.allocationWarnings.innerHTML = messages.join('');
  elements.allocationRows.innerHTML = result.rows.length
    ? result.rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.courseName)}</td>
        <td class="money">${formatMoney(row.listPrice)}</td>
        <td class="money">${formatMoney(row.builtInPackageDiscount)}</td>
        <td class="money">${formatMoney(row.baseAmount)}</td>
        <td class="money">${formatMoney(row.packageDiscount)}</td>
        <td class="money">${formatMoney(row.voucher)}</td>
        <td class="money">${formatMoney(row.manualDiscount)}</td>
        <td class="money">${formatMoney(row.revenueAmount)}</td>
      </tr>
    `).join('')
    : emptyRow(8);
}

function emptyRow(colspan) {
  return `<tr><td colspan="${colspan}" class="empty">尚無資料</td></tr>`;
}

function nowId(prefix) {
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${Math.random().toString(16).slice(2, 7)}`;
}

function accountingRef(path = '') {
  return ref(database, path ? `${accountingRoot}/${path}` : accountingRoot);
}

function setCloudStatus(message) {
  elements.cloudStatus.textContent = message;
}

function renderAuth(user) {
  currentUser = user;
  const email = user?.email || '';
  elements.authStatus.textContent = email || '尚未登入';
  elements.signInGoogle.hidden = !!user;
  elements.signOutGoogle.hidden = !user;
  elements.loadCloudImport.disabled = !user;
  setCloudStatus(user ? '雲端已連線' : '雲端未連線');
}

async function loadCloudImportSnapshot() {
  if (!currentUser) {
    setCloudStatus('請先登入');
    return;
  }
  setCloudStatus('讀取雲端中');
  const currentBatch = await get(accountingRef('currentImportBatchId'));
  const batchId = currentBatch.val();
  if (!batchId) {
    setCloudStatus('尚無雲端匯入');
    return;
  }
  const snapshot = await get(accountingRef(`importBatches/${batchId}`));
  if (!snapshot.exists()) {
    setCloudStatus('找不到雲端批次');
    return;
  }
  state.importSnapshot = snapshot.val();
  renderAll();
  setActiveTab('import');
  setCloudStatus(`已載入 ${batchId}`);
}

async function saveCloudRecord(kind, record) {
  if (!currentUser) return;
  const payload = {
    ...record,
    syncedAt: new Date().toISOString(),
    syncedBy: currentUser.email || currentUser.uid
  };
  await set(accountingRef(`manual/${kind}/${record.id}`), payload);
  setCloudStatus('雲端已同步');
}

function renderEvents() {
  elements.eventRows.innerHTML = state.membershipEvents.length
    ? state.membershipEvents
      .slice()
      .sort((a, b) => `${a.date}-${a.sessionNo}`.localeCompare(`${b.date}-${b.sessionNo}`))
      .map((event) => `
        <tr>
          <td>${escapeHtml(event.date)}</td>
          <td>${escapeHtml(event.courseName)}</td>
          <td>${escapeHtml(event.sessionNo)}</td>
          <td>${escapeHtml(event.studentName)}</td>
          <td>${escapeHtml(event.action)}</td>
          <td>${escapeHtml(event.note || '')}</td>
        </tr>
      `).join('')
    : emptyRow(6);
}

function renderPayroll() {
  elements.payrollRows.innerHTML = state.payrollRuns.length
    ? state.payrollRuns.map((row) => `
      <tr>
        <td>${escapeHtml(row.month)}</td>
        <td>${escapeHtml(row.teacherName)}</td>
        <td>${escapeHtml(row.courseName)}</td>
        <td class="money">${row.sessionCount}</td>
        <td class="money">${formatMoney(row.rate)}</td>
        <td class="money">${formatMoney(row.adjustment)}</td>
        <td class="money">${formatMoney(row.total)}</td>
      </tr>
    `).join('')
    : emptyRow(7);
}

function renderRecords() {
  elements.tuitionRecords.innerHTML = state.tuitionPayments.length
    ? state.tuitionPayments.slice().reverse().map((payment) => `
      <article class="record-item">
        <strong>${escapeHtml(payment.studentName)} · ${escapeHtml(payment.cohort)} · $${formatMoney(payment.allocation.totals.paid)}</strong>
        <p>${escapeHtml(payment.school || '未填學校')}｜${escapeHtml(payment.courseNames.join('、'))}｜${escapeHtml(payment.note || '無備註')}</p>
      </article>
    `).join('')
    : '<div class="record-item"><p>尚無學費紀錄</p></div>';

  elements.payrollRecords.innerHTML = state.payrollRuns.length
    ? state.payrollRuns.slice().reverse().map((row) => `
      <article class="record-item">
        <strong>${escapeHtml(row.month)} · ${escapeHtml(row.teacherName)} · $${formatMoney(row.total)}</strong>
        <p>${escapeHtml(row.courseName)}｜${row.sessionCount} 堂｜${escapeHtml(row.note || '無備註')}</p>
      </article>
    `).join('')
    : '<div class="record-item"><p>尚無薪資草表</p></div>';
}

function renderImport() {
  const snapshot = state.importSnapshot;
  if (!snapshot) {
    elements.importStatus.textContent = '尚未載入';
    elements.importSummary.innerHTML = '<div class="record-item"><p>尚無匯入快照</p></div>';
    elements.importSheetRows.innerHTML = emptyRow(6);
    elements.importTeacherRows.innerHTML = emptyRow(5);
    elements.importPayrollBlockRows.innerHTML = emptyRow(4);
    elements.importStudentRows.innerHTML = emptyRow(6);
    return;
  }

  const summary = snapshot.summary || {};
  elements.importStatus.textContent = `已載入 ${summary.studentCount || 0} 筆`;
  elements.importSummary.innerHTML = [
    ['學生列', summary.studentCount || 0],
    ['學費欄位', summary.tuitionEntryCount || 0],
    ['老師名單列', summary.teacherRosterRowCount || 0],
    ['薪資列', summary.teacherPayrollRowCount || 0],
    ['學生分頁', summary.studentSheetCount || 0],
    ['老師分頁', summary.teacherSheetCount || 0]
  ].map(([label, value]) => `
    <div class="summary-cell">
      <strong>${formatMoney(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `).join('');

  elements.importSheetRows.innerHTML = (summary.sheets || []).length
    ? summary.sheets.map((sheet) => `
      <tr>
        <td>${escapeHtml(sheet.sheet)}</td>
        <td class="money">${formatMoney(sheet.studentCount)}</td>
        <td class="money">${formatMoney(sheet.selectedCourseCount)}</td>
        <td class="money">${formatMoney(sheet.tuitionEntryCount)}</td>
        <td class="money">${formatMoney(sheet.rowsWithTuitionEntries)}</td>
        <td>${escapeHtml(Object.entries(sheet.tuitionEntryKinds || {}).map(([key, value]) => `${key}:${value}`).join('、'))}</td>
      </tr>
    `).join('')
    : emptyRow(6);

  elements.importTeacherRows.innerHTML = (summary.teacherSheets || []).length
    ? summary.teacherSheets.map((sheet) => `
      <tr>
        <td>${escapeHtml(sheet.sheet)}</td>
        <td class="money">${formatMoney(sheet.rosterBlockCount)}</td>
        <td class="money">${formatMoney(sheet.rosterRowCount)}</td>
        <td class="money">${formatMoney(sheet.payrollBlockCount)}</td>
        <td class="money">${formatMoney(sheet.payrollRowCount)}</td>
      </tr>
    `).join('')
    : emptyRow(5);

  const payrollBlocks = (snapshot.teacherSheets || []).flatMap((sheet) => sheet.payrollBlocks || []);
  elements.importPayrollBlockRows.innerHTML = payrollBlocks.length
    ? payrollBlocks.slice(0, 120).map((block) => `
      <tr>
        <td>${escapeHtml(block.sheet)}</td>
        <td>${escapeHtml(block.title)}</td>
        <td>${escapeHtml(block.startColumn)}</td>
        <td class="money">${formatMoney(block.rowCount)}</td>
      </tr>
    `).join('')
    : emptyRow(4);

  const tuitionCountByStudent = new Map();
  for (const entry of snapshot.tuitionEntries || []) {
    tuitionCountByStudent.set(entry.studentId, (tuitionCountByStudent.get(entry.studentId) || 0) + 1);
  }

  const query = elements.importStudentSearch.value.trim().toLowerCase();
  const students = (snapshot.students || []).filter((student) => {
    if (!query) return true;
    const profile = student.profile || {};
    return [profile.name, profile.highSchool, profile.juniorHigh, student.sheet]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }).slice(0, 80);

  elements.importStudentRows.innerHTML = students.length
    ? students.map((student) => {
      const profile = student.profile || {};
      return `
        <tr>
          <td>${escapeHtml(profile.name || '')}</td>
          <td>${escapeHtml(student.sheet)}</td>
          <td class="money">${student.row}</td>
          <td>${escapeHtml(profile.highSchool || profile.juniorHigh || '')}</td>
          <td class="money">${formatMoney((student.selectedCourses || []).length)}</td>
          <td class="money">${formatMoney(tuitionCountByStudent.get(student.id) || 0)}</td>
        </tr>
      `;
    }).join('')
    : emptyRow(6);
}

function renderAll() {
  renderAllocationPreview();
  renderEvents();
  renderPayroll();
  renderRecords();
  renderImport();
  saveState();
}

function setActiveTab(tabName) {
  elements.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === tabName));
  elements.panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tabName));
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => {
    const text = String(cell ?? '');
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
}

elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});

elements.tuitionForm.addEventListener('input', renderAllocationPreview);
elements.tuitionForm.addEventListener('change', renderAllocationPreview);

elements.tuitionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = getFormData(elements.tuitionForm);
  const allocation = calculateTuitionAllocation(data);
  if (allocation.errors.length) {
    renderAllocationPreview();
    return;
  }

  const record = {
    id: nowId('tuition'),
    createdAt: new Date().toISOString(),
    ...data,
    courseNames: allocation.rows.map((row) => row.courseName),
    allocation
  };
  state.tuitionPayments.push(record);

  elements.tuitionForm.reset();
  elements.pricingVersion.value = 'current_21600_24';
  renderAll();
  try {
    await saveCloudRecord('tuitionPayments', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

document.querySelector('#clearTuitionForm').addEventListener('click', () => {
  elements.tuitionForm.reset();
  elements.pricingVersion.value = 'current_21600_24';
  renderAllocationPreview();
});

elements.eventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.eventForm).entries());
  const record = {
    id: nowId('event'),
    createdAt: new Date().toISOString(),
    ...data
  };
  state.membershipEvents.push(record);
  elements.eventForm.reset();
  renderAll();
  try {
    await saveCloudRecord('membershipEvents', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.payrollForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.payrollForm).entries());
  const sessionCount = Number(data.sessionCount || 0);
  const rate = Number(String(data.rate || '0').replace(/,/g, ''));
  const adjustment = Number(String(data.adjustment || '0').replace(/,/g, ''));

  const record = {
    id: nowId('payroll'),
    createdAt: new Date().toISOString(),
    ...data,
    sessionCount,
    rate,
    adjustment,
    total: Math.round(sessionCount * rate + adjustment)
  };
  state.payrollRuns.push(record);
  elements.payrollForm.reset();
  renderAll();
  try {
    await saveCloudRecord('payrollRuns', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

document.querySelector('#exportJson').addEventListener('click', () => {
  downloadFile('bearhigh-accounting-local-draft.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
});

document.querySelector('#exportTuitionCsv').addEventListener('click', () => {
  const rows = [
    ['建立時間', '學生', 'cohort', '學校', '課程', '實收', '科目', '原價', '內建合報優惠', '規則金額', '額外合報優惠', '抵用券', '手動折扣', '實際收入', '備註']
  ];

  for (const payment of state.tuitionPayments) {
    for (const row of payment.allocation.rows) {
      rows.push([
        payment.createdAt,
        payment.studentName,
        payment.cohort,
        payment.school,
        payment.courseNames.join(' / '),
        payment.allocation.totals.paid,
        row.courseName,
        row.listPrice,
        row.builtInPackageDiscount,
        row.baseAmount,
        row.packageDiscount,
        row.voucher,
        row.manualDiscount,
        row.revenueAmount,
        payment.note
      ]);
    }
  }

  downloadFile('bearhigh-tuition-allocations.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

document.querySelector('#loadLocalImport').addEventListener('click', async () => {
  elements.importStatus.textContent = '載入中';
  try {
    const response = await fetch('./local-data/numbers_import_latest.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    state.importSnapshot = await response.json();
    renderAll();
    setActiveTab('import');
  } catch (error) {
    elements.importStatus.textContent = '找不到本機快照';
    elements.importSummary.innerHTML = `<div class="record-item"><p>${escapeHtml(error.message)}</p></div>`;
  }
});

elements.loadCloudImport.addEventListener('click', () => {
  loadCloudImportSnapshot().catch((error) => {
    setCloudStatus(`雲端讀取失敗：${error.code || error.message}`);
  });
});

document.querySelector('#clearImport').addEventListener('click', () => {
  state.importSnapshot = null;
  renderAll();
});

document.querySelector('#exportImportedPayrollCsv').addEventListener('click', () => {
  if (!state.importSnapshot) return;
  const rows = [['分頁', '月份/區塊', '起始欄', '原始列', '欄位', '值']];
  for (const teacherSheet of state.importSnapshot.teacherSheets || []) {
    for (const block of teacherSheet.payrollBlocks || []) {
      for (const row of block.rows || []) {
        for (const cell of row.cells || []) {
          rows.push([teacherSheet.summary?.sheet || block.sheet, block.title, block.startColumn, row.row, cell.column, cell.value]);
        }
      }
    }
  }
  downloadFile('bearhigh-imported-teacher-payroll.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

elements.importStudentSearch.addEventListener('input', renderImport);

document.querySelector('#clearAll').addEventListener('click', () => {
  const button = document.querySelector('#clearAll');
  const now = Date.now();
  if (now > clearArmedUntil) {
    clearArmedUntil = now + 3500;
    button.textContent = '再按一次清除';
    window.setTimeout(() => {
      if (Date.now() > clearArmedUntil) {
        button.textContent = '清除本機草稿';
      }
    }, 3600);
    return;
  }

  state.tuitionPayments.splice(0);
  state.membershipEvents.splice(0);
  state.payrollRuns.splice(0);
  state.importSnapshot = null;
  clearArmedUntil = 0;
  button.textContent = '清除本機草稿';
  renderAll();
});

elements.signInGoogle.addEventListener('click', () => {
  setCloudStatus('前往 Google 登入');
  signInWithRedirect(auth, googleProvider);
});

elements.signOutGoogle.addEventListener('click', async () => {
  await signOut(auth);
});

getRedirectResult(auth).catch((error) => {
  setCloudStatus(`登入失敗：${error.code || error.message}`);
});

onAuthStateChanged(auth, (user) => {
  renderAuth(user);
  if (user) {
    loadCloudImportSnapshot().catch((error) => {
      setCloudStatus(`雲端讀取失敗：${error.code || error.message}`);
    });
  }
});

renderOptions();
renderAll();

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
let selectedStudentId = null;

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
  importPayrollRows: document.querySelector('#importPayrollRows'),
  importPayrollSearch: document.querySelector('#importPayrollSearch'),
  importStudentRows: document.querySelector('#importStudentRows'),
  importStudentSearch: document.querySelector('#importStudentSearch'),
  studentCenterRows: document.querySelector('#studentCenterRows'),
  studentCourseFilter: document.querySelector('#studentCourseFilter'),
  studentDashboardSummary: document.querySelector('#studentDashboardSummary'),
  studentDetail: document.querySelector('#studentDetail'),
  studentDuplicateOnly: document.querySelector('#studentDuplicateOnly'),
  studentKeyword: document.querySelector('#studentKeyword'),
  studentPaymentFilter: document.querySelector('#studentPaymentFilter'),
  studentSheetFilter: document.querySelector('#studentSheetFilter'),
  tuitionStudentId: document.querySelector('#tuitionStudentId'),
  eventStudentId: document.querySelector('#eventStudentId'),
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

function getStudents() {
  return state.importSnapshot?.students || [];
}

function getTuitionEntries() {
  return state.importSnapshot?.tuitionEntries || [];
}

function courseLabel(course) {
  return [course.group, course.header, course.column ? `欄 ${course.column}` : '']
    .filter(Boolean)
    .join(' / ');
}

function courseKey(course) {
  return [course.group || '', course.header || '', course.column || ''].join('|');
}

function studentName(student) {
  return student?.profile?.name || '';
}

function studentSchool(student) {
  const profile = student?.profile || {};
  return profile.highSchool || profile.juniorHigh || '';
}

function buildStudentIndexes() {
  const tuitionByStudent = new Map();
  for (const entry of getTuitionEntries()) {
    const entries = tuitionByStudent.get(entry.studentId) || [];
    entries.push(entry);
    tuitionByStudent.set(entry.studentId, entries);
  }

  const studentsById = new Map();
  const nameCounts = new Map();
  for (const student of getStudents()) {
    studentsById.set(student.id, student);
    const name = studentName(student);
    if (name) nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  }

  return { nameCounts, studentsById, tuitionByStudent };
}

function paymentState(entries) {
  if (!entries.length) return { key: 'no_tuition', label: '無學費資料' };
  if (entries.some((entry) => entry.kind === 'refund')) return { key: 'refund', label: '有退費' };
  if (entries.some((entry) => entry.kind === 'payment_date')) return { key: 'paid', label: '有繳費日期' };
  if (entries.some((entry) => entry.kind === 'tuition')) return { key: 'tuition_no_payment', label: '未見繳費日期' };
  return { key: 'no_tuition', label: '無學費資料' };
}

function studentMatchesFilters(student, tuitionEntries, nameCounts) {
  const keyword = elements.studentKeyword.value.trim().toLowerCase();
  const sheet = elements.studentSheetFilter.value;
  const course = elements.studentCourseFilter.value;
  const paymentFilter = elements.studentPaymentFilter.value;
  const duplicateOnly = elements.studentDuplicateOnly.checked;

  if (keyword && !studentSearchText(student, tuitionEntries).includes(keyword)) return false;
  if (sheet && student.sheet !== sheet) return false;
  if (course && !(student.selectedCourses || []).some((studentCourse) => courseKey(studentCourse) === course)) return false;
  if (paymentFilter && paymentState(tuitionEntries).key !== paymentFilter) return false;
  if (duplicateOnly && nameCounts.get(studentName(student)) <= 1) return false;
  return true;
}

function studentSearchText(student, tuitionEntries = []) {
  const profile = student.profile || {};
  return [
    profile.name,
    profile.highSchool,
    profile.juniorHigh,
    student.sheet,
    student.row,
    ...(student.selectedCourses || []).flatMap((course) => [course.group, course.header, course.column]),
    ...tuitionEntries.flatMap((entry) => [entry.header, entry.group, entry.value])
  ].filter(Boolean).join(' ').toLowerCase();
}

function inferCohort(student) {
  const text = `${student?.sheet || ''} ${student?.profile?.grade || ''}`;
  if (text.includes('111高一') || text.includes('高一')) return '高一升高二';
  if (text.includes('110高二') || text.includes('高二')) return '高二升高三';
  if (text.includes('國三')) return '國三升高一';
  if (text.includes('109高三') || text.includes('高三')) return '高三既有資料';
  return '';
}

function inferCourseIds(student) {
  const text = (student?.selectedCourses || [])
    .map((course) => `${course.group || ''} ${course.header || ''}`)
    .join(' ');
  const matches = [
    ['math_mingxuan', /明軒數學|明軒/],
    ['math_huanghao', /黃浩數學|黃浩/],
    ['physics', /物理/],
    ['chemistry', /化學/],
    ['biology', /生物/],
    ['earth_science', /地科|地球科學/],
    ['english', /英文/],
    ['chinese', /國文/],
    ['social', /社會/]
  ];
  return matches.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

function syncStudentSelectOptions() {
  const students = getStudents();
  const options = ['<option value="">未綁定匯入資料</option>'].concat(students.map((student) => {
    const label = `${studentName(student)}｜${student.sheet}｜列 ${student.row}${studentSchool(student) ? `｜${studentSchool(student)}` : ''}`;
    return `<option value="${escapeHtml(student.id)}">${escapeHtml(label)}</option>`;
  }));
  const html = options.join('');
  if (elements.tuitionStudentId.innerHTML !== html) elements.tuitionStudentId.innerHTML = html;
  if (elements.eventStudentId.innerHTML !== html) elements.eventStudentId.innerHTML = html;
}

function syncStudentFilters() {
  const selectedSheet = elements.studentSheetFilter.value;
  const selectedCourse = elements.studentCourseFilter.value;
  const sheets = Array.from(new Set(getStudents().map((student) => student.sheet).filter(Boolean))).sort();
  elements.studentSheetFilter.innerHTML = '<option value="">全部</option>' + sheets
    .map((sheet) => `<option value="${escapeHtml(sheet)}">${escapeHtml(sheet)}</option>`)
    .join('');
  elements.studentSheetFilter.value = sheets.includes(selectedSheet) ? selectedSheet : '';

  const courses = new Map();
  for (const student of getStudents()) {
    for (const course of student.selectedCourses || []) {
      courses.set(courseKey(course), courseLabel(course));
    }
  }
  const courseOptions = Array.from(courses.entries()).sort((a, b) => a[1].localeCompare(b[1], 'zh-Hant'));
  elements.studentCourseFilter.innerHTML = '<option value="">全部</option>' + courseOptions
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  elements.studentCourseFilter.value = courses.has(selectedCourse) ? selectedCourse : '';
}

function getManualRecordsForStudent(student) {
  const name = studentName(student);
  return {
    tuitionPayments: state.tuitionPayments.filter((payment) => (
      payment.studentId === student.id || (!payment.studentId && payment.studentName === name)
    )),
    membershipEvents: state.membershipEvents.filter((event) => (
      event.studentId === student.id || (!event.studentId && event.studentName === name)
    ))
  };
}

function summaryCell(label, value) {
  return `
    <div class="summary-cell">
      <strong>${formatMoney(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderStudentDetail(student, tuitionEntries, duplicateCount) {
  if (!student) {
    elements.studentDetail.innerHTML = '<p class="empty">選一位學生查看課程、學費與異動紀錄</p>';
    return;
  }

  const manual = getManualRecordsForStudent(student);
  const courses = student.selectedCourses || [];
  const payment = paymentState(tuitionEntries);
  const visibleTuitionEntries = tuitionEntries.slice(0, 40);

  elements.studentDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(student.sheet)} · 列 ${escapeHtml(student.row)}</p>
        <h2>${escapeHtml(studentName(student) || '未命名學生')}</h2>
      </div>
      <button class="ghost" type="button" data-fill-student="${escapeHtml(student.id)}">帶入表單</button>
    </div>
    <div class="detail-meta">
      <span>${escapeHtml(studentSchool(student) || '未填學校')}</span>
      <span>${escapeHtml(payment.label)}</span>
      ${duplicateCount > 1 ? `<span class="risk">同名 ${duplicateCount} 筆，請用分頁與列號確認</span>` : ''}
    </div>

    <section class="detail-section">
      <h3>班級 / 課程</h3>
      <div class="tag-list">
        ${courses.length ? courses.map((course) => `<span class="tag">${escapeHtml(courseLabel(course))}</span>`).join('') : '<span class="empty">尚無課程勾選</span>'}
      </div>
    </section>

    <section class="detail-section">
      <h3>Numbers 學費欄位</h3>
      <div class="mini-list">
        ${visibleTuitionEntries.length ? visibleTuitionEntries.map((entry) => `
          <div class="mini-row">
            <strong>${escapeHtml(entry.kind)}</strong>
            <span>${escapeHtml([entry.group, entry.header].filter(Boolean).join(' / '))}</span>
            <span>${escapeHtml(entry.value)}</span>
          </div>
        `).join('') : '<p class="empty">尚無學費欄位</p>'}
        ${tuitionEntries.length > visibleTuitionEntries.length ? `<p class="muted">另有 ${formatMoney(tuitionEntries.length - visibleTuitionEntries.length)} 筆未顯示，可用 CSV 匯出查看。</p>` : ''}
      </div>
    </section>

    <section class="detail-section">
      <h3>本機手動學費紀錄</h3>
      <div class="mini-list">
        ${manual.tuitionPayments.length ? manual.tuitionPayments.map((paymentRecord) => `
          <div class="mini-row">
            <strong>${escapeHtml(paymentRecord.createdAt?.slice(0, 10) || '')}</strong>
            <span>${escapeHtml((paymentRecord.courseNames || []).join('、'))}</span>
            <span>$${formatMoney(paymentRecord.allocation?.totals?.paid || 0)}</span>
          </div>
        `).join('') : '<p class="empty">尚無手動學費紀錄</p>'}
      </div>
    </section>

    <section class="detail-section">
      <h3>本機進退班異動</h3>
      <div class="mini-list">
        ${manual.membershipEvents.length ? manual.membershipEvents.map((eventRecord) => `
          <div class="mini-row">
            <strong>${escapeHtml(eventRecord.date || '')}</strong>
            <span>${escapeHtml(eventRecord.courseName || '')}</span>
            <span>${escapeHtml(eventRecord.action || '')} ${escapeHtml(eventRecord.sessionNo ? `第 ${eventRecord.sessionNo} 堂` : '')}</span>
          </div>
        `).join('') : '<p class="empty">尚無進退班異動</p>'}
      </div>
    </section>
  `;
}

function renderStudentCenter() {
  const snapshot = state.importSnapshot;
  if (!snapshot) {
    selectedStudentId = null;
    elements.studentDashboardSummary.innerHTML = '<div class="record-item"><p>尚未載入匯入快照</p></div>';
    elements.studentCenterRows.innerHTML = emptyRow(8);
    elements.studentDetail.innerHTML = '<p class="empty">選一位學生查看課程、學費與異動紀錄</p>';
    syncStudentSelectOptions();
    syncStudentFilters();
    return;
  }

  syncStudentSelectOptions();
  syncStudentFilters();

  const { nameCounts, studentsById, tuitionByStudent } = buildStudentIndexes();
  const students = getStudents();
  const duplicateRows = students.filter((student) => nameCounts.get(studentName(student)) > 1).length;
  const paymentCounts = students.reduce((counts, student) => {
    const stateKey = paymentState(tuitionByStudent.get(student.id) || []).key;
    counts[stateKey] = (counts[stateKey] || 0) + 1;
    return counts;
  }, {});

  const filteredStudents = students.filter((student) => {
    const tuitionEntries = tuitionByStudent.get(student.id) || [];
    return studentMatchesFilters(student, tuitionEntries, nameCounts);
  });

  if (selectedStudentId && !studentsById.has(selectedStudentId)) selectedStudentId = null;

  elements.studentDashboardSummary.innerHTML = [
    summaryCell('學生總筆數', students.length),
    summaryCell('目前篩選', filteredStudents.length),
    summaryCell('有繳費日期', paymentCounts.paid || 0),
    summaryCell('有學費未見繳費日期', paymentCounts.tuition_no_payment || 0),
    summaryCell('同名風險列', duplicateRows),
    summaryCell('有退費欄位', paymentCounts.refund || 0)
  ].join('');

  const visibleStudents = filteredStudents.slice(0, 220);
  elements.studentCenterRows.innerHTML = visibleStudents.length
    ? visibleStudents.map((student) => {
      const tuitionEntries = tuitionByStudent.get(student.id) || [];
      const duplicateCount = nameCounts.get(studentName(student)) || 0;
      const payment = paymentState(tuitionEntries);
      return `
        <tr class="${selectedStudentId === student.id ? 'is-selected' : ''}">
          <td>
            <strong>${escapeHtml(studentName(student) || '未命名')}</strong>
            ${duplicateCount > 1 ? '<span class="risk inline-risk">同名</span>' : ''}
          </td>
          <td>${escapeHtml(student.sheet)}</td>
          <td class="money">${escapeHtml(student.row)}</td>
          <td>${escapeHtml(studentSchool(student))}</td>
          <td class="money">${formatMoney((student.selectedCourses || []).length)}</td>
          <td class="money">${formatMoney(tuitionEntries.length)}</td>
          <td>${escapeHtml(payment.label)}</td>
          <td><button class="ghost small" type="button" data-view-student="${escapeHtml(student.id)}">查看</button></td>
        </tr>
      `;
    }).join('')
    : emptyRow(8);

  if (filteredStudents.length > visibleStudents.length) {
    elements.studentCenterRows.insertAdjacentHTML('beforeend', `
      <tr><td colspan="8" class="empty">另有 ${formatMoney(filteredStudents.length - visibleStudents.length)} 筆，請縮小篩選條件。</td></tr>
    `);
  }

  const selectedStudent = selectedStudentId ? studentsById.get(selectedStudentId) : null;
  renderStudentDetail(
    selectedStudent,
    selectedStudent ? (tuitionByStudent.get(selectedStudent.id) || []) : [],
    selectedStudent ? (nameCounts.get(studentName(selectedStudent)) || 0) : 0
  );
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
    elements.importPayrollRows.innerHTML = emptyRow(5);
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

  const payrollQuery = elements.importPayrollSearch.value.trim().toLowerCase();
  const payrollDetailRows = payrollBlocks.flatMap((block) => (block.rows || []).map((row) => {
    const values = (row.cells || []).map((cell) => `${cell.column}:${cell.value}`).join(' / ');
    const summaryText = (row.cells || []).map((cell) => cell.value).filter(Boolean).slice(0, 4).join(' / ');
    return {
      sheet: block.sheet,
      title: block.title,
      row: row.row,
      summary: summaryText,
      values,
      searchText: [block.sheet, block.title, row.row, summaryText, values].filter(Boolean).join(' ').toLowerCase()
    };
  })).filter((row) => !payrollQuery || row.searchText.includes(payrollQuery));

  elements.importPayrollRows.innerHTML = payrollDetailRows.length
    ? payrollDetailRows.slice(0, 160).map((row) => `
      <tr>
        <td>${escapeHtml(row.sheet)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td class="money">${escapeHtml(row.row)}</td>
        <td>${escapeHtml(row.summary)}</td>
        <td>${escapeHtml(row.values)}</td>
      </tr>
    `).join('')
    : emptyRow(5);

  if (payrollDetailRows.length > 160) {
    elements.importPayrollRows.insertAdjacentHTML('beforeend', `
      <tr><td colspan="5" class="empty">另有 ${formatMoney(payrollDetailRows.length - 160)} 筆，請縮小薪資搜尋條件。</td></tr>
    `);
  }

  const tuitionByStudent = new Map();
  for (const entry of snapshot.tuitionEntries || []) {
    const entries = tuitionByStudent.get(entry.studentId) || [];
    entries.push(entry);
    tuitionByStudent.set(entry.studentId, entries);
  }

  const query = elements.importStudentSearch.value.trim().toLowerCase();
  const students = (snapshot.students || []).filter((student) => {
    if (!query) return true;
    return studentSearchText(student, tuitionByStudent.get(student.id) || []).includes(query);
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
          <td class="money">${formatMoney((tuitionByStudent.get(student.id) || []).length)}</td>
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
  renderStudentCenter();
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

function fillStudentIntoForms(studentId) {
  const student = buildStudentIndexes().studentsById.get(studentId);
  if (!student) return;
  const name = studentName(student);
  const school = studentSchool(student);
  const cohort = inferCohort(student);
  const courseIds = new Set(inferCourseIds(student));
  elements.tuitionStudentId.value = student.id;
  elements.eventStudentId.value = student.id;
  elements.tuitionForm.elements.studentName.value = name;
  elements.eventForm.elements.studentName.value = name;
  elements.tuitionForm.elements.school.value = school;
  if (cohort) elements.tuitionForm.elements.cohort.value = cohort;
  elements.tuitionForm.querySelectorAll('input[name="courses"]').forEach((input) => {
    input.checked = courseIds.has(input.value);
  });
  renderAllocationPreview();
}

elements.tuitionStudentId.addEventListener('change', () => {
  if (elements.tuitionStudentId.value) fillStudentIntoForms(elements.tuitionStudentId.value);
});

elements.eventStudentId.addEventListener('change', () => {
  if (elements.eventStudentId.value) fillStudentIntoForms(elements.eventStudentId.value);
});

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
elements.importPayrollSearch.addEventListener('input', renderImport);

[
  elements.studentKeyword,
  elements.studentSheetFilter,
  elements.studentCourseFilter,
  elements.studentPaymentFilter,
  elements.studentDuplicateOnly
].forEach((element) => {
  element.addEventListener('input', renderStudentCenter);
  element.addEventListener('change', renderStudentCenter);
});

elements.studentCenterRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-view-student]');
  if (!button) return;
  selectedStudentId = button.dataset.viewStudent;
  renderStudentCenter();
});

elements.studentDetail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-fill-student]');
  if (!button) return;
  fillStudentIntoForms(button.dataset.fillStudent);
  setActiveTab('tuition');
  renderAllocationPreview();
});

document.querySelector('#exportStudentFilterCsv').addEventListener('click', () => {
  if (!state.importSnapshot) return;
  const { nameCounts, tuitionByStudent } = buildStudentIndexes();
  const rows = [[
    '學生ID',
    '學生',
    '分頁',
    '列',
    '學校',
    '課程',
    '學費欄位數',
    '繳費狀態',
    '同名筆數'
  ]];

  for (const student of getStudents()) {
    const tuitionEntries = tuitionByStudent.get(student.id) || [];
    if (!studentMatchesFilters(student, tuitionEntries, nameCounts)) continue;
    rows.push([
      student.id,
      studentName(student),
      student.sheet,
      student.row,
      studentSchool(student),
      (student.selectedCourses || []).map(courseLabel).join(' / '),
      tuitionEntries.length,
      paymentState(tuitionEntries).label,
      nameCounts.get(studentName(student)) || 0
    ]);
  }

  downloadFile('bearhigh-filtered-students.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

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

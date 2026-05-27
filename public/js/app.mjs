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
import {
  effectiveSessionsForEvents,
  parseCourseSessionDates,
  sessionDatesToText,
  validateSessionDatePlan
} from './sessions.mjs';

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
let payrollPreview = null;
let sessionPlanEditorKey = '';

state.tuitionPayments ||= [];
state.membershipEvents ||= [];
state.payrollRuns ||= [];
state.studentProfiles ||= {};
state.studentNotes ||= [];
state.courseSessionPlans ||= {};
state.importSnapshot ||= null;

const elements = {
  appShell: document.querySelector('#appShell'),
  loginGate: document.querySelector('#loginGate'),
  loginGateSignIn: document.querySelector('#loginGateSignIn'),
  loginGateStatus: document.querySelector('#loginGateStatus'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.panel'),
  tuitionForm: document.querySelector('#tuitionForm'),
  eventForm: document.querySelector('#eventForm'),
  payrollForm: document.querySelector('#payrollForm'),
  payrollCalcAdjustment: document.querySelector('#payrollCalcAdjustment'),
  payrollCalcFixedRate: document.querySelector('#payrollCalcFixedRate'),
  payrollCalcMonth: document.querySelector('#payrollCalcMonth'),
  payrollCalcNote: document.querySelector('#payrollCalcNote'),
  payrollCalcSessions: document.querySelector('#payrollCalcSessions'),
  payrollCalcShare: document.querySelector('#payrollCalcShare'),
  payrollCalcTeacher: document.querySelector('#payrollCalcTeacher'),
  payrollPreviewRows: document.querySelector('#payrollPreviewRows'),
  payrollPreviewSummary: document.querySelector('#payrollPreviewSummary'),
  payrollRosterBlock: document.querySelector('#payrollRosterBlock'),
  payrollSessionDates: document.querySelector('#payrollSessionDates'),
  payrollSessionSummary: document.querySelector('#payrollSessionSummary'),
  previewPayrollRun: document.querySelector('#previewPayrollRun'),
  savePayrollSessionPlan: document.querySelector('#savePayrollSessionPlan'),
  savePayrollPreview: document.querySelector('#savePayrollPreview'),
  exportPayrollPreviewCsv: document.querySelector('#exportPayrollPreviewCsv'),
  exportPayrollPreviewXls: document.querySelector('#exportPayrollPreviewXls'),
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
  classRosterRows: document.querySelector('#classRosterRows'),
  classRosterSummary: document.querySelector('#classRosterSummary'),
  rosterMonth: document.querySelector('#rosterMonth'),
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
    studentProfiles: state.studentProfiles,
    studentNotes: state.studentNotes,
    courseSessionPlans: state.courseSessionPlans,
    importSnapshot: null
  };
  localStorage.setItem(storageKey, JSON.stringify(persistedState));
  const draftCount = state.tuitionPayments.length + state.membershipEvents.length + state.payrollRuns.length + state.studentNotes.length + Object.keys(state.courseSessionPlans).length;
  elements.storageStatus.textContent = `本機草稿 ${draftCount} 筆`;
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

function safeFirebaseKey(value) {
  return String(value || '').replace(/[.#$\/\[\]\u0000-\u001f\u007f]/g, '-');
}

function parseNumber(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
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

function studentProfileOverride(studentId) {
  return state.studentProfiles[studentId] || {};
}

function studentStatusLabel(studentId) {
  const status = studentProfileOverride(studentId).status || 'active';
  return {
    active: '在讀',
    watching: '觀望',
    paused: '暫停',
    withdrawn: '已退班',
    graduated: '畢業'
  }[status] || status;
}

function studentCourseLabelForKey(key) {
  for (const student of getStudents()) {
    for (const course of student.selectedCourses || []) {
      if (courseKey(course) === key) return courseLabel(course);
    }
  }
  return '';
}

function eventMatchesCourse(event, courseKeyValue) {
  if (!courseKeyValue) return true;
  const label = studentCourseLabelForKey(courseKeyValue);
  const [, header] = courseKeyValue.split('|');
  const eventCourse = String(event.courseName || '');
  return Boolean(
    eventCourse &&
    ((label && label.includes(eventCourse)) ||
      (label && eventCourse.includes(label)) ||
      (header && eventCourse.includes(header)))
  );
}

function eventMatchesCourseName(event, courseName) {
  const eventCourse = String(event.courseName || '').replace(/\s+/g, '');
  const target = String(courseName || '').replace(/\s+/g, '');
  if (!eventCourse || !target) return false;
  return eventCourse.includes(target) || target.includes(eventCourse);
}

function studentMatchesCourseName(student, courseName) {
  const target = String(courseName || '').replace(/\s+/g, '');
  if (!target) return false;
  return (student.selectedCourses || []).some((course) => {
    const label = courseLabel(course).replace(/\s+/g, '');
    const header = String(course.header || '').replace(/\s+/g, '');
    return (label && (label.includes(target) || target.includes(label))) ||
      (header && (header.includes(target) || target.includes(header)));
  });
}

function payrollStudentCandidates(studentNameValue, courseName) {
  const sameNameStudents = getStudents().filter((student) => studentName(student) === studentNameValue);
  const sameCourseStudents = sameNameStudents.filter((student) => studentMatchesCourseName(student, courseName));
  return sameCourseStudents.length ? sameCourseStudents : sameNameStudents;
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
    )),
    notes: state.studentNotes.filter((note) => (
      note.studentId === student.id || (!note.studentId && note.studentName === name)
    )),
    profile: studentProfileOverride(student.id)
  };
}

function renderTimelineItem(item) {
  return `
    <div class="timeline-item">
      <strong>${escapeHtml(item.date || '未填日期')}</strong>
      <span>${escapeHtml(item.type)}</span>
      <p>${escapeHtml(item.text)}</p>
    </div>
  `;
}

function buildStudentTimeline(student, manual) {
  const items = [];
  for (const payment of manual.tuitionPayments) {
    items.push({
      date: payment.createdAt?.slice(0, 10) || '',
      type: '學費',
      text: `${(payment.courseNames || []).join('、')}，實收 $${formatMoney(payment.allocation?.totals?.paid || 0)}`
    });
  }
  for (const event of manual.membershipEvents) {
    items.push({
      date: event.date || '',
      type: '異動',
      text: `${event.courseName || ''} ${event.action || ''}${event.sessionNo ? `，第 ${event.sessionNo} 堂` : ''}${event.note ? `；${event.note}` : ''}`
    });
  }
  for (const note of manual.notes) {
    items.push({
      date: note.createdAt?.slice(0, 10) || '',
      type: note.kind || '備註',
      text: note.note || ''
    });
  }
  if (manual.profile.followUpDate) {
    items.push({
      date: manual.profile.followUpDate,
      type: '追蹤',
      text: `${studentStatusLabel(student.id)}${manual.profile.owner ? `；負責 ${manual.profile.owner}` : ''}${manual.profile.note ? `；${manual.profile.note}` : ''}`
    });
  }
  return items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
  const profile = student.profile || {};
  const profileOverride = manual.profile;
  const courses = student.selectedCourses || [];
  const payment = paymentState(tuitionEntries);
  const visibleTuitionEntries = tuitionEntries.slice(0, 40);
  const timeline = buildStudentTimeline(student, manual).slice(0, 30);

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
      <span>${escapeHtml(studentStatusLabel(student.id))}</span>
      ${duplicateCount > 1 ? `<span class="risk">同名 ${duplicateCount} 筆，請用分頁與列號確認</span>` : ''}
    </div>

    <section class="detail-section">
      <h3>基本資料</h3>
      <div class="profile-grid">
        <div><span>年級</span><strong>${escapeHtml(profile.grade || '')}</strong></div>
        <div><span>國中</span><strong>${escapeHtml(profile.juniorHigh || '')}</strong></div>
        <div><span>高中</span><strong>${escapeHtml(profile.highSchool || '')}</strong></div>
        <div><span>會考</span><strong>${escapeHtml(profile.examScore || '')}</strong></div>
        <div><span>母手機</span><strong>${escapeHtml(profile.motherPhone || '')}</strong></div>
        <div><span>父手機</span><strong>${escapeHtml(profile.fatherPhone || '')}</strong></div>
      </div>
    </section>

    <section class="detail-section">
      <h3>CRM 狀態</h3>
      <div class="detail-form">
        <label>
          <span>狀態</span>
          <select class="student-profile-status">
            <option value="active" ${profileOverride.status === 'active' || !profileOverride.status ? 'selected' : ''}>在讀</option>
            <option value="watching" ${profileOverride.status === 'watching' ? 'selected' : ''}>觀望</option>
            <option value="paused" ${profileOverride.status === 'paused' ? 'selected' : ''}>暫停</option>
            <option value="withdrawn" ${profileOverride.status === 'withdrawn' ? 'selected' : ''}>已退班</option>
            <option value="graduated" ${profileOverride.status === 'graduated' ? 'selected' : ''}>畢業</option>
          </select>
        </label>
        <label>
          <span>下次追蹤</span>
          <input class="student-profile-followup" type="date" value="${escapeHtml(profileOverride.followUpDate || '')}">
        </label>
        <label>
          <span>負責人</span>
          <input class="student-profile-owner" autocomplete="off" value="${escapeHtml(profileOverride.owner || '')}">
        </label>
        <label class="wide">
          <span>檔案備註</span>
          <textarea class="student-profile-note" rows="2">${escapeHtml(profileOverride.note || '')}</textarea>
        </label>
        <button class="primary" type="button" data-save-student-profile="${escapeHtml(student.id)}">儲存學生檔案</button>
      </div>
    </section>

    <section class="detail-section">
      <h3>新增追蹤備註</h3>
      <div class="detail-form">
        <label>
          <span>類型</span>
          <select class="student-note-kind">
            <option value="備註">備註</option>
            <option value="電話">電話</option>
            <option value="收款">收款</option>
            <option value="追蹤">追蹤</option>
          </select>
        </label>
        <label class="wide">
          <span>內容</span>
          <textarea class="student-note-text" rows="2"></textarea>
        </label>
        <button class="ghost" type="button" data-add-student-note="${escapeHtml(student.id)}">新增備註</button>
      </div>
    </section>

    <section class="detail-section">
      <h3>時間軸</h3>
      <div class="timeline-list">
        ${timeline.length ? timeline.map(renderTimelineItem).join('') : '<p class="empty">尚無手動紀錄</p>'}
      </div>
    </section>

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

function rosterRowsForCurrentCourse() {
  const course = elements.studentCourseFilter.value;
  if (!state.importSnapshot || !course) return [];
  const { tuitionByStudent } = buildStudentIndexes();
  return getStudents()
    .filter((student) => (student.selectedCourses || []).some((studentCourse) => courseKey(studentCourse) === course))
    .map((student) => ({
      student,
      tuitionEntries: tuitionByStudent.get(student.id) || []
    }));
}

function renderClassRoster() {
  if (!state.importSnapshot) {
    elements.classRosterSummary.textContent = '尚未載入匯入快照';
    elements.classRosterRows.innerHTML = emptyRow(5);
    return;
  }

  const course = elements.studentCourseFilter.value;
  if (!course) {
    elements.classRosterSummary.textContent = '選擇班級 / 課程後查看名單';
    elements.classRosterRows.innerHTML = emptyRow(5);
    return;
  }

  const month = elements.rosterMonth.value;
  const rows = rosterRowsForCurrentCourse();
  const courseName = studentCourseLabelForKey(course);
  const monthEvents = state.membershipEvents.filter((event) => (
    (!month || String(event.date || '').startsWith(month)) && eventMatchesCourse(event, course)
  ));

  elements.classRosterSummary.textContent = `${courseName || '目前課程'}：${formatMoney(rows.length)} 人${month ? `，${month} 異動 ${formatMoney(monthEvents.length)} 筆` : ''}`;
  elements.classRosterRows.innerHTML = rows.length
    ? rows.slice(0, 260).map(({ student, tuitionEntries }) => {
      const name = studentName(student);
      const studentEvents = monthEvents.filter((event) => event.studentId === student.id || (!event.studentId && event.studentName === name));
      return `
        <tr>
          <td><strong>${escapeHtml(name || '未命名')}</strong></td>
          <td>${escapeHtml(student.sheet)} · 列 ${escapeHtml(student.row)}</td>
          <td>${escapeHtml(studentSchool(student))}</td>
          <td>${escapeHtml(paymentState(tuitionEntries).label)}</td>
          <td>${studentEvents.length ? studentEvents.map((event) => `${escapeHtml(event.date || '')} ${escapeHtml(event.action || '')}${event.sessionNo ? ` 第 ${escapeHtml(event.sessionNo)} 堂` : ''}`).join('<br>') : '<span class="muted">無</span>'}</td>
        </tr>
      `;
    }).join('')
    : emptyRow(5);
}

function getTeacherRosterBlocks() {
  return (state.importSnapshot?.teacherSheets || []).flatMap((sheet) => (
    (sheet.rosterBlocks || []).map((block, index) => ({
      ...block,
      key: `${sheet.summary?.sheet || block.sheet}::${block.title}::${block.startColumn || index}`,
      teacherSheet: sheet.summary?.sheet || block.sheet
    }))
  ));
}

function syncPayrollRosterOptions() {
  const selected = elements.payrollRosterBlock.value;
  const blocks = getTeacherRosterBlocks();
  const placeholder = blocks.length
    ? '請選擇老師名單區塊'
    : (currentUser ? '雲端資料尚無老師名單區塊' : '請先登入並載入雲端資料');
  elements.payrollRosterBlock.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + blocks
    .map((block) => `<option value="${escapeHtml(block.key)}">${escapeHtml(block.teacherSheet)}｜${escapeHtml(block.title)}｜${formatMoney(block.rowCount)} 人</option>`)
    .join('');
  elements.payrollRosterBlock.value = blocks.some((block) => block.key === selected) ? selected : '';
  elements.payrollRosterBlock.disabled = blocks.length === 0;
}

function selectedPayrollRosterBlock() {
  const key = elements.payrollRosterBlock.value;
  return getTeacherRosterBlocks().find((block) => block.key === key) || null;
}

function payrollSessionPlanKey(rosterKey, month) {
  if (!rosterKey || !month) return '';
  return `${month}::${rosterKey}`;
}

function selectedPayrollSessionPlanKey() {
  return payrollSessionPlanKey(elements.payrollRosterBlock.value, elements.payrollCalcMonth.value);
}

function currentPayrollSessionRows() {
  return parseCourseSessionDates(elements.payrollSessionDates.value);
}

function payrollSessionPlanErrors() {
  return validateSessionDatePlan(currentPayrollSessionRows(), elements.payrollCalcSessions.value);
}

function updatePayrollSessionSummary() {
  const key = selectedPayrollSessionPlanKey();
  const sessions = currentPayrollSessionRows();
  const expectedSessions = Math.max(0, Math.round(parseNumber(elements.payrollCalcSessions.value)));
  const errors = payrollSessionPlanErrors();
  const hasBlockingSessionPlanError = sessions.length > 0 && errors.length > 0;
  elements.savePayrollSessionPlan.disabled = !key || sessions.length === 0 || hasBlockingSessionPlanError;
  elements.previewPayrollRun.disabled = !selectedPayrollRosterBlock() || hasBlockingSessionPlanError;
  if (!key) {
    elements.payrollSessionSummary.textContent = getTeacherRosterBlocks().length
      ? '選擇老師名單區塊與月份後，可儲存本月堂次日期。'
      : '尚未載入老師名單區塊，請先登入並載入雲端資料。';
    return;
  }
  if (!sessions.length) {
    elements.payrollSessionSummary.textContent = '尚未設定堂次日期；異動仍可用手填第幾堂計算。';
    return;
  }
  const firstDate = sessions[0]?.date || '';
  const lastDate = sessions[sessions.length - 1]?.date || '';
  if (errors.length) {
    elements.payrollSessionSummary.textContent = errors.join(' ');
    return;
  }
  const countWarning = expectedSessions && sessions.length !== expectedSessions ? `，與本月堂數 ${expectedSessions} 不同` : '';
  elements.payrollSessionSummary.textContent = `已輸入 ${formatMoney(sessions.length)} 堂：${firstDate} 到 ${lastDate}${countWarning}`;
}

function syncPayrollSessionPlanEditor(force = false) {
  const key = selectedPayrollSessionPlanKey();
  if (!force && key === sessionPlanEditorKey) {
    updatePayrollSessionSummary();
    return;
  }
  sessionPlanEditorKey = key;
  const plan = key ? state.courseSessionPlans[key] : null;
  elements.payrollSessionDates.value = plan ? sessionDatesToText(plan.sessions || []) : '';
  updatePayrollSessionSummary();
}

function payrollEventsForStudent(studentNameValue, courseName, month, studentId = '') {
  return state.membershipEvents
    .filter((event) => {
      const sameStudent = studentId
        ? event.studentId === studentId || (!event.studentId && event.studentName === studentNameValue)
        : event.studentName === studentNameValue && !event.studentId;
      const sameMonth = !month || String(event.date || '').startsWith(month);
      return sameStudent && sameMonth && eventMatchesCourseName(event, courseName);
    })
    .sort((a, b) => `${a.date}-${a.sessionNo}`.localeCompare(`${b.date}-${b.sessionNo}`));
}

function payrollEventsForStudentName(studentNameValue, courseName, month) {
  return state.membershipEvents
    .filter((event) => {
      const sameStudent = event.studentName === studentNameValue;
      const sameMonth = !month || String(event.date || '').startsWith(month);
      return sameStudent && sameMonth && eventMatchesCourseName(event, courseName);
    })
    .sort((a, b) => `${a.date}-${a.sessionNo}`.localeCompare(`${b.date}-${b.sessionNo}`));
}

function buildPayrollPreview() {
  const block = selectedPayrollRosterBlock();
  if (!block) return null;

  const month = elements.payrollCalcMonth.value;
  const sessionCount = Math.max(0, Math.round(parseNumber(elements.payrollCalcSessions.value)));
  const sessionRows = currentPayrollSessionRows();
  const sessionErrors = payrollSessionPlanErrors();
  if (sessionRows.length && sessionErrors.length) return null;
  const sharePercent = Math.max(0, parseNumber(elements.payrollCalcShare.value));
  const fixedRate = Math.max(0, parseNumber(elements.payrollCalcFixedRate.value));
  const adjustment = parseNumber(elements.payrollCalcAdjustment.value);
  const courseName = block.title || '';
  const rows = (block.rows || []).map((row) => {
    const fields = row.fields || {};
    const name = fields['姓名'] || '';
    const singleRevenue = parseNumber(fields['單堂']);
    const candidates = payrollStudentCandidates(name, courseName);
    const isAmbiguousStudent = candidates.length > 1;
    const studentId = candidates.length === 1 ? candidates[0].id : '';
    const rawEvents = isAmbiguousStudent
      ? payrollEventsForStudentName(name, courseName, month)
      : payrollEventsForStudent(name, courseName, month, studentId);
    const events = isAmbiguousStudent ? [] : rawEvents;
    const effective = effectiveSessionsForEvents(sessionCount, events, sessionRows);
    const riskNote = isAmbiguousStudent && rawEvents.length ? '同名風險，異動未自動套用' : '';
    const eventNote = [effective.note, riskNote].filter(Boolean).join('；');
    const revenue = Math.round(singleRevenue * effective.sessions);
    return {
      studentName: name,
      school: fields['學校'] || '',
      singleRevenue,
      sessionCount: effective.sessions,
      eventNote,
      revenue
    };
  }).filter((row) => row.studentName);

  const revenueTotal = rows.reduce((sum, row) => sum + row.revenue, 0);
  const teacherBase = fixedRate > 0 ? Math.round(fixedRate * sessionCount) : Math.round(revenueTotal * (sharePercent / 100));
  const total = teacherBase + adjustment;

  return {
    id: nowId('payroll_calc'),
    month,
    teacherName: elements.payrollCalcTeacher.value.trim() || block.teacherSheet,
    courseName,
    rosterKey: block.key,
    rosterSheet: block.teacherSheet,
    sessionCount,
    sessionDates: sessionRows,
    sharePercent,
    fixedRate,
    adjustment,
    revenueTotal,
    teacherBase,
    total,
    note: elements.payrollCalcNote.value.trim(),
    rows
  };
}

function renderPayrollPreview() {
  syncPayrollRosterOptions();
  syncPayrollSessionPlanEditor();
  if (!payrollPreview) {
    elements.payrollPreviewSummary.innerHTML = '<div class="record-item"><p>尚未產生薪資試算</p></div>';
    elements.payrollPreviewRows.innerHTML = emptyRow(6);
    elements.savePayrollPreview.disabled = true;
    elements.exportPayrollPreviewCsv.disabled = true;
    elements.exportPayrollPreviewXls.disabled = true;
    return;
  }

  elements.payrollPreviewSummary.innerHTML = [
    summaryCell('學生人數', payrollPreview.rows.length),
    summaryCell('本月堂數', payrollPreview.sessionCount),
    summaryCell('學生收入合計', payrollPreview.revenueTotal),
    summaryCell('老師基礎薪資', payrollPreview.teacherBase),
    summaryCell('調整', payrollPreview.adjustment),
    summaryCell('老師小計', payrollPreview.total)
  ].join('');

  elements.payrollPreviewRows.innerHTML = payrollPreview.rows.length
    ? payrollPreview.rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.studentName)}</td>
        <td>${escapeHtml(row.school)}</td>
        <td class="money">${formatMoney(row.singleRevenue)}</td>
        <td class="money">${formatMoney(row.sessionCount)}</td>
        <td>${escapeHtml(row.eventNote || '無')}</td>
        <td class="money">${formatMoney(row.revenue)}</td>
      </tr>
    `).join('')
    : emptyRow(6);

  elements.savePayrollPreview.disabled = false;
  elements.exportPayrollPreviewCsv.disabled = false;
  elements.exportPayrollPreviewXls.disabled = false;
}

function payrollMethodLabel(preview) {
  if (preview.fixedRate > 0) return `固定鐘點 $${formatMoney(preview.fixedRate)} / 堂`;
  return `分潤 ${formatMoney(preview.sharePercent)}%`;
}

function buildPayrollXls(preview) {
  const generatedAt = new Date().toLocaleString('zh-TW', { hour12: false });
  const sessionDateText = (preview.sessionDates || [])
    .map((session) => `第 ${session.sessionNo} 堂 ${session.date}`)
    .join(' / ');
  const detailRows = preview.rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.studentName)}</td>
      <td>${escapeHtml(row.school)}</td>
      <td class="money">${formatMoney(row.singleRevenue)}</td>
      <td class="money">${formatMoney(row.sessionCount)}</td>
      <td>${escapeHtml(row.eventNote || '')}</td>
      <td class="money">${formatMoney(row.revenue)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft JhengHei", Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
    th { background: #e9f2ec; font-weight: 700; }
    .title { font-size: 20px; font-weight: 700; text-align: center; }
    .meta th { width: 140px; }
    .money { text-align: right; mso-number-format: "#,##0"; }
    .sign td { height: 48px; }
  </style>
</head>
<body>
  <table>
    <tr><td class="title" colspan="7">山熊升大老師薪資表</td></tr>
    <tr><td colspan="7"></td></tr>
    <tr class="meta"><th>月份</th><td>${escapeHtml(preview.month || '')}</td><th>老師</th><td>${escapeHtml(preview.teacherName)}</td><th>班級 / 課程</th><td colspan="2">${escapeHtml(preview.courseName)}</td></tr>
    <tr class="meta"><th>計算方式</th><td>${escapeHtml(payrollMethodLabel(preview))}</td><th>本月堂數</th><td class="money">${formatMoney(preview.sessionCount)}</td><th>名單來源</th><td colspan="2">${escapeHtml(preview.rosterSheet || '')}</td></tr>
    <tr class="meta"><th>堂次日期</th><td colspan="6">${escapeHtml(sessionDateText || '未設定')}</td></tr>
    <tr class="meta"><th>學生收入合計</th><td class="money">${formatMoney(preview.revenueTotal)}</td><th>老師基礎薪資</th><td class="money">${formatMoney(preview.teacherBase)}</td><th>調整</th><td class="money">${formatMoney(preview.adjustment)}</td><td></td></tr>
    <tr class="meta"><th>老師小計</th><td class="money">${formatMoney(preview.total)}</td><th>備註</th><td colspan="4">${escapeHtml(preview.note || '')}</td></tr>
    <tr><td colspan="7">產生時間：${escapeHtml(generatedAt)}</td></tr>
    <tr><td colspan="7"></td></tr>
    <tr>
      <th>#</th>
      <th>學生</th>
      <th>學校</th>
      <th>單堂收入</th>
      <th>有效堂數</th>
      <th>異動</th>
      <th>收入小計</th>
    </tr>
    ${detailRows}
    <tr><th colspan="6">收入合計</th><td class="money">${formatMoney(preview.revenueTotal)}</td></tr>
    <tr><th colspan="6">老師小計</th><td class="money">${formatMoney(preview.total)}</td></tr>
    <tr><td colspan="7"></td></tr>
    <tr class="sign"><th>製表</th><td colspan="2"></td><th>覆核</th><td></td><th>老師確認</th><td></td></tr>
  </table>
</body>
</html>`;
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
  elements.loginGate.hidden = !!user;
  elements.appShell.hidden = !user;
  elements.loginGateStatus.textContent = email || '尚未登入';
  elements.authStatus.textContent = email || '尚未登入';
  elements.signInGoogle.hidden = !!user;
  elements.signOutGoogle.hidden = !user;
  elements.loadCloudImport.disabled = !user;
  setCloudStatus(user ? '雲端已連線' : '雲端未連線');
}

async function loadCloudImportSnapshot({ afterLoadTab = 'import' } = {}) {
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
  await loadCloudManualRecords();
  renderAll();
  if (afterLoadTab) setActiveTab(afterLoadTab);
  setCloudStatus(`已載入 ${batchId}`);
}

function mergeRecordsById(localRows, remoteRows) {
  const rowsById = new Map();
  for (const row of localRows || []) {
    if (row?.id) rowsById.set(row.id, row);
  }
  for (const row of remoteRows || []) {
    if (row?.id) rowsById.set(row.id, row);
  }
  return Array.from(rowsById.values());
}

async function loadCloudManualRecords() {
  if (!currentUser) return;
  const snapshot = await get(accountingRef('manual'));
  const manual = snapshot.val() || {};
  state.tuitionPayments = mergeRecordsById(state.tuitionPayments, Object.values(manual.tuitionPayments || {}));
  state.membershipEvents = mergeRecordsById(state.membershipEvents, Object.values(manual.membershipEvents || {}));
  state.payrollRuns = mergeRecordsById(state.payrollRuns, Object.values(manual.payrollRuns || {}));
  state.studentNotes = mergeRecordsById(state.studentNotes, Object.values(manual.studentNotes || {}));
  const remoteSessionPlans = {};
  for (const plan of Object.values(manual.courseSessionPlans || {})) {
    if (plan?.id) remoteSessionPlans[plan.id] = plan;
  }
  state.courseSessionPlans = {
    ...state.courseSessionPlans,
    ...remoteSessionPlans
  };

  const remoteProfiles = {};
  for (const profile of Object.values(manual.studentProfiles || {})) {
    if (profile?.studentId) remoteProfiles[profile.studentId] = profile;
  }
  state.studentProfiles = {
    ...state.studentProfiles,
    ...remoteProfiles
  };
}

async function saveCloudRecord(kind, record, key = record.id) {
  if (!currentUser) return;
  const payload = {
    ...record,
    syncedAt: new Date().toISOString(),
    syncedBy: currentUser.email || currentUser.uid
  };
  await set(accountingRef(`manual/${kind}/${safeFirebaseKey(key)}`), payload);
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
        <td class="money">${escapeHtml(row.source === 'roster_preview' && !row.fixedRate ? `分潤 ${row.sharePercent}%` : formatMoney(row.rate))}</td>
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
  renderPayrollPreview();
  renderRecords();
  renderStudentCenter();
  renderClassRoster();
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

function filenameSafe(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '')
    .slice(0, 60) || 'export';
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

elements.payrollSessionDates.addEventListener('input', () => {
  updatePayrollSessionSummary();
  if (!payrollPreview) return;
  payrollPreview = buildPayrollPreview();
  renderPayrollPreview();
});

elements.savePayrollSessionPlan.addEventListener('click', async () => {
  const block = selectedPayrollRosterBlock();
  const key = selectedPayrollSessionPlanKey();
  const sessions = currentPayrollSessionRows();
  const errors = payrollSessionPlanErrors();
  if (!block || !key || !sessions.length || errors.length) {
    updatePayrollSessionSummary();
    return;
  }
  const record = {
    id: key,
    updatedAt: new Date().toISOString(),
    month: elements.payrollCalcMonth.value,
    rosterKey: block.key,
    rosterSheet: block.teacherSheet,
    courseName: block.title || '',
    teacherName: elements.payrollCalcTeacher.value.trim() || block.teacherSheet,
    sessions
  };
  state.courseSessionPlans[key] = record;
  updatePayrollSessionSummary();
  saveState();
  setCloudStatus('堂次日期已儲存於本機');
  try {
    await saveCloudRecord('courseSessionPlans', record, key);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.previewPayrollRun.addEventListener('click', () => {
  payrollPreview = buildPayrollPreview();
  renderPayrollPreview();
});

[
  elements.payrollCalcAdjustment,
  elements.payrollCalcFixedRate,
  elements.payrollCalcMonth,
  elements.payrollCalcSessions,
  elements.payrollCalcShare,
  elements.payrollCalcTeacher,
  elements.payrollRosterBlock
].forEach((element) => {
  element.addEventListener('change', () => {
    if (element === elements.payrollCalcMonth || element === elements.payrollRosterBlock) {
      syncPayrollSessionPlanEditor();
    } else {
      updatePayrollSessionSummary();
    }
    if (!payrollPreview) return;
    payrollPreview = buildPayrollPreview();
    renderPayrollPreview();
  });
});

elements.savePayrollPreview.addEventListener('click', async () => {
  if (!payrollPreview) return;
  const record = {
    ...payrollPreview,
    id: nowId('payroll'),
    createdAt: new Date().toISOString(),
    rate: payrollPreview.fixedRate || payrollPreview.sharePercent,
    source: 'roster_preview'
  };
  state.payrollRuns.push(record);
  renderAll();
  try {
    await saveCloudRecord('payrollRuns', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.exportPayrollPreviewCsv.addEventListener('click', () => {
  if (!payrollPreview) return;
  const rows = [
    ['月份', '老師', '班級/課程', '學生', '學校', '單堂收入', '有效堂數', '異動', '收入小計']
  ];
  for (const row of payrollPreview.rows) {
    rows.push([
      payrollPreview.month,
      payrollPreview.teacherName,
      payrollPreview.courseName,
      row.studentName,
      row.school,
      row.singleRevenue,
      row.sessionCount,
      row.eventNote,
      row.revenue
    ]);
  }
  rows.push([]);
  rows.push(['薪資小計', payrollPreview.total, '學生收入合計', payrollPreview.revenueTotal, '老師基礎薪資', payrollPreview.teacherBase, '調整', payrollPreview.adjustment]);
  downloadFile('bearhigh-payroll-preview.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

elements.exportPayrollPreviewXls.addEventListener('click', () => {
  if (!payrollPreview) return;
  const filename = [
    'bearhigh-payroll',
    filenameSafe(payrollPreview.month),
    filenameSafe(payrollPreview.teacherName),
    filenameSafe(payrollPreview.courseName)
  ].filter(Boolean).join('-');
  downloadFile(`${filename}.xls`, buildPayrollXls(payrollPreview), 'application/vnd.ms-excel;charset=utf-8');
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
  loadCloudImportSnapshot({ afterLoadTab: 'import' }).catch((error) => {
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
  element.addEventListener('change', () => {
    renderStudentCenter();
    renderClassRoster();
  });
});

elements.rosterMonth.value = new Date().toISOString().slice(0, 7);
elements.rosterMonth.addEventListener('change', renderClassRoster);

elements.studentCenterRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-view-student]');
  if (!button) return;
  selectedStudentId = button.dataset.viewStudent;
  renderStudentCenter();
});

elements.studentDetail.addEventListener('click', (event) => {
  const fillButton = event.target.closest('[data-fill-student]');
  if (fillButton) {
    fillStudentIntoForms(fillButton.dataset.fillStudent);
    setActiveTab('tuition');
    renderAllocationPreview();
    return;
  }

  const profileButton = event.target.closest('[data-save-student-profile]');
  if (profileButton) {
    const studentId = profileButton.dataset.saveStudentProfile;
    const record = {
      studentId,
      updatedAt: new Date().toISOString(),
      status: elements.studentDetail.querySelector('.student-profile-status')?.value || 'active',
      followUpDate: elements.studentDetail.querySelector('.student-profile-followup')?.value || '',
      owner: elements.studentDetail.querySelector('.student-profile-owner')?.value.trim() || '',
      note: elements.studentDetail.querySelector('.student-profile-note')?.value.trim() || ''
    };
    state.studentProfiles[studentId] = record;
    renderAll();
    saveCloudRecord('studentProfiles', record, studentId).catch((error) => {
      setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
    });
    return;
  }

  const noteButton = event.target.closest('[data-add-student-note]');
  if (noteButton) {
    const studentId = noteButton.dataset.addStudentNote;
    const student = buildStudentIndexes().studentsById.get(studentId);
    const note = elements.studentDetail.querySelector('.student-note-text')?.value.trim() || '';
    if (!student || !note) return;
    const record = {
      id: nowId('note'),
      studentId,
      studentName: studentName(student),
      kind: elements.studentDetail.querySelector('.student-note-kind')?.value || '備註',
      note,
      createdAt: new Date().toISOString()
    };
    state.studentNotes.push(record);
    renderAll();
    saveCloudRecord('studentNotes', record).catch((error) => {
      setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
    });
  }
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

document.querySelector('#exportClassRosterCsv').addEventListener('click', () => {
  const course = elements.studentCourseFilter.value;
  if (!course || !state.importSnapshot) return;
  const rows = [['課程', '學生ID', '學生', '分頁', '列', '學校', '繳費狀態', 'CRM狀態']];
  const courseName = studentCourseLabelForKey(course);
  for (const { student, tuitionEntries } of rosterRowsForCurrentCourse()) {
    rows.push([
      courseName,
      student.id,
      studentName(student),
      student.sheet,
      student.row,
      studentSchool(student),
      paymentState(tuitionEntries).label,
      studentStatusLabel(student.id)
    ]);
  }
  downloadFile('bearhigh-class-roster.csv', toCsv(rows), 'text/csv;charset=utf-8');
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
  state.studentNotes.splice(0);
  state.studentProfiles = {};
  state.courseSessionPlans = {};
  state.importSnapshot = null;
  payrollPreview = null;
  sessionPlanEditorKey = '';
  clearArmedUntil = 0;
  button.textContent = '清除本機草稿';
  renderAll();
});

function startGoogleSignIn() {
  setCloudStatus('前往 Google 登入');
  elements.loginGateStatus.textContent = '前往 Google 登入';
  signInWithRedirect(auth, googleProvider);
}

elements.signInGoogle.addEventListener('click', () => {
  startGoogleSignIn();
});

elements.loginGateSignIn.addEventListener('click', () => {
  startGoogleSignIn();
});

elements.signOutGoogle.addEventListener('click', async () => {
  await signOut(auth);
});

getRedirectResult(auth).catch((error) => {
  setCloudStatus(`登入失敗：${error.code || error.message}`);
  elements.loginGateStatus.textContent = `登入失敗：${error.code || error.message}`;
});

onAuthStateChanged(auth, (user) => {
  renderAuth(user);
  if (user) {
    loadCloudImportSnapshot({ afterLoadTab: 'payroll' }).catch((error) => {
      setCloudStatus(`雲端讀取失敗：${error.code || error.message}`);
    });
  }
});

renderOptions();
renderAll();

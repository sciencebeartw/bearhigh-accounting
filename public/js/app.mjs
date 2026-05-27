import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
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
state.manualStudents ||= [];
state.manualTerms ||= [];
state.manualTeachers ||= [];
state.manualCourses ||= [];
state.manualCourseEnrollments ||= [];
state.accountingAccounts ||= defaultAccountingAccounts();
state.receivables ||= [];
state.paymentLedger ||= [];
state.auditLogs ||= [];
state.importSnapshot ||= null;

function defaultAccountingAccounts() {
  return [
    { id: 'income_tuition', code: '4101', name: '學費收入', type: '收入', purpose: '學生學費、分科收入與已收款認列' },
    { id: 'discount_package', code: '4201', name: '合報優惠', type: '折扣', purpose: '兩科、三科合報造成的折扣' },
    { id: 'discount_voucher', code: '4202', name: '學費抵用券', type: '折扣', purpose: '抵用券、折抵與其他學費優惠' },
    { id: 'ar_tuition', code: '1101', name: '學費應收', type: '應收', purpose: '尚未收齊的學生學費' },
    { id: 'cash_on_hand', code: '1001', name: '現金', type: '現金', purpose: '現金收款' },
    { id: 'bank_main', code: '1002', name: '銀行帳戶', type: '銀行', purpose: '轉帳、匯款與主要銀行入帳' },
    { id: 'payroll_expense', code: '5101', name: '老師薪資費用', type: '薪資費用', purpose: '月底老師薪資與分潤成本' }
  ];
}

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
  payrollEventAction: document.querySelector('#payrollEventAction'),
  payrollEventDate: document.querySelector('#payrollEventDate'),
  payrollEventList: document.querySelector('#payrollEventList'),
  payrollEventNote: document.querySelector('#payrollEventNote'),
  payrollEventSessionNo: document.querySelector('#payrollEventSessionNo'),
  payrollEventStudent: document.querySelector('#payrollEventStudent'),
  payrollEventStudentOptions: document.querySelector('#payrollEventStudentOptions'),
  payrollPreviewRows: document.querySelector('#payrollPreviewRows'),
  payrollPreviewSummary: document.querySelector('#payrollPreviewSummary'),
  payrollRosterBlock: document.querySelector('#payrollRosterBlock'),
  payrollSessionDates: document.querySelector('#payrollSessionDates'),
  payrollSessionSummary: document.querySelector('#payrollSessionSummary'),
  previewPayrollRun: document.querySelector('#previewPayrollRun'),
  savePayrollEvent: document.querySelector('#savePayrollEvent'),
  savePayrollSessionPlan: document.querySelector('#savePayrollSessionPlan'),
  savePayrollPreview: document.querySelector('#savePayrollPreview'),
  exportPayrollPreviewCsv: document.querySelector('#exportPayrollPreviewCsv'),
  exportPayrollPreviewPrint: document.querySelector('#exportPayrollPreviewPrint'),
  exportPayrollPreviewXls: document.querySelector('#exportPayrollPreviewXls'),
  pricingVersion: document.querySelector('#pricingVersion'),
  packageId: document.querySelector('#packageId'),
  courseOptions: document.querySelector('#courseOptions'),
  allocationTotal: document.querySelector('#allocationTotal'),
  allocationWarnings: document.querySelector('#allocationWarnings'),
  allocationRows: document.querySelector('#allocationRows'),
  accountRows: document.querySelector('#accountRows'),
  accountingSummary: document.querySelector('#accountingSummary'),
  agingReport: document.querySelector('#agingReport'),
  auditLogRows: document.querySelector('#auditLogRows'),
  cashFlowReport: document.querySelector('#cashFlowReport'),
  eventRows: document.querySelector('#eventRows'),
  exportAccountingReportsCsv: document.querySelector('#exportAccountingReportsCsv'),
  exportPaymentLedgerCsv: document.querySelector('#exportPaymentLedgerCsv'),
  exportReceivablesCsv: document.querySelector('#exportReceivablesCsv'),
  incomeByMonthReport: document.querySelector('#incomeByMonthReport'),
  payrollRows: document.querySelector('#payrollRows'),
  paymentAssetAccount: document.querySelector('#paymentAssetAccount'),
  paymentLedgerForm: document.querySelector('#paymentLedgerForm'),
  paymentLedgerRows: document.querySelector('#paymentLedgerRows'),
  paymentReceivable: document.querySelector('#paymentReceivable'),
  profitLossReport: document.querySelector('#profitLossReport'),
  receivableRows: document.querySelector('#receivableRows'),
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
  courseOverviewRows: document.querySelector('#courseOverviewRows'),
  gradeOverviewRows: document.querySelector('#gradeOverviewRows'),
  manualCourseCohort: document.querySelector('#manualCourseCohort'),
  manualCourseForm: document.querySelector('#manualCourseForm'),
  manualCourseRows: document.querySelector('#manualCourseRows'),
  manualCourseSummary: document.querySelector('#manualCourseSummary'),
  manualEnrollmentCourse: document.querySelector('#manualEnrollmentCourse'),
  manualEnrollmentForm: document.querySelector('#manualEnrollmentForm'),
  manualEnrollmentStudent: document.querySelector('#manualEnrollmentStudent'),
  manualMasterRows: document.querySelector('#manualMasterRows'),
  manualStudentCohort: document.querySelector('#manualStudentCohort'),
  manualStudentForm: document.querySelector('#manualStudentForm'),
  manualTeacherForm: document.querySelector('#manualTeacherForm'),
  manualTeacherOptions: document.querySelector('#manualTeacherOptions'),
  manualTermForm: document.querySelector('#manualTermForm'),
  manualTermOptions: document.querySelector('#manualTermOptions'),
  studentMatrixHead: document.querySelector('#studentMatrixHead'),
  studentMatrixRows: document.querySelector('#studentMatrixRows'),
  studentMatrixSummary: document.querySelector('#studentMatrixSummary'),
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
      manualStudents: [],
      manualTerms: [],
      manualTeachers: [],
      manualCourses: [],
      manualCourseEnrollments: [],
      accountingAccounts: defaultAccountingAccounts(),
      receivables: [],
      paymentLedger: [],
      auditLogs: [],
      importSnapshot: null
    };
  } catch {
    return {
      tuitionPayments: [],
      membershipEvents: [],
      payrollRuns: [],
      manualStudents: [],
      manualTerms: [],
      manualTeachers: [],
      manualCourses: [],
      manualCourseEnrollments: [],
      accountingAccounts: defaultAccountingAccounts(),
      receivables: [],
      paymentLedger: [],
      auditLogs: [],
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
    manualStudents: state.manualStudents,
    manualTerms: state.manualTerms,
    manualTeachers: state.manualTeachers,
    manualCourses: state.manualCourses,
    manualCourseEnrollments: state.manualCourseEnrollments,
    accountingAccounts: state.accountingAccounts,
    receivables: state.receivables,
    paymentLedger: state.paymentLedger,
    auditLogs: state.auditLogs,
    importSnapshot: null
  };
  localStorage.setItem(storageKey, JSON.stringify(persistedState));
  const draftCount = state.tuitionPayments.length +
    state.membershipEvents.length +
    state.payrollRuns.length +
    state.studentNotes.length +
    state.manualStudents.length +
    state.manualTerms.length +
    state.manualTeachers.length +
    state.manualCourses.length +
    state.manualCourseEnrollments.length +
    state.receivables.length +
    state.paymentLedger.length +
    state.auditLogs.length +
    Object.keys(state.courseSessionPlans).length;
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

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonthIso() {
  return todayIso().slice(0, 7);
}

function accountById(id) {
  return (state.accountingAccounts || defaultAccountingAccounts()).find((account) => account.id === id) || null;
}

function accountName(id) {
  return accountById(id)?.name || id || '';
}

function normalizeAccountingAccounts() {
  const existing = new Map((state.accountingAccounts || []).filter((account) => account?.id).map((account) => [account.id, account]));
  state.accountingAccounts = defaultAccountingAccounts().map((account) => ({
    ...account,
    ...(existing.get(account.id) || {})
  }));
}

function postedPaymentAmountForReceivable(receivableId) {
  return (state.paymentLedger || [])
    .filter((payment) => payment.receivableId === receivableId && payment.status === 'posted')
    .reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
}

function receivableStatus(receivable) {
  if (receivable.status === 'void') return 'void';
  const balance = Math.max(0, parseNumber(receivable.balance));
  const amount = Math.max(0, parseNumber(receivable.amount));
  if (amount > 0 && balance <= 0) return 'paid';
  if (postedPaymentAmountForReceivable(receivable.id) > 0) return 'partial';
  if (receivable.dueDate && receivable.dueDate < todayIso()) return 'overdue';
  return 'open';
}

function receivableStatusLabel(status) {
  return {
    open: '未收',
    partial: '部分收款',
    paid: '已收齊',
    overdue: '逾期',
    void: '已作廢'
  }[status] || status || '';
}

function recomputeReceivable(receivable) {
  const paidAmount = receivable.status === 'void' ? 0 : postedPaymentAmountForReceivable(receivable.id);
  const amount = Math.max(0, parseNumber(receivable.amount));
  receivable.paidAmount = Math.max(0, paidAmount);
  receivable.balance = receivable.status === 'void' ? 0 : Math.max(0, amount - paidAmount);
  receivable.status = receivable.status === 'void' ? 'void' : receivableStatus(receivable);
  receivable.updatedAt = new Date().toISOString();
  return receivable;
}

function recomputeAllReceivables() {
  for (const receivable of state.receivables || []) {
    recomputeReceivable(receivable);
  }
}

function auditUser() {
  return currentUser?.email || currentUser?.uid || 'local';
}

function diffSummary(before, after) {
  if (!before) return '新增';
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  return keys
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .slice(0, 8)
    .join('、') || '無欄位變更';
}

async function recordAudit(entityType, entityId, action, before, after, note = '') {
  const record = {
    id: nowId('audit'),
    createdAt: new Date().toISOString(),
    user: auditUser(),
    entityType,
    entityId,
    action,
    before: before || null,
    after: after || null,
    note,
    summary: diffSummary(before, after)
  };
  state.auditLogs.push(record);
  if (state.auditLogs.length > 300) {
    state.auditLogs = state.auditLogs.slice(-300);
  }
  try {
    await saveCloudRecord('auditLogs', record);
  } catch {
    // 審計紀錄雲端同步失敗時仍保留本機資料，避免阻斷主流程。
  }
  return record;
}

async function saveReceivable(record) {
  recomputeReceivable(record);
  await saveCloudRecord('receivables', record);
}

async function savePaymentRecord(record) {
  await saveCloudRecord('paymentLedger', record);
}

function columnIndex(column) {
  return String(column || '').toUpperCase().split('').reduce((total, char) => {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return total;
    return total * 26 + (code - 64);
  }, 0);
}

function canonicalSubject(value) {
  const textValue = String(value || '');
  if (/明軒|黃浩|竹中|數學/.test(textValue)) return '數學';
  if (/英文|小揚/.test(textValue)) return '英文';
  if (/物理/.test(textValue)) return '物理';
  if (/化學/.test(textValue)) return '化學';
  if (/生物/.test(textValue)) return '生物';
  if (/地科|地球/.test(textValue)) return '地科';
  if (/國文/.test(textValue)) return '國文';
  if (/社會|地理|歷史|公民/.test(textValue)) return '社會';
  if (/自然/.test(textValue)) return '自然';
  return textValue.replace(/學收|課程|班/g, '').trim();
}

function excelSerialDateToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return '';
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function getStudents() {
  return [
    ...(state.importSnapshot?.students || []),
    ...(state.manualStudents || [])
  ];
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

function manualCourseKey(courseId) {
  return `manual:${courseId}`;
}

function isManualCourseKey(key) {
  return String(key || '').startsWith('manual:');
}

function manualCourseIdFromKey(key) {
  return String(key || '').replace(/^manual:/, '');
}

function manualCourseLabel(course) {
  return [course.cohort, course.term, course.courseName]
    .filter(Boolean)
    .join(' / ');
}

function manualCoursesById() {
  return new Map((state.manualCourses || []).map((course) => [course.id, course]));
}

function manualTeachersByName() {
  return new Map((state.manualTeachers || []).map((teacher) => [String(teacher.name || '').trim(), teacher]));
}

function manualEnrollmentsByStudent() {
  const map = new Map();
  for (const enrollment of state.manualCourseEnrollments || []) {
    if (!enrollment?.studentId) continue;
    const rows = map.get(enrollment.studentId) || [];
    rows.push(enrollment);
    map.set(enrollment.studentId, rows);
  }
  return map;
}

function manualEnrollmentForStudentCourse(studentId, courseId) {
  return (state.manualCourseEnrollments || []).find((enrollment) => (
    enrollment.studentId === studentId && enrollment.courseId === courseId
  )) || null;
}

function receivableIdForEnrollment(enrollmentId) {
  return `receivable_${safeFirebaseKey(enrollmentId)}`;
}

function paymentIdForEnrollment(enrollmentId) {
  return `payment_from_${safeFirebaseKey(enrollmentId)}`;
}

function receivableById(id) {
  return (state.receivables || []).find((receivable) => receivable.id === id) || null;
}

function sourcePaymentForEnrollment(enrollmentId) {
  return (state.paymentLedger || []).find((payment) => payment.sourceEnrollmentId === enrollmentId && payment.source === 'manualEnrollmentInitial') || null;
}

async function upsertReceivableFromEnrollment(enrollment, course, student) {
  const id = receivableIdForEnrollment(enrollment.id);
  const existingIndex = state.receivables.findIndex((item) => item.id === id);
  const before = existingIndex >= 0 ? { ...state.receivables[existingIndex] } : null;
  const amount = Math.max(0, Math.round(parseNumber(enrollment.tuitionAmount || course?.defaultTuition)));
  const base = before || {};
  const record = {
    ...base,
    id,
    source: 'manualEnrollment',
    sourceEnrollmentId: enrollment.id,
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    studentName: enrollment.studentName || studentName(student),
    courseId: enrollment.courseId,
    courseName: enrollment.courseName || course?.courseName || '',
    accountId: 'ar_tuition',
    incomeAccountId: 'income_tuition',
    originalAmount: amount,
    discountAmount: 0,
    amount,
    issuedDate: enrollment.createdAt?.slice(0, 10) || todayIso(),
    dueDate: enrollment.dueDate || enrollment.paymentDate || base.dueDate || todayIso(),
    followUpStatus: base.followUpStatus || '未追蹤',
    note: enrollment.note || base.note || '',
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (base.status === 'void') {
    record.status = 'void';
    record.voidedAt = base.voidedAt || '';
    record.voidReason = base.voidReason || '';
  }
  recomputeReceivable(record);
  if (existingIndex >= 0) {
    state.receivables[existingIndex] = record;
  } else {
    state.receivables.push(record);
  }
  await recordAudit('receivable', id, before ? 'update' : 'create', before, record, '由網頁報名同步應收');
  try {
    await saveReceivable(record);
  } catch (error) {
    setCloudStatus(`應收雲端寫入失敗：${error.code || error.message}`);
  }

  const existingPayment = sourcePaymentForEnrollment(enrollment.id);
  if (enrollment.paymentDate && amount > 0) {
    const paymentBefore = existingPayment ? { ...existingPayment } : null;
    const payment = {
      ...(existingPayment || {}),
      id: existingPayment?.id || paymentIdForEnrollment(enrollment.id),
      receivableId: id,
      source: 'manualEnrollmentInitial',
      sourceEnrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentName: record.studentName,
      courseName: record.courseName,
      date: enrollment.paymentDate,
      amount,
      method: existingPayment?.method || '轉帳',
      assetAccountId: existingPayment?.assetAccountId || 'bank_main',
      incomeAccountId: 'income_tuition',
      note: existingPayment?.note || '報名表填繳費日期，自動建立收款',
      status: existingPayment?.status || 'posted',
      createdAt: existingPayment?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existingPayment) {
      Object.assign(existingPayment, payment);
    } else {
      state.paymentLedger.push(payment);
    }
    recomputeReceivable(record);
    await recordAudit('payment', payment.id, paymentBefore ? 'update' : 'create', paymentBefore, payment, '由網頁報名繳費日期同步收款');
    try {
      await savePaymentRecord(payment);
      await saveReceivable(record);
    } catch (error) {
      setCloudStatus(`收款雲端寫入失敗：${error.code || error.message}`);
    }
  }
  return record;
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

function studentManualTuitionTotal(studentId) {
  return (manualEnrollmentsByStudent().get(studentId) || [])
    .reduce((sum, enrollment) => sum + Math.round(parseNumber(enrollment.tuitionAmount)), 0);
}

function studentEffectivePaymentState(studentId, entries) {
  const base = paymentState(entries);
  const manualEnrollments = manualEnrollmentsByStudent().get(studentId) || [];
  if (manualEnrollments.some((enrollment) => enrollment.paymentDate)) return { key: 'paid', label: '有繳費日期' };
  if (manualEnrollments.some((enrollment) => parseNumber(enrollment.tuitionAmount) > 0)) return { key: 'tuition_no_payment', label: '有學費但未見繳費日期' };
  return base;
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
  if (isManualCourseKey(key)) {
    const course = manualCoursesById().get(manualCourseIdFromKey(key));
    return course ? manualCourseLabel(course) : '';
  }
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
  const manualEnrollments = manualEnrollmentsByStudent().get(student.id) || [];

  if (keyword && !studentSearchText(student, tuitionEntries).includes(keyword)) return false;
  if (sheet && student.sheet !== sheet) return false;
  if (course && isManualCourseKey(course) && !manualEnrollments.some((enrollment) => manualCourseKey(enrollment.courseId) === course)) return false;
  if (course && !isManualCourseKey(course) && !(student.selectedCourses || []).some((studentCourse) => courseKey(studentCourse) === course)) return false;
  if (paymentFilter && studentEffectivePaymentState(student.id, tuitionEntries).key !== paymentFilter) return false;
  if (duplicateOnly && nameCounts.get(studentName(student)) <= 1) return false;
  return true;
}

function studentSearchText(student, tuitionEntries = []) {
  const profile = student.profile || {};
  const manualCourses = manualCoursesById();
  const manualEnrollments = manualEnrollmentsByStudent().get(student.id) || [];
  return [
    profile.name,
    profile.highSchool,
    profile.juniorHigh,
    profile.motherPhone,
    profile.fatherPhone,
    profile.note,
    student.sheet,
    student.row,
    ...(student.selectedCourses || []).flatMap((course) => [course.group, course.header, course.column]),
    ...manualEnrollments.flatMap((enrollment) => {
      const course = manualCourses.get(enrollment.courseId);
      return [
        course?.cohort,
        course?.term,
        course?.courseName,
        course?.teacherName,
        enrollment.tuitionAmount,
        enrollment.paymentDate,
        enrollment.note
      ];
    }),
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

function cohortOptions() {
  const builtIns = ['國三升高一', '高一升高二', '高二升高三', '高三既有資料'];
  const sheets = getStudents().map((student) => student.sheet).filter(Boolean);
  const courseCohorts = (state.manualCourses || []).map((course) => course.cohort).filter(Boolean);
  return Array.from(new Set([...builtIns, ...sheets, ...courseCohorts])).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function syncManualForms() {
  const cohortHtml = cohortOptions()
    .map((cohort) => `<option value="${escapeHtml(cohort)}">${escapeHtml(cohort)}</option>`)
    .join('');
  if (elements.manualCourseCohort.innerHTML !== cohortHtml) elements.manualCourseCohort.innerHTML = cohortHtml;
  if (elements.manualStudentCohort.innerHTML !== cohortHtml) elements.manualStudentCohort.innerHTML = cohortHtml;

  elements.manualTermOptions.innerHTML = (state.manualTerms || [])
    .slice()
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'zh-Hant'))
    .map((term) => `<option value="${escapeHtml(term.label)}"></option>`)
    .join('');

  elements.manualTeacherOptions.innerHTML = (state.manualTeachers || [])
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'))
    .map((teacher) => `<option value="${escapeHtml(teacher.name)}"></option>`)
    .join('');

  const courseOptions = (state.manualCourses || [])
    .slice()
    .sort((a, b) => manualCourseLabel(a).localeCompare(manualCourseLabel(b), 'zh-Hant'))
    .map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(manualCourseLabel(course))}</option>`)
    .join('');
  elements.manualEnrollmentCourse.innerHTML = courseOptions || '<option value="">請先新增科目</option>';
  elements.manualEnrollmentCourse.disabled = !state.manualCourses.length;

  const studentOptions = getStudents()
    .slice()
    .sort((a, b) => `${a.sheet} ${studentName(a)} ${a.row}`.localeCompare(`${b.sheet} ${studentName(b)} ${b.row}`, 'zh-Hant'))
    .map((student) => {
      const source = student.source === 'manual' ? '網頁新增' : `列 ${student.row}`;
      return `<option value="${escapeHtml(student.id)}">${escapeHtml(studentName(student))}｜${escapeHtml(student.sheet)}｜${escapeHtml(source)}</option>`;
    })
    .join('');
  elements.manualEnrollmentStudent.innerHTML = studentOptions || '<option value="">請先匯入或新增學生</option>';
  elements.manualEnrollmentStudent.disabled = !getStudents().length;
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
  for (const course of state.manualCourses || []) {
    courses.set(manualCourseKey(course.id), manualCourseLabel(course));
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
    courseEnrollments: manualEnrollmentsByStudent().get(student.id) || [],
    notes: state.studentNotes.filter((note) => (
      note.studentId === student.id || (!note.studentId && note.studentName === name)
    )),
    profile: studentProfileOverride(student.id)
  };
}

function tuitionAmount(entry) {
  return Math.round(parseNumber(entry?.value));
}

function isTuitionEntry(entry) {
  return entry?.kind === 'tuition' && tuitionAmount(entry) > 0;
}

function isTotalTuitionEntry(entry) {
  return isTuitionEntry(entry) && /總學收|進度總學收/.test(String(entry.header || ''));
}

function tuitionTotal(entries) {
  const totalEntries = (entries || []).filter(isTotalTuitionEntry);
  const sourceRows = totalEntries.length ? totalEntries : (entries || []).filter(isTuitionEntry);
  return sourceRows.reduce((sum, entry) => sum + tuitionAmount(entry), 0);
}

function tuitionSummaryText(entries, maxItems = 3) {
  const tuitionEntries = (entries || []).filter(isTuitionEntry);
  if (!tuitionEntries.length) return '無收費欄位';
  const total = tuitionTotal(tuitionEntries);
  const labels = tuitionEntries
    .filter((entry) => !isTotalTuitionEntry(entry))
    .slice(0, maxItems)
    .map((entry) => `${entry.header} ${formatMoney(tuitionAmount(entry))}`);
  return [`總 ${formatMoney(total)}`, ...labels].join('；');
}

function tuitionEntryDisplayValue(entry) {
  if (!entry) return '';
  if (entry.kind === 'payment_date') return excelSerialDateToIso(entry.value) || String(entry.value || '');
  if (['tuition', 'discount_or_voucher', 'refund'].includes(entry.kind)) return formatMoney(tuitionAmount(entry));
  return String(entry.value ?? '');
}

function courseTuitionForStudent(student, courseKeyValue, tuitionEntries) {
  const course = (student.selectedCourses || []).find((item) => courseKey(item) === courseKeyValue);
  if (!course) return null;
  const courseColumn = columnIndex(course.column);
  const subject = canonicalSubject(course.header);
  const nearby = (tuitionEntries || [])
    .filter((entry) => isTuitionEntry(entry) && !isTotalTuitionEntry(entry))
    .map((entry) => ({
      ...entry,
      distance: columnIndex(entry.column) - courseColumn,
      subject: canonicalSubject(entry.header)
    }))
    .filter((entry) => entry.distance >= 0 && entry.distance <= 8)
    .sort((a, b) => a.distance - b.distance);

  const exact = nearby.find((entry) => entry.subject === subject);
  const naturalBundle = nearby.find((entry) => ['物理', '化學', '生物', '地科'].includes(subject) && entry.subject === '自然');
  const fallback = nearby[0];
  const match = exact || naturalBundle || fallback;
  if (!match) return null;
  return {
    amount: tuitionAmount(match),
    label: `${match.header} ${formatMoney(tuitionAmount(match))}`,
    column: match.column
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
  const manualCourses = manualCoursesById();
  for (const enrollment of manual.courseEnrollments || []) {
    const course = manualCourses.get(enrollment.courseId);
    items.push({
      date: enrollment.paymentDate || enrollment.createdAt?.slice(0, 10) || '',
      type: '報名',
      text: `${course ? manualCourseLabel(course) : enrollment.courseId}，收費 $${formatMoney(parseNumber(enrollment.tuitionAmount))}${enrollment.note ? `；${enrollment.note}` : ''}`
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
  const manualCourseMap = manualCoursesById();
  const profile = student.profile || {};
  const profileOverride = manual.profile;
  const courses = student.selectedCourses || [];
  const manualCourseTags = manual.courseEnrollments
    .map((enrollment) => manualCourseMap.get(enrollment.courseId))
    .filter(Boolean);
  const payment = studentEffectivePaymentState(student.id, tuitionEntries);
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
        ${courses.length || manualCourseTags.length
          ? [
            ...courses.map((course) => `<span class="tag">${escapeHtml(courseLabel(course))}</span>`),
            ...manualCourseTags.map((course) => `<span class="tag">${escapeHtml(manualCourseLabel(course))}</span>`)
          ].join('')
          : '<span class="empty">尚無課程勾選</span>'}
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
      <h3>網頁報名 / 收費</h3>
      <div class="mini-list">
        ${manual.courseEnrollments.length ? manual.courseEnrollments.map((enrollment) => {
          const course = manualCourseMap.get(enrollment.courseId);
          return `
            <div class="mini-row">
              <strong>${escapeHtml(course ? manualCourseLabel(course) : enrollment.courseId)}</strong>
              <span>${escapeHtml(enrollment.paymentDate || '未填繳費日期')}</span>
              <span>$${formatMoney(parseNumber(enrollment.tuitionAmount))}</span>
            </div>
          `;
        }).join('') : '<p class="empty">尚無網頁新增報名</p>'}
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
  const students = getStudents();
  if (!students.length) {
    selectedStudentId = null;
    elements.studentDashboardSummary.innerHTML = '<div class="record-item"><p>尚未載入匯入快照，也尚未新增網頁學生</p></div>';
    elements.studentCenterRows.innerHTML = emptyRow(8);
    elements.studentDetail.innerHTML = '<p class="empty">選一位學生查看課程、學費與異動紀錄</p>';
    syncStudentSelectOptions();
    syncStudentFilters();
    syncManualForms();
    return;
  }

  syncStudentSelectOptions();
  syncStudentFilters();
  syncManualForms();

  const { nameCounts, studentsById, tuitionByStudent } = buildStudentIndexes();
  const duplicateRows = students.filter((student) => nameCounts.get(studentName(student)) > 1).length;
  const paymentCounts = students.reduce((counts, student) => {
    const stateKey = studentEffectivePaymentState(student.id, tuitionByStudent.get(student.id) || []).key;
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
      const payment = studentEffectivePaymentState(student.id, tuitionEntries);
      const manualCourseCount = (manualEnrollmentsByStudent().get(student.id) || []).length;
      return `
        <tr class="${selectedStudentId === student.id ? 'is-selected' : ''}">
          <td>
            <strong>${escapeHtml(studentName(student) || '未命名')}</strong>
            ${duplicateCount > 1 ? '<span class="risk inline-risk">同名</span>' : ''}
          </td>
          <td>${escapeHtml(student.sheet)}</td>
          <td class="money">${escapeHtml(student.row)}</td>
          <td>${escapeHtml(studentSchool(student))}</td>
          <td class="money">${formatMoney((student.selectedCourses || []).length + manualCourseCount)}</td>
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

function renderManualCourses() {
  syncManualForms();
  const enrollmentsByCourse = new Map();
  for (const enrollment of state.manualCourseEnrollments || []) {
    enrollmentsByCourse.set(enrollment.courseId, (enrollmentsByCourse.get(enrollment.courseId) || 0) + 1);
  }
  elements.manualCourseSummary.textContent = `學期 ${formatMoney(state.manualTerms.length)} 個，老師 ${formatMoney(state.manualTeachers.length)} 位，網頁學生 ${formatMoney(state.manualStudents.length)} 位，網頁科目 ${formatMoney(state.manualCourses.length)} 個，網頁報名 ${formatMoney(state.manualCourseEnrollments.length)} 筆`;
  const termRows = (state.manualTerms || []).map((term) => ({
    type: '學期',
    name: term.label || '',
    detail: [term.startMonth, term.endMonth].filter(Boolean).join(' 到 '),
    defaults: term.note || ''
  }));
  const teacherRows = (state.manualTeachers || []).map((teacher) => ({
    type: '老師',
    name: teacher.name || '',
    detail: [teacher.subject, teacher.contact].filter(Boolean).join(' / '),
    defaults: [
      teacher.defaultShare ? `分潤 ${formatMoney(teacher.defaultShare)}%` : '',
      teacher.defaultFixedRate ? `鐘點 ${formatMoney(teacher.defaultFixedRate)}` : ''
    ].filter(Boolean).join('；') || teacher.note || ''
  }));
  const masterRows = [...termRows, ...teacherRows]
    .sort((a, b) => `${a.type} ${a.name}`.localeCompare(`${b.type} ${b.name}`, 'zh-Hant'));
  elements.manualMasterRows.innerHTML = masterRows.length
    ? masterRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.type)}</td>
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td>${escapeHtml(row.detail)}</td>
        <td>${escapeHtml(row.defaults)}</td>
      </tr>
    `).join('')
    : emptyRow(4);

  elements.manualCourseRows.innerHTML = state.manualCourses.length
    ? state.manualCourses
      .slice()
      .sort((a, b) => manualCourseLabel(a).localeCompare(manualCourseLabel(b), 'zh-Hant'))
      .map((course) => `
        <tr>
          <td><strong>${escapeHtml(course.courseName)}</strong>${course.term ? `<br><span class="muted">${escapeHtml(course.term)}</span>` : ''}</td>
          <td>${escapeHtml(course.cohort || '')}</td>
          <td>${escapeHtml(course.teacherName || '')}</td>
          <td class="money">${formatMoney(parseNumber(course.defaultTuition))}</td>
          <td class="money">${formatMoney(enrollmentsByCourse.get(course.id) || 0)}</td>
        </tr>
      `).join('')
    : emptyRow(5);
}

function renderStudentOverviews() {
  if (!getStudents().length) {
    elements.gradeOverviewRows.innerHTML = emptyRow(6);
    elements.courseOverviewRows.innerHTML = emptyRow(5);
    return;
  }

  const { tuitionByStudent } = buildStudentIndexes();
  const enrollmentMap = manualEnrollmentsByStudent();
  const manualCourseMap = manualCoursesById();
  const gradeRows = new Map();
  const courseRows = new Map();

  for (const student of getStudents()) {
    const tuitionEntries = tuitionByStudent.get(student.id) || [];
    const grade = gradeRows.get(student.sheet) || {
      sheet: student.sheet,
      studentCount: 0,
      courseCount: 0,
      tuitionEntryCount: 0,
      tuitionTotal: 0,
      paidCount: 0
    };
    grade.studentCount += 1;
    const manualEnrollments = enrollmentMap.get(student.id) || [];
    grade.courseCount += (student.selectedCourses || []).length + manualEnrollments.length;
    grade.tuitionEntryCount += tuitionEntries.filter(isTuitionEntry).length;
    grade.tuitionTotal += tuitionTotal(tuitionEntries) + studentManualTuitionTotal(student.id);
    if (studentEffectivePaymentState(student.id, tuitionEntries).key === 'paid') grade.paidCount += 1;
    gradeRows.set(student.sheet, grade);

    for (const course of student.selectedCourses || []) {
      const key = courseKey(course);
      const courseFee = courseTuitionForStudent(student, key, tuitionEntries);
      const row = courseRows.get(key) || {
        key,
        label: courseLabel(course),
        sheet: student.sheet,
        count: 0,
        chargedCount: 0,
        feeTotal: 0
      };
      row.count += 1;
      if (courseFee) {
        row.chargedCount += 1;
        row.feeTotal += courseFee.amount;
      }
      courseRows.set(key, row);
    }

    for (const enrollment of manualEnrollments) {
      const course = manualCourseMap.get(enrollment.courseId);
      if (!course) continue;
      const key = manualCourseKey(course.id);
      const amount = Math.round(parseNumber(enrollment.tuitionAmount));
      const row = courseRows.get(key) || {
        key,
        label: manualCourseLabel(course),
        sheet: course.cohort || student.sheet,
        count: 0,
        chargedCount: 0,
        feeTotal: 0
      };
      row.count += 1;
      if (amount > 0) {
        row.chargedCount += 1;
        row.feeTotal += amount;
      }
      courseRows.set(key, row);
    }
  }

  for (const course of state.manualCourses || []) {
    const key = manualCourseKey(course.id);
    if (!courseRows.has(key)) {
      courseRows.set(key, {
        key,
        label: manualCourseLabel(course),
        sheet: course.cohort || '',
        count: 0,
        chargedCount: 0,
        feeTotal: 0
      });
    }
  }

  elements.gradeOverviewRows.innerHTML = Array.from(gradeRows.values()).length
    ? Array.from(gradeRows.values()).map((row) => `
      <tr>
        <td>${escapeHtml(row.sheet)}</td>
        <td class="money">${formatMoney(row.studentCount)}</td>
        <td class="money">${formatMoney(row.courseCount)}</td>
        <td class="money">${formatMoney(row.tuitionEntryCount)}</td>
        <td class="money">${formatMoney(row.tuitionTotal)}</td>
        <td class="money">${formatMoney(row.paidCount)}</td>
      </tr>
    `).join('')
    : emptyRow(6);

  const selectedSheet = elements.studentSheetFilter.value;
  const visibleCourseRows = Array.from(courseRows.values())
    .filter((row) => !selectedSheet || row.sheet === selectedSheet)
    .sort((a, b) => `${a.sheet} ${a.label}`.localeCompare(`${b.sheet} ${b.label}`, 'zh-Hant'));
  elements.courseOverviewRows.innerHTML = visibleCourseRows.length
    ? visibleCourseRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.sheet)}</td>
        <td class="money">${formatMoney(row.count)}</td>
        <td class="money">${formatMoney(row.chargedCount)}</td>
        <td class="money">${formatMoney(row.feeTotal)}</td>
      </tr>
    `).join('')
    : emptyRow(5);
}

function filteredStudentMatrixData() {
  if (!getStudents().length) {
    return { rows: [], courseColumns: [], feeColumns: [], tuitionByStudent: new Map() };
  }
  const { nameCounts, tuitionByStudent } = buildStudentIndexes();
  const rows = getStudents().filter((student) => (
    studentMatchesFilters(student, tuitionByStudent.get(student.id) || [], nameCounts)
  ));
  const courseColumns = new Map();
  const feeColumns = new Map();
  const selectedSheet = elements.studentSheetFilter.value;
  const selectedCourse = elements.studentCourseFilter.value;
  const enrollmentMap = manualEnrollmentsByStudent();
  const manualCourseIdsInRows = new Set(rows.flatMap((student) => (
    (enrollmentMap.get(student.id) || []).map((enrollment) => enrollment.courseId)
  )));

  for (const student of rows) {
    for (const course of student.selectedCourses || []) {
      const key = courseKey(course);
      if (!courseColumns.has(key)) {
        courseColumns.set(key, {
          key,
          label: courseLabel(course),
          sort: columnIndex(course.column)
        });
      }
    }
    for (const entry of tuitionByStudent.get(student.id) || []) {
      const key = `${entry.column}|${entry.header}|${entry.kind}`;
      if (!feeColumns.has(key)) {
        feeColumns.set(key, {
          key,
          label: `${entry.header} / 欄 ${entry.column}`,
          sort: columnIndex(entry.column),
          kind: entry.kind
        });
      }
    }
  }

  for (const course of state.manualCourses || []) {
    const key = manualCourseKey(course.id);
    if (selectedCourse && selectedCourse !== key) continue;
    if (selectedSheet && course.cohort !== selectedSheet && !manualCourseIdsInRows.has(course.id)) continue;
    const label = manualCourseLabel(course);
    if (!courseColumns.has(key)) {
      courseColumns.set(key, {
        key,
        label,
        sort: 100000 + label.localeCompare(label, 'zh-Hant')
      });
    }
    feeColumns.set(`manualFee:${course.id}`, {
      key: `manualFee:${course.id}`,
      label: `${label} / 網頁收費`,
      sort: 100000 + (state.manualCourses || []).findIndex((item) => item.id === course.id),
      kind: 'manual'
    });
  }

  return {
    rows,
    courseColumns: Array.from(courseColumns.values()).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'zh-Hant')),
    feeColumns: Array.from(feeColumns.values()).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'zh-Hant')),
    tuitionByStudent
  };
}

function renderStudentMatrix() {
  if (!getStudents().length) {
    elements.studentMatrixSummary.textContent = '尚未載入匯入快照，也尚未新增網頁學生';
    elements.studentMatrixHead.innerHTML = '<tr><th>尚無資料</th></tr>';
    elements.studentMatrixRows.innerHTML = emptyRow(1);
    return;
  }

  const { rows, courseColumns, feeColumns, tuitionByStudent } = filteredStudentMatrixData();
  const visibleRows = rows.slice(0, 500);
  const baseHeaders = ['分頁', '列', '姓名', '高中/學校', '國中', '年級', '繳費狀態', '總學收'];
  elements.studentMatrixSummary.textContent = `目前篩選 ${formatMoney(rows.length)} 位學生，顯示 ${formatMoney(visibleRows.length)} 位；課程欄 ${formatMoney(courseColumns.length)} 欄，收費欄 ${formatMoney(feeColumns.length)} 欄。`;
  elements.studentMatrixHead.innerHTML = `
    <tr>
      ${baseHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
      ${courseColumns.map((column) => `<th class="matrix-course">課程｜${escapeHtml(column.label)}</th>`).join('')}
      ${feeColumns.map((column) => `<th class="matrix-fee">收費｜${escapeHtml(column.label)}</th>`).join('')}
    </tr>
  `;

  elements.studentMatrixRows.innerHTML = visibleRows.length
    ? visibleRows.map((student) => {
      const tuitionEntries = tuitionByStudent.get(student.id) || [];
      const courseSet = new Set((student.selectedCourses || []).map(courseKey));
      for (const enrollment of manualEnrollmentsByStudent().get(student.id) || []) {
        courseSet.add(manualCourseKey(enrollment.courseId));
      }
      const feeByKey = new Map(tuitionEntries.map((entry) => [`${entry.column}|${entry.header}|${entry.kind}`, entry]));
      for (const enrollment of manualEnrollmentsByStudent().get(student.id) || []) {
        const value = [
          formatMoney(parseNumber(enrollment.tuitionAmount)),
          enrollment.paymentDate || ''
        ].filter(Boolean).join(' / ');
        feeByKey.set(`manualFee:${enrollment.courseId}`, { kind: 'manual', value });
      }
      return `
        <tr>
          <td>${escapeHtml(student.sheet)}</td>
          <td class="money">${escapeHtml(student.row)}</td>
          <td><strong>${escapeHtml(studentName(student) || '')}</strong></td>
          <td>${escapeHtml(studentSchool(student))}</td>
          <td>${escapeHtml(student.profile?.juniorHigh || '')}</td>
          <td>${escapeHtml(student.profile?.grade || '')}</td>
          <td>${escapeHtml(studentEffectivePaymentState(student.id, tuitionEntries).label)}</td>
          <td class="money">${formatMoney(tuitionTotal(tuitionEntries) + studentManualTuitionTotal(student.id))}</td>
          ${courseColumns.map((column) => `<td class="matrix-check">${courseSet.has(column.key) ? '✓' : ''}</td>`).join('')}
          ${feeColumns.map((column) => `<td class="money">${escapeHtml(tuitionEntryDisplayValue(feeByKey.get(column.key)))}</td>`).join('')}
        </tr>
      `;
    }).join('')
    : emptyRow(baseHeaders.length + courseColumns.length + feeColumns.length);

  if (rows.length > visibleRows.length) {
    elements.studentMatrixRows.insertAdjacentHTML('beforeend', `
      <tr><td colspan="${baseHeaders.length + courseColumns.length + feeColumns.length}" class="empty">另有 ${formatMoney(rows.length - visibleRows.length)} 位學生未顯示，請縮小篩選條件。</td></tr>
    `);
  }
}

function rosterRowsForCurrentCourse() {
  const course = elements.studentCourseFilter.value;
  if (!getStudents().length || !course) return [];
  const { tuitionByStudent } = buildStudentIndexes();
  if (isManualCourseKey(course)) {
    const courseId = manualCourseIdFromKey(course);
    return getStudents()
      .filter((student) => manualEnrollmentForStudentCourse(student.id, courseId))
      .map((student) => ({
        student,
        tuitionEntries: tuitionByStudent.get(student.id) || []
      }));
  }
  return getStudents()
    .filter((student) => (student.selectedCourses || []).some((studentCourse) => courseKey(studentCourse) === course))
    .map((student) => ({
      student,
      tuitionEntries: tuitionByStudent.get(student.id) || []
    }));
}

function renderClassRoster() {
  if (!getStudents().length) {
    elements.classRosterSummary.textContent = '尚未載入匯入快照，也尚未新增網頁學生';
    elements.classRosterRows.innerHTML = emptyRow(6);
    return;
  }

  const course = elements.studentCourseFilter.value;
  if (!course) {
    elements.classRosterSummary.textContent = '選擇班級 / 課程後查看名單';
    elements.classRosterRows.innerHTML = emptyRow(6);
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
      const manualEnrollment = isManualCourseKey(course) ? manualEnrollmentForStudentCourse(student.id, manualCourseIdFromKey(course)) : null;
      const courseFee = manualEnrollment
        ? {
          label: `${formatMoney(parseNumber(manualEnrollment.tuitionAmount))}${manualEnrollment.paymentDate ? ` / ${manualEnrollment.paymentDate}` : ''}`,
          amount: parseNumber(manualEnrollment.tuitionAmount)
        }
        : courseTuitionForStudent(student, course, tuitionEntries);
      return `
        <tr>
          <td><strong>${escapeHtml(name || '未命名')}</strong></td>
          <td>${escapeHtml(student.sheet)} · 列 ${escapeHtml(student.row)}</td>
          <td>${escapeHtml(studentSchool(student))}</td>
          <td>${escapeHtml(courseFee?.label || tuitionSummaryText(tuitionEntries, 1))}</td>
          <td>${escapeHtml(studentEffectivePaymentState(student.id, tuitionEntries).label)}</td>
          <td>${studentEvents.length ? studentEvents.map((event) => `${escapeHtml(event.date || '')} ${escapeHtml(event.action || '')}${event.sessionNo ? ` 第 ${escapeHtml(event.sessionNo)} 堂` : ''}`).join('<br>') : '<span class="muted">無</span>'}</td>
        </tr>
      `;
    }).join('')
    : emptyRow(6);
}

function getTeacherRosterBlocks() {
  const importedBlocks = (state.importSnapshot?.teacherSheets || []).flatMap((sheet) => (
    (sheet.rosterBlocks || []).map((block, index) => ({
      ...block,
      key: `${sheet.summary?.sheet || block.sheet}::${block.title}::${block.startColumn || index}`,
      teacherSheet: sheet.summary?.sheet || block.sheet
    }))
  ));
  const { studentsById } = buildStudentIndexes();
  const manualBlocks = (state.manualCourses || []).map((course) => {
    const enrollments = (state.manualCourseEnrollments || []).filter((enrollment) => enrollment.courseId === course.id);
    const sessionCount = Math.max(1, Math.round(parseNumber(course.sessionCount)) || 24);
    const teacher = manualTeachersByName().get(String(course.teacherName || '').trim());
    return {
      key: `manualCourse::${course.id}`,
      source: 'manualCourse',
      teacherSheet: course.teacherName || '網頁新增老師',
      title: manualCourseLabel(course),
      sheet: course.cohort || '',
      defaultShare: teacher?.defaultShare || '',
      defaultFixedRate: teacher?.defaultFixedRate || '',
      rowCount: enrollments.length,
      rows: enrollments.map((enrollment, index) => {
        const student = studentsById.get(enrollment.studentId);
        const revenue = Math.round(parseNumber(enrollment.tuitionAmount));
        return {
          row: index + 1,
          fields: {
            '學生ID': enrollment.studentId,
            '姓名': studentName(student) || enrollment.studentName,
            '學校': studentSchool(student),
            '單堂': Math.round(revenue / sessionCount)
          }
        };
      })
    };
  });
  return [...importedBlocks, ...manualBlocks];
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

function syncPayrollStudentOptions() {
  const block = selectedPayrollRosterBlock();
  const names = Array.from(new Set((block?.rows || [])
    .map((row) => row.fields?.['姓名'] || '')
    .filter(Boolean)));
  elements.payrollEventStudentOptions.innerHTML = names
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join('');
  elements.savePayrollEvent.disabled = !block;
}

function currentPayrollEvents() {
  const block = selectedPayrollRosterBlock();
  if (!block) return [];
  const month = elements.payrollCalcMonth.value;
  return state.membershipEvents
    .filter((event) => (
      (!month || String(event.date || event.month || '').startsWith(month)) &&
      eventMatchesCourseName(event, block.title || '')
    ))
    .sort((a, b) => `${a.date || ''}-${a.sessionNo || ''}`.localeCompare(`${b.date || ''}-${b.sessionNo || ''}`));
}

function renderPayrollQuickEvents() {
  syncPayrollStudentOptions();
  const events = currentPayrollEvents();
  elements.payrollEventList.innerHTML = events.length
    ? events.map((event) => `
      <div>
        <strong>${escapeHtml(event.studentName)}</strong>
        ${escapeHtml(event.action)}
        ${escapeHtml(event.date || '')}
        ${event.sessionNo ? `第 ${escapeHtml(event.sessionNo)} 堂` : ''}
        ${event.note ? `｜${escapeHtml(event.note)}` : ''}
      </div>
    `).join('')
    : '<div>本班本月尚無進退班異動。</div>';
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
      const sameMonth = !month || String(event.date || event.month || '').startsWith(month);
      return sameStudent && sameMonth && eventMatchesCourseName(event, courseName);
    })
    .sort((a, b) => `${a.date}-${a.sessionNo}`.localeCompare(`${b.date}-${b.sessionNo}`));
}

function payrollEventsForStudentName(studentNameValue, courseName, month) {
  return state.membershipEvents
    .filter((event) => {
      const sameStudent = event.studentName === studentNameValue;
      const sameMonth = !month || String(event.date || event.month || '').startsWith(month);
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
    const explicitStudentId = fields['學生ID'] || '';
    const candidates = explicitStudentId ? [] : payrollStudentCandidates(name, courseName);
    const isAmbiguousStudent = !explicitStudentId && candidates.length > 1;
    const studentId = explicitStudentId || (candidates.length === 1 ? candidates[0].id : '');
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
  renderPayrollQuickEvents();
  if (!payrollPreview) {
    elements.payrollPreviewSummary.innerHTML = '<div class="record-item"><p>尚未產生薪資試算</p></div>';
    elements.payrollPreviewRows.innerHTML = emptyRow(6);
    elements.savePayrollPreview.disabled = true;
    elements.exportPayrollPreviewCsv.disabled = true;
    elements.exportPayrollPreviewPrint.disabled = true;
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
  elements.exportPayrollPreviewPrint.disabled = false;
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

function buildPayrollPrintHtml(preview) {
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
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>山熊升大老師薪資表</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #14232e; font-family: -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", Arial, sans-serif; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 14px; text-align: center; }
    .meta { border: 1px solid #9fb9c7; border-radius: 8px; display: grid; grid-template-columns: repeat(2, 1fr); margin-bottom: 12px; overflow: hidden; }
    .meta div { border-bottom: 1px solid #d6e3ea; padding: 8px 10px; }
    .meta div:nth-last-child(-n + 2) { border-bottom: 0; }
    .label { color: #5c6f7b; display: block; font-size: 12px; font-weight: 700; margin-bottom: 2px; }
    table { border-collapse: collapse; font-size: 12px; width: 100%; }
    th, td { border: 1px solid #9fb9c7; padding: 6px 7px; vertical-align: top; }
    th { background: #e3f3f9; color: #14232e; }
    .money { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
    .summary { margin-top: 12px; }
    .summary th { text-align: right; }
    .sign { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); margin-top: 18px; }
    .sign div { border-bottom: 1px solid #14232e; height: 44px; padding-top: 26px; }
    .toolbar { margin: 0 0 12px; text-align: right; }
    .toolbar button { background: #237fa6; border: 0; border-radius: 8px; color: white; cursor: pointer; font: inherit; font-weight: 700; padding: 8px 14px; }
    @media print { .toolbar { display: none; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">列印 / 存 PDF</button></div>
  <h1>山熊升大老師薪資表</h1>
  <section class="meta">
    <div><span class="label">月份</span>${escapeHtml(preview.month || '')}</div>
    <div><span class="label">老師</span>${escapeHtml(preview.teacherName)}</div>
    <div><span class="label">班級 / 課程</span>${escapeHtml(preview.courseName)}</div>
    <div><span class="label">名單來源</span>${escapeHtml(preview.rosterSheet || '')}</div>
    <div><span class="label">計算方式</span>${escapeHtml(payrollMethodLabel(preview))}</div>
    <div><span class="label">本月堂數</span>${formatMoney(preview.sessionCount)}</div>
    <div><span class="label">堂次日期</span>${escapeHtml(sessionDateText || '未設定')}</div>
    <div><span class="label">產生時間</span>${escapeHtml(generatedAt)}</div>
  </section>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>學生</th>
        <th>學校</th>
        <th>單堂收入</th>
        <th>有效堂數</th>
        <th>異動</th>
        <th>收入小計</th>
      </tr>
    </thead>
    <tbody>${detailRows}</tbody>
  </table>
  <table class="summary">
    <tr><th>學生收入合計</th><td class="money">${formatMoney(preview.revenueTotal)}</td><th>老師基礎薪資</th><td class="money">${formatMoney(preview.teacherBase)}</td></tr>
    <tr><th>調整</th><td class="money">${formatMoney(preview.adjustment)}</td><th>老師小計</th><td class="money">${formatMoney(preview.total)}</td></tr>
    <tr><th>備註</th><td colspan="3">${escapeHtml(preview.note || '')}</td></tr>
  </table>
  <section class="sign">
    <div>製表</div>
    <div>覆核</div>
    <div>老師確認</div>
  </section>
</body>
</html>`;
}

function accountingRef(path = '') {
  return ref(database, path ? `${accountingRoot}/${path}` : accountingRoot);
}

function setCloudStatus(message) {
  elements.cloudStatus.textContent = message;
}

function authErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/unauthorized-domain') return '這個網址尚未加入 Firebase Auth 授權網域';
  if (code === 'auth/operation-not-allowed') return 'Firebase 尚未開啟 Google 登入';
  if (code === 'auth/popup-blocked') return '瀏覽器封鎖彈出登入，改用跳轉登入';
  if (code === 'auth/popup-closed-by-user') return '你關閉了 Google 登入視窗';
  if (code === 'auth/network-request-failed') return '網路連線失敗，請重新整理後再登入';
  return `登入失敗：${code || error?.message || '未知錯誤'}`;
}

function showAuthError(error) {
  const message = authErrorMessage(error);
  setCloudStatus(message);
  elements.loginGateStatus.textContent = message;
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
  state.manualStudents = mergeRecordsById(state.manualStudents, Object.values(manual.manualStudents || {}));
  state.manualTerms = mergeRecordsById(state.manualTerms, Object.values(manual.manualTerms || {}));
  state.manualTeachers = mergeRecordsById(state.manualTeachers, Object.values(manual.manualTeachers || {}));
  state.manualCourses = mergeRecordsById(state.manualCourses, Object.values(manual.manualCourses || {}));
  state.manualCourseEnrollments = mergeRecordsById(state.manualCourseEnrollments, Object.values(manual.manualCourseEnrollments || {}));
  state.accountingAccounts = mergeRecordsById(defaultAccountingAccounts(), Object.values(manual.accountingAccounts || {}));
  state.receivables = mergeRecordsById(state.receivables, Object.values(manual.receivables || {}));
  state.paymentLedger = mergeRecordsById(state.paymentLedger, Object.values(manual.paymentLedger || {}));
  state.auditLogs = mergeRecordsById(state.auditLogs, Object.values(manual.auditLogs || {}));
  recomputeAllReceivables();
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

async function addMembershipEvent(data) {
  const record = {
    id: nowId('event'),
    createdAt: new Date().toISOString(),
    ...data
  };
  state.membershipEvents.push(record);
  renderAll();
  try {
    await saveCloudRecord('membershipEvents', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
  return record;
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

function accountingSummary() {
  recomputeAllReceivables();
  const activeReceivables = (state.receivables || []).filter((row) => row.status !== 'void');
  const postedPayments = (state.paymentLedger || []).filter((row) => row.status === 'posted');
  const receivableTotal = activeReceivables.reduce((sum, row) => sum + parseNumber(row.amount), 0);
  const paidTotal = postedPayments.reduce((sum, row) => sum + parseNumber(row.amount), 0);
  const balanceTotal = activeReceivables.reduce((sum, row) => sum + parseNumber(row.balance), 0);
  const overdueTotal = activeReceivables
    .filter((row) => row.status === 'overdue')
    .reduce((sum, row) => sum + parseNumber(row.balance), 0);
  const currentMonth = currentMonthIso();
  const monthIncome = postedPayments
    .filter((row) => String(row.date || '').startsWith(currentMonth))
    .reduce((sum, row) => sum + parseNumber(row.amount), 0);
  return { activeReceivables, postedPayments, receivableTotal, paidTotal, balanceTotal, overdueTotal, monthIncome };
}

function renderMiniReport(rows) {
  if (!rows.length) return '<p class="empty">尚無資料</p>';
  return rows.map(([label, value]) => `
    <div class="mini-report-row">
      <span>${escapeHtml(label)}</span>
      <strong>${formatMoney(value)}</strong>
    </div>
  `).join('');
}

function buildAccountingReports() {
  const { activeReceivables, postedPayments } = accountingSummary();
  const income = postedPayments.reduce((sum, payment) => sum + parseNumber(payment.amount), 0);
  const salaryExpense = (state.payrollRuns || []).reduce((sum, row) => sum + parseNumber(row.total), 0);
  const profitLoss = [
    ['學費收入', income],
    ['老師薪資費用', -salaryExpense],
    ['帳務淨額', income - salaryExpense]
  ];

  const cashByAccount = new Map();
  for (const payment of postedPayments) {
    const key = accountName(payment.assetAccountId);
    cashByAccount.set(key, (cashByAccount.get(key) || 0) + parseNumber(payment.amount));
  }
  const cashFlow = Array.from(cashByAccount.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'));

  const today = new Date(`${todayIso()}T00:00:00`);
  const agingBuckets = new Map([
    ['未到期 / 當期', 0],
    ['逾期 1-30 天', 0],
    ['逾期 31-60 天', 0],
    ['逾期 61 天以上', 0]
  ]);
  for (const receivable of activeReceivables) {
    const balance = parseNumber(receivable.balance);
    if (balance <= 0) continue;
    const due = receivable.dueDate ? new Date(`${receivable.dueDate}T00:00:00`) : today;
    const days = Math.floor((today - due) / 86400000);
    const bucket = days <= 0 ? '未到期 / 當期' : days <= 30 ? '逾期 1-30 天' : days <= 60 ? '逾期 31-60 天' : '逾期 61 天以上';
    agingBuckets.set(bucket, (agingBuckets.get(bucket) || 0) + balance);
  }
  const aging = Array.from(agingBuckets.entries());

  const incomeByMonth = new Map();
  for (const payment of postedPayments) {
    const key = `${String(payment.date || '').slice(0, 7) || '未填月份'}｜${accountName(payment.incomeAccountId || 'income_tuition')}`;
    incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + parseNumber(payment.amount));
  }

  return {
    profitLoss,
    cashFlow,
    aging,
    incomeByMonth: Array.from(incomeByMonth.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
  };
}

function syncAccountingForms() {
  const openReceivables = (state.receivables || [])
    .filter((receivable) => receivable.status !== 'void' && parseNumber(receivable.balance) > 0)
    .sort((a, b) => `${a.dueDate || ''} ${a.studentName || ''}`.localeCompare(`${b.dueDate || ''} ${b.studentName || ''}`, 'zh-Hant'));
  elements.paymentReceivable.innerHTML = openReceivables.length
    ? openReceivables.map((receivable) => `
      <option value="${escapeHtml(receivable.id)}">${escapeHtml(receivable.studentName)}｜${escapeHtml(receivable.courseName)}｜未收 ${formatMoney(receivable.balance)}</option>
    `).join('')
    : '<option value="">尚無未收應收</option>';
  elements.paymentReceivable.disabled = !openReceivables.length;

  const assetAccounts = (state.accountingAccounts || []).filter((account) => ['現金', '銀行'].includes(account.type));
  elements.paymentAssetAccount.innerHTML = assetAccounts
    .map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`)
    .join('');
}

function renderAccounting() {
  normalizeAccountingAccounts();
  recomputeAllReceivables();
  syncAccountingForms();
  const summary = accountingSummary();
  elements.accountingSummary.innerHTML = [
    summaryCell('應收總額', summary.receivableTotal),
    summaryCell('已收款', summary.paidTotal),
    summaryCell('未收款', summary.balanceTotal),
    summaryCell('逾期未收', summary.overdueTotal),
    summaryCell('本月收入', summary.monthIncome)
  ].join('');

  elements.accountRows.innerHTML = (state.accountingAccounts || []).map((account) => `
    <tr>
      <td>${escapeHtml(account.code)}</td>
      <td><strong>${escapeHtml(account.name)}</strong></td>
      <td>${escapeHtml(account.type)}</td>
      <td>${escapeHtml(account.purpose)}</td>
    </tr>
  `).join('');

  elements.receivableRows.innerHTML = state.receivables.length
    ? state.receivables
      .slice()
      .sort((a, b) => `${a.status === 'void' ? 'z' : 'a'} ${a.dueDate || ''} ${a.studentName || ''}`.localeCompare(`${b.status === 'void' ? 'z' : 'a'} ${b.dueDate || ''} ${b.studentName || ''}`, 'zh-Hant'))
      .map((receivable) => `
        <tr class="${receivable.status === 'void' ? 'is-void' : ''}">
          <td><strong>${escapeHtml(receivable.studentName)}</strong></td>
          <td>${escapeHtml(receivable.courseName)}</td>
          <td>${escapeHtml(receivable.dueDate || '')}</td>
          <td class="money">${formatMoney(receivable.amount)}</td>
          <td class="money">${formatMoney(receivable.paidAmount)}</td>
          <td class="money">${formatMoney(receivable.balance)}</td>
          <td>${escapeHtml(receivableStatusLabel(receivable.status))}</td>
          <td>
            <select class="inline-select" data-receivable-followup="${escapeHtml(receivable.id)}" ${receivable.status === 'void' ? 'disabled' : ''}>
              ${['未追蹤', '已提醒', '待確認', '不用追'].map((status) => `<option value="${status}" ${receivable.followUpStatus === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
          </td>
          <td>
            <button class="ghost small" type="button" data-fill-payment="${escapeHtml(receivable.id)}" ${receivable.status === 'void' || parseNumber(receivable.balance) <= 0 ? 'disabled' : ''}>收款</button>
            <button class="danger small" type="button" data-void-receivable="${escapeHtml(receivable.id)}" ${receivable.status === 'void' || parseNumber(receivable.paidAmount) > 0 ? 'disabled' : ''}>作廢</button>
          </td>
        </tr>
      `).join('')
    : emptyRow(9);

  elements.paymentLedgerRows.innerHTML = state.paymentLedger.length
    ? state.paymentLedger
      .slice()
      .sort((a, b) => `${b.date || ''} ${b.createdAt || ''}`.localeCompare(`${a.date || ''} ${a.createdAt || ''}`))
      .map((payment) => `
        <tr class="${payment.voidedAt ? 'is-void' : payment.amount < 0 ? 'is-reversal' : ''}">
          <td>${escapeHtml(payment.date || '')}</td>
          <td><strong>${escapeHtml(payment.studentName || '')}</strong></td>
          <td>${escapeHtml(payment.courseName || '')}</td>
          <td>${escapeHtml(payment.method || '')}</td>
          <td>${escapeHtml(accountName(payment.assetAccountId))}</td>
          <td class="money">${formatMoney(payment.amount)}</td>
          <td>${escapeHtml(payment.voidedAt ? '已沖銷' : payment.reversalOf ? '沖銷' : '入帳')}</td>
          <td><button class="danger small" type="button" data-void-payment="${escapeHtml(payment.id)}" ${payment.status !== 'posted' || payment.reversalOf || payment.voidedAt ? 'disabled' : ''}>作廢收款</button></td>
        </tr>
      `).join('')
    : emptyRow(8);

  const reports = buildAccountingReports();
  elements.profitLossReport.innerHTML = renderMiniReport(reports.profitLoss);
  elements.cashFlowReport.innerHTML = renderMiniReport(reports.cashFlow);
  elements.agingReport.innerHTML = renderMiniReport(reports.aging);
  elements.incomeByMonthReport.innerHTML = renderMiniReport(reports.incomeByMonth);

  elements.auditLogRows.innerHTML = state.auditLogs.length
    ? state.auditLogs
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 100)
      .map((log) => `
        <tr>
          <td>${escapeHtml(log.createdAt || '')}</td>
          <td>${escapeHtml(log.user || '')}</td>
          <td>${escapeHtml(log.action || '')}</td>
          <td>${escapeHtml(`${log.entityType || ''} ${log.entityId || ''}`)}</td>
          <td>${escapeHtml(log.note || log.summary || '')}</td>
        </tr>
      `).join('')
    : emptyRow(5);
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
  renderAccounting();
  renderRecords();
  renderManualCourses();
  renderStudentCenter();
  renderStudentMatrix();
  renderStudentOverviews();
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
  await addMembershipEvent(data);
  elements.eventForm.reset();
});

elements.manualTermForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.manualTermForm).entries());
  const label = String(data.label || '').trim();
  if (!label) return;
  const existing = (state.manualTerms || []).find((term) => term.label === label);
  const record = {
    id: existing?.id || nowId('manual_term'),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    label,
    startMonth: data.startMonth || '',
    endMonth: data.endMonth || '',
    note: String(data.note || '').trim()
  };
  if (existing) {
    Object.assign(existing, record);
  } else {
    state.manualTerms.push(record);
  }
  elements.manualTermForm.reset();
  renderAll();
  try {
    await saveCloudRecord('manualTerms', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.manualTeacherForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.manualTeacherForm).entries());
  const name = String(data.name || '').trim();
  if (!name) return;
  const existing = (state.manualTeachers || []).find((teacher) => teacher.name === name);
  const record = {
    id: existing?.id || nowId('manual_teacher'),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name,
    subject: String(data.subject || '').trim(),
    defaultShare: parseNumber(data.defaultShare),
    defaultFixedRate: parseNumber(data.defaultFixedRate),
    contact: String(data.contact || '').trim(),
    note: String(data.note || '').trim()
  };
  if (existing) {
    Object.assign(existing, record);
  } else {
    state.manualTeachers.push(record);
  }
  elements.manualTeacherForm.reset();
  renderAll();
  try {
    await saveCloudRecord('manualTeachers', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.manualStudentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.manualStudentForm).entries());
  const record = {
    id: nowId('manual_student'),
    source: 'manual',
    createdAt: new Date().toISOString(),
    sheet: data.cohort,
    row: '網頁新增',
    selectedCourses: [],
    profile: {
      name: String(data.name || '').trim(),
      highSchool: String(data.highSchool || '').trim(),
      juniorHigh: String(data.juniorHigh || '').trim(),
      grade: String(data.grade || '').trim(),
      motherPhone: String(data.motherPhone || '').trim(),
      fatherPhone: String(data.fatherPhone || '').trim(),
      note: String(data.note || '').trim()
    }
  };
  if (!record.profile.name) return;
  state.manualStudents.push(record);
  elements.manualStudentForm.reset();
  renderAll();
  try {
    await saveCloudRecord('manualStudents', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.manualCourseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.manualCourseForm).entries());
  const record = {
    id: nowId('manual_course'),
    createdAt: new Date().toISOString(),
    cohort: String(data.cohort || '').trim(),
    term: String(data.term || '').trim(),
    courseName: String(data.courseName || '').trim(),
    teacherName: String(data.teacherName || '').trim(),
    defaultTuition: Math.round(parseNumber(data.defaultTuition)),
    sessionCount: Math.round(parseNumber(data.sessionCount)),
    note: String(data.note || '').trim()
  };
  if (!record.courseName) return;
  state.manualCourses.push(record);
  elements.manualCourseForm.reset();
  renderAll();
  try {
    await saveCloudRecord('manualCourses', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.manualEnrollmentCourse.addEventListener('change', () => {
  const course = manualCoursesById().get(elements.manualEnrollmentCourse.value);
  const input = elements.manualEnrollmentForm.elements.tuitionAmount;
  if (course && !input.value.trim()) input.value = course.defaultTuition || '';
});

elements.manualEnrollmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.manualEnrollmentForm).entries());
  const course = manualCoursesById().get(data.courseId);
  const student = buildStudentIndexes().studentsById.get(data.studentId);
  if (!course || !student) return;
  const id = `manual_enrollment_${safeFirebaseKey(data.courseId)}_${safeFirebaseKey(data.studentId)}`;
  const existingIndex = state.manualCourseEnrollments.findIndex((enrollment) => enrollment.id === id);
  const record = {
    id,
    updatedAt: new Date().toISOString(),
    createdAt: existingIndex >= 0 ? state.manualCourseEnrollments[existingIndex].createdAt : new Date().toISOString(),
    courseId: data.courseId,
    courseName: course.courseName,
    studentId: data.studentId,
    studentName: studentName(student),
    tuitionAmount: Math.round(parseNumber(data.tuitionAmount || course.defaultTuition)),
    dueDate: data.dueDate || data.paymentDate || todayIso(),
    paymentDate: data.paymentDate || '',
    note: String(data.note || '').trim()
  };
  if (existingIndex >= 0) {
    state.manualCourseEnrollments[existingIndex] = record;
  } else {
    state.manualCourseEnrollments.push(record);
  }
  elements.manualEnrollmentForm.reset();
  renderAll();
  try {
    await saveCloudRecord('manualCourseEnrollments', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
  await upsertReceivableFromEnrollment(record, course, student);
  renderAll();
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

elements.savePayrollEvent.addEventListener('click', async () => {
  const block = selectedPayrollRosterBlock();
  const studentNameValue = elements.payrollEventStudent.value.trim();
  if (!block || !studentNameValue) {
    setCloudStatus('請先選老師名單區塊並填學生');
    return;
  }
  const candidates = payrollStudentCandidates(studentNameValue, block.title || '');
  await addMembershipEvent({
    courseName: block.title || '',
    month: elements.payrollCalcMonth.value || '',
    date: elements.payrollEventDate.value || '',
    sessionNo: elements.payrollEventSessionNo.value.trim(),
    studentName: studentNameValue,
    studentId: candidates.length === 1 ? candidates[0].id : '',
    action: elements.payrollEventAction.value,
    note: elements.payrollEventNote.value.trim()
  });
  elements.payrollEventStudent.value = '';
  elements.payrollEventDate.value = '';
  elements.payrollEventSessionNo.value = '';
  elements.payrollEventNote.value = '';
  payrollPreview = buildPayrollPreview();
  renderPayrollPreview();
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
      if (element === elements.payrollRosterBlock) {
        const block = selectedPayrollRosterBlock();
        if (block && !elements.payrollCalcTeacher.value.trim()) {
          elements.payrollCalcTeacher.value = block.teacherSheet || '';
        }
        if (block?.source === 'manualCourse') {
          elements.payrollCalcShare.value = block.defaultShare || '50';
          elements.payrollCalcFixedRate.value = block.defaultFixedRate || '';
        }
      }
    } else {
      updatePayrollSessionSummary();
    }
    renderPayrollQuickEvents();
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

elements.exportPayrollPreviewPrint.addEventListener('click', () => {
  if (!payrollPreview) return;
  const popup = window.open('', '_blank');
  const html = buildPayrollPrintHtml(payrollPreview);
  if (!popup) {
    downloadFile('bearhigh-payroll-print.html', html, 'text/html;charset=utf-8');
    setCloudStatus('瀏覽器封鎖列印視窗，已改下載 HTML，可開啟後列印成 PDF');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 350);
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

elements.paymentLedgerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.paymentLedgerForm).entries());
  const receivable = receivableById(data.receivableId);
  if (!receivable || receivable.status === 'void') return;
  const amount = Math.round(parseNumber(data.amount));
  if (amount <= 0) return;
  const payment = {
    id: nowId('payment'),
    receivableId: receivable.id,
    studentId: receivable.studentId,
    studentName: receivable.studentName,
    courseName: receivable.courseName,
    date: data.date || todayIso(),
    amount,
    method: data.method || '轉帳',
    assetAccountId: data.assetAccountId || 'bank_main',
    incomeAccountId: receivable.incomeAccountId || 'income_tuition',
    note: String(data.note || '').trim(),
    status: 'posted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const beforeReceivable = { ...receivable };
  state.paymentLedger.push(payment);
  recomputeReceivable(receivable);
  elements.paymentLedgerForm.reset();
  renderAll();
  await recordAudit('payment', payment.id, 'create', null, payment, '手動記入收款');
  await recordAudit('receivable', receivable.id, 'update', beforeReceivable, receivable, '收款後更新應收餘額');
  renderAll();
  try {
    await savePaymentRecord(payment);
    await saveReceivable(receivable);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.receivableRows.addEventListener('click', async (event) => {
  const fillButton = event.target.closest('[data-fill-payment]');
  if (fillButton) {
    const receivable = receivableById(fillButton.dataset.fillPayment);
    if (!receivable) return;
    elements.paymentReceivable.value = receivable.id;
    elements.paymentLedgerForm.elements.date.value = todayIso();
    elements.paymentLedgerForm.elements.amount.value = Math.max(0, Math.round(parseNumber(receivable.balance))) || '';
    elements.paymentLedgerForm.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  const voidButton = event.target.closest('[data-void-receivable]');
  if (voidButton) {
    const receivable = receivableById(voidButton.dataset.voidReceivable);
    if (!receivable || receivable.status === 'void' || parseNumber(receivable.paidAmount) > 0) return;
    const before = { ...receivable };
    receivable.status = 'void';
    receivable.balance = 0;
    receivable.voidedAt = new Date().toISOString();
    receivable.voidReason = '使用者作廢應收';
    receivable.updatedAt = new Date().toISOString();
    renderAll();
    await recordAudit('receivable', receivable.id, 'void', before, receivable, '作廢應收');
    renderAll();
    try {
      await saveReceivable(receivable);
    } catch (error) {
      setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
    }
  }
});

elements.receivableRows.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-receivable-followup]');
  if (!select) return;
  const receivable = receivableById(select.dataset.receivableFollowup);
  if (!receivable) return;
  const before = { ...receivable };
  receivable.followUpStatus = select.value;
  receivable.updatedAt = new Date().toISOString();
  renderAll();
  await recordAudit('receivable', receivable.id, 'update', before, receivable, '更新催收狀態');
  renderAll();
  try {
    await saveReceivable(receivable);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.paymentLedgerRows.addEventListener('click', async (event) => {
  const voidButton = event.target.closest('[data-void-payment]');
  if (!voidButton) return;
  const payment = (state.paymentLedger || []).find((row) => row.id === voidButton.dataset.voidPayment);
  if (!payment || payment.status !== 'posted' || payment.reversalOf || payment.voidedAt) return;
  const receivable = receivableById(payment.receivableId);
  const paymentBefore = { ...payment };
  const receivableBefore = receivable ? { ...receivable } : null;
  payment.voidedAt = new Date().toISOString();
  payment.voidReason = '使用者作廢收款';
  payment.updatedAt = new Date().toISOString();
  const reversal = {
    id: nowId('reversal'),
    receivableId: payment.receivableId,
    studentId: payment.studentId,
    studentName: payment.studentName,
    courseName: payment.courseName,
    date: todayIso(),
    amount: -Math.abs(parseNumber(payment.amount)),
    method: payment.method,
    assetAccountId: payment.assetAccountId,
    incomeAccountId: payment.incomeAccountId || 'income_tuition',
    note: `沖銷 ${payment.id}`,
    status: 'posted',
    reversalOf: payment.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.paymentLedger.push(reversal);
  if (receivable) recomputeReceivable(receivable);
  renderAll();
  await recordAudit('payment', payment.id, 'void', paymentBefore, payment, '作廢收款');
  await recordAudit('payment', reversal.id, 'reverse', null, reversal, '新增沖銷分錄');
  if (receivable) {
    await recordAudit('receivable', receivable.id, 'update', receivableBefore, receivable, '作廢收款後更新應收餘額');
  }
  renderAll();
  try {
    await savePaymentRecord(payment);
    await savePaymentRecord(reversal);
    if (receivable) await saveReceivable(receivable);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.exportReceivablesCsv.addEventListener('click', () => {
  const rows = [['學生', '課程', '到期日', '應收', '已收', '未收', '狀態', '催收', '備註']];
  for (const receivable of state.receivables || []) {
    rows.push([
      receivable.studentName,
      receivable.courseName,
      receivable.dueDate,
      receivable.amount,
      receivable.paidAmount,
      receivable.balance,
      receivableStatusLabel(receivable.status),
      receivable.followUpStatus,
      receivable.note
    ]);
  }
  downloadFile('bearhigh-receivables.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

elements.exportPaymentLedgerCsv.addEventListener('click', () => {
  const rows = [['日期', '學生', '課程', '付款方式', '入帳科目', '金額', '狀態', '沖銷原收款', '備註']];
  for (const payment of state.paymentLedger || []) {
    rows.push([
      payment.date,
      payment.studentName,
      payment.courseName,
      payment.method,
      accountName(payment.assetAccountId),
      payment.amount,
      payment.voidedAt ? '已沖銷' : payment.status,
      payment.reversalOf || '',
      payment.note
    ]);
  }
  downloadFile('bearhigh-payment-ledger.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

elements.exportAccountingReportsCsv.addEventListener('click', () => {
  const reports = buildAccountingReports();
  const rows = [['報表', '項目', '金額']];
  for (const [label, value] of reports.profitLoss) rows.push(['損益表', label, value]);
  for (const [label, value] of reports.cashFlow) rows.push(['現金流', label, value]);
  for (const [label, value] of reports.aging) rows.push(['應收帳齡', label, value]);
  for (const [label, value] of reports.incomeByMonth) rows.push(['收入分科目/月報', label, value]);
  downloadFile('bearhigh-accounting-reports.csv', toCsv(rows), 'text/csv;charset=utf-8');
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

function renderStudentViews() {
  renderStudentCenter();
  renderStudentMatrix();
  renderStudentOverviews();
  renderClassRoster();
}

[
  elements.studentKeyword,
  elements.studentSheetFilter,
  elements.studentCourseFilter,
  elements.studentPaymentFilter,
  elements.studentDuplicateOnly
].forEach((element) => {
  element.addEventListener('input', renderStudentViews);
  element.addEventListener('change', renderStudentViews);
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
  if (!getStudents().length) return;
  const { nameCounts, tuitionByStudent } = buildStudentIndexes();
  const manualCourseMap = manualCoursesById();
  const enrollmentMap = manualEnrollmentsByStudent();
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
      [
        ...(student.selectedCourses || []).map(courseLabel),
        ...(enrollmentMap.get(student.id) || [])
          .map((enrollment) => manualCourseMap.get(enrollment.courseId))
          .filter(Boolean)
          .map(manualCourseLabel)
      ].join(' / '),
      tuitionEntries.length,
      studentEffectivePaymentState(student.id, tuitionEntries).label,
      nameCounts.get(studentName(student)) || 0
    ]);
  }

  downloadFile('bearhigh-filtered-students.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

document.querySelector('#exportGradeSummaryCsv').addEventListener('click', () => {
  if (!getStudents().length) return;
  const { tuitionByStudent } = buildStudentIndexes();
  const manualCourseMap = manualCoursesById();
  const enrollmentMap = manualEnrollmentsByStudent();
  const rows = [['分頁/年級', '學生', '學校', '課程', '收費摘要', '總學收合計', '繳費狀態']];
  for (const student of getStudents()) {
    const tuitionEntries = tuitionByStudent.get(student.id) || [];
    const sheet = elements.studentSheetFilter.value;
    if (sheet && student.sheet !== sheet) continue;
    const manualEnrollments = enrollmentMap.get(student.id) || [];
    const manualTuitionText = manualEnrollments.map((enrollment) => {
      const course = manualCourseMap.get(enrollment.courseId);
      return `${course ? manualCourseLabel(course) : enrollment.courseName} ${formatMoney(parseNumber(enrollment.tuitionAmount))}`;
    }).join('；');
    rows.push([
      student.sheet,
      studentName(student),
      studentSchool(student),
      [
        ...(student.selectedCourses || []).map(courseLabel),
        ...manualEnrollments.map((enrollment) => manualCourseMap.get(enrollment.courseId)).filter(Boolean).map(manualCourseLabel)
      ].join(' / '),
      [tuitionSummaryText(tuitionEntries, 8), manualTuitionText].filter(Boolean).join('；'),
      tuitionTotal(tuitionEntries) + studentManualTuitionTotal(student.id),
      studentEffectivePaymentState(student.id, tuitionEntries).label
    ]);
  }
  downloadFile('bearhigh-grade-summary.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

document.querySelector('#exportCourseSummaryCsv').addEventListener('click', () => {
  if (!getStudents().length) return;
  const { tuitionByStudent } = buildStudentIndexes();
  const manualCourseMap = manualCoursesById();
  const enrollmentMap = manualEnrollmentsByStudent();
  const rows = [['班級/課程', '分頁', '學生', '學校', '對應收費', '收費金額', '繳費狀態']];
  const selectedCourse = elements.studentCourseFilter.value;
  for (const student of getStudents()) {
    for (const course of student.selectedCourses || []) {
      const key = courseKey(course);
      if (selectedCourse && key !== selectedCourse) continue;
      const tuitionEntries = tuitionByStudent.get(student.id) || [];
      const courseFee = courseTuitionForStudent(student, key, tuitionEntries);
      rows.push([
        courseLabel(course),
        student.sheet,
        studentName(student),
        studentSchool(student),
        courseFee?.label || '',
        courseFee?.amount || '',
        studentEffectivePaymentState(student.id, tuitionEntries).label
      ]);
    }
    for (const enrollment of enrollmentMap.get(student.id) || []) {
      const course = manualCourseMap.get(enrollment.courseId);
      const key = manualCourseKey(enrollment.courseId);
      if (selectedCourse && key !== selectedCourse) continue;
      rows.push([
        course ? manualCourseLabel(course) : enrollment.courseName,
        course?.cohort || student.sheet,
        studentName(student),
        studentSchool(student),
        enrollment.paymentDate ? `${formatMoney(parseNumber(enrollment.tuitionAmount))} / ${enrollment.paymentDate}` : formatMoney(parseNumber(enrollment.tuitionAmount)),
        parseNumber(enrollment.tuitionAmount),
        studentEffectivePaymentState(student.id, tuitionEntries).label
      ]);
    }
  }
  downloadFile('bearhigh-course-summary.csv', toCsv(rows), 'text/csv;charset=utf-8');
});

document.querySelector('#exportStudentMatrixCsv').addEventListener('click', () => {
  if (!getStudents().length) return;
  const { rows, courseColumns, feeColumns, tuitionByStudent } = filteredStudentMatrixData();
  const header = [
    '分頁',
    '列',
    '姓名',
    '高中/學校',
    '國中',
    '年級',
    '繳費狀態',
    '總學收',
    ...courseColumns.map((column) => `課程｜${column.label}`),
    ...feeColumns.map((column) => `收費｜${column.label}`)
  ];
  const csvRows = [header];
  for (const student of rows) {
    const tuitionEntries = tuitionByStudent.get(student.id) || [];
    const courseSet = new Set((student.selectedCourses || []).map(courseKey));
    for (const enrollment of manualEnrollmentsByStudent().get(student.id) || []) {
      courseSet.add(manualCourseKey(enrollment.courseId));
    }
    const feeByKey = new Map(tuitionEntries.map((entry) => [`${entry.column}|${entry.header}|${entry.kind}`, entry]));
    for (const enrollment of manualEnrollmentsByStudent().get(student.id) || []) {
      feeByKey.set(`manualFee:${enrollment.courseId}`, {
        kind: 'manual',
        value: [
          formatMoney(parseNumber(enrollment.tuitionAmount)),
          enrollment.paymentDate || ''
        ].filter(Boolean).join(' / ')
      });
    }
    csvRows.push([
      student.sheet,
      student.row,
      studentName(student),
      studentSchool(student),
      student.profile?.juniorHigh || '',
      student.profile?.grade || '',
      studentEffectivePaymentState(student.id, tuitionEntries).label,
      tuitionTotal(tuitionEntries) + studentManualTuitionTotal(student.id),
      ...courseColumns.map((column) => courseSet.has(column.key) ? '✓' : ''),
      ...feeColumns.map((column) => tuitionEntryDisplayValue(feeByKey.get(column.key)))
    ]);
  }
  downloadFile('bearhigh-student-matrix.csv', toCsv(csvRows), 'text/csv;charset=utf-8');
});

document.querySelector('#exportClassRosterCsv').addEventListener('click', () => {
  const course = elements.studentCourseFilter.value;
  if (!course || !getStudents().length) return;
  const rows = [['課程', '學生ID', '學生', '分頁', '列', '學校', '收費', '繳費狀態', 'CRM狀態']];
  const courseName = studentCourseLabelForKey(course);
  for (const { student, tuitionEntries } of rosterRowsForCurrentCourse()) {
    const manualEnrollment = isManualCourseKey(course) ? manualEnrollmentForStudentCourse(student.id, manualCourseIdFromKey(course)) : null;
    const courseFee = manualEnrollment
      ? { label: `${formatMoney(parseNumber(manualEnrollment.tuitionAmount))}${manualEnrollment.paymentDate ? ` / ${manualEnrollment.paymentDate}` : ''}` }
      : courseTuitionForStudent(student, course, tuitionEntries);
    rows.push([
      courseName,
      student.id,
      studentName(student),
      student.sheet,
      student.row,
      studentSchool(student),
      courseFee?.label || tuitionSummaryText(tuitionEntries, 1),
      studentEffectivePaymentState(student.id, tuitionEntries).label,
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
  state.manualStudents.splice(0);
  state.manualTerms.splice(0);
  state.manualTeachers.splice(0);
  state.manualCourses.splice(0);
  state.manualCourseEnrollments.splice(0);
  state.accountingAccounts = defaultAccountingAccounts();
  state.receivables.splice(0);
  state.paymentLedger.splice(0);
  state.auditLogs.splice(0);
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
  signInWithPopup(auth, googleProvider).catch((error) => {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error?.code)) {
      elements.loginGateStatus.textContent = '改用跳轉登入';
      setCloudStatus('改用跳轉登入');
      return signInWithRedirect(auth, googleProvider);
    }
    showAuthError(error);
    return null;
  });
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
  showAuthError(error);
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

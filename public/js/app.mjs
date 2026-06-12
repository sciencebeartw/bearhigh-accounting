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
  set,
  update
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
import { mergeCleanTeacherRows } from './clean-teacher-rows.mjs';

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
let selectedMasterCourseId = '';
let selectedMasterTeacherId = '';
let selectedCleanStudentId = '';
let selectedCleanTeacherCourseId = '';
let cleanStudentSelectionTouched = false;
let masterImportPreview = null;
let payrollPreview = null;
let payrollSettlement = null;
let sessionPlanEditorKey = '';

state.tuitionPayments ||= [];
state.membershipEvents ||= [];
state.payrollRuns ||= [];
state.payrollSettlements ||= [];
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
  monthlyWorkflowBuildFromImport: document.querySelector('#monthlyWorkflowBuildFromImport'),
  monthlyWorkflowBuildSettlement: document.querySelector('#monthlyWorkflowBuildSettlement'),
  monthlyWorkflowChecklist: document.querySelector('#monthlyWorkflowChecklist'),
  monthlyWorkflowCourseRows: document.querySelector('#monthlyWorkflowCourseRows'),
  monthlyWorkflowMonth: document.querySelector('#monthlyWorkflowMonth'),
  monthlyWorkflowOpenMovement: document.querySelector('#monthlyWorkflowOpenMovement'),
  monthlyWorkflowOpenPayroll: document.querySelector('#monthlyWorkflowOpenPayroll'),
  monthlyWorkflowPrintSettlement: document.querySelector('#monthlyWorkflowPrintSettlement'),
  monthlyWorkflowSaveSettlement: document.querySelector('#monthlyWorkflowSaveSettlement'),
  monthlyWorkflowSummary: document.querySelector('#monthlyWorkflowSummary'),
  monthlyWorkflowTeacherRows: document.querySelector('#monthlyWorkflowTeacherRows'),
  cleanMovementCourse: document.querySelector('#cleanMovementCourse'),
  cleanMovementForm: document.querySelector('#cleanMovementForm'),
  cleanMovementRows: document.querySelector('#cleanMovementRows'),
  cleanMovementStudent: document.querySelector('#cleanMovementStudent'),
  cleanMovementSummary: document.querySelector('#cleanMovementSummary'),
  cleanPayrollMonth: document.querySelector('#cleanPayrollMonth'),
  cleanPayrollRows: document.querySelector('#cleanPayrollRows'),
  cleanPayrollSummary: document.querySelector('#cleanPayrollSummary'),
  cleanPayrollTeacher: document.querySelector('#cleanPayrollTeacher'),
  cleanStudentArchive: document.querySelector('#cleanStudentArchive'),
  cleanStudentCourseFilter: document.querySelector('#cleanStudentCourseFilter'),
  cleanStudentCourseRows: document.querySelector('#cleanStudentCourseRows'),
  cleanStudentDetail: document.querySelector('#cleanStudentDetail'),
  cleanStudentForm: document.querySelector('#cleanStudentForm'),
  cleanStudentFormCohort: document.querySelector('#cleanStudentFormCohort'),
  cleanStudentGradeFilter: document.querySelector('#cleanStudentGradeFilter'),
  cleanStudentNew: document.querySelector('#cleanStudentNew'),
  cleanStudentSearch: document.querySelector('#cleanStudentSearch'),
  cleanStudentSelect: document.querySelector('#cleanStudentSelect'),
  cleanStudentSummary: document.querySelector('#cleanStudentSummary'),
  cleanStudentTermFilter: document.querySelector('#cleanStudentTermFilter'),
  cleanTeacherArchive: document.querySelector('#cleanTeacherArchive'),
  cleanTeacherCourseDetail: document.querySelector('#cleanTeacherCourseDetail'),
  cleanTeacherCourseRows: document.querySelector('#cleanTeacherCourseRows'),
  cleanTeacherForm: document.querySelector('#cleanTeacherForm'),
  cleanTeacherNew: document.querySelector('#cleanTeacherNew'),
  cleanTeacherSearch: document.querySelector('#cleanTeacherSearch'),
  cleanTeacherSelect: document.querySelector('#cleanTeacherSelect'),
  cleanTeacherSummary: document.querySelector('#cleanTeacherSummary'),
  cleanTeacherTermFilter: document.querySelector('#cleanTeacherTermFilter'),
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
  payrollCloseRows: document.querySelector('#payrollCloseRows'),
  payrollCloseSummary: document.querySelector('#payrollCloseSummary'),
  payrollSettlementClassRows: document.querySelector('#payrollSettlementClassRows'),
  payrollSettlementHeadRate: document.querySelector('#payrollSettlementHeadRate'),
  payrollSettlementHourlyRate: document.querySelector('#payrollSettlementHourlyRate'),
  payrollSettlementHours: document.querySelector('#payrollSettlementHours'),
  payrollSettlementMinBase: document.querySelector('#payrollSettlementMinBase'),
  payrollSettlementMinBonus: document.querySelector('#payrollSettlementMinBonus'),
  payrollSettlementMinThreshold: document.querySelector('#payrollSettlementMinThreshold'),
  payrollSettlementMonth: document.querySelector('#payrollSettlementMonth'),
  payrollSettlementArchiveRows: document.querySelector('#payrollSettlementArchiveRows'),
  payrollSettlementScienceRate: document.querySelector('#payrollSettlementScienceRate'),
  payrollSettlementShare: document.querySelector('#payrollSettlementShare'),
  payrollSettlementSummary: document.querySelector('#payrollSettlementSummary'),
  payrollSettlementTeacherRows: document.querySelector('#payrollSettlementTeacherRows'),
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
  payrollWorkflowRows: document.querySelector('#payrollWorkflowRows'),
  payrollWorkflowSummary: document.querySelector('#payrollWorkflowSummary'),
  previewPayrollRun: document.querySelector('#previewPayrollRun'),
  savePayrollEvent: document.querySelector('#savePayrollEvent'),
  savePayrollSessionPlan: document.querySelector('#savePayrollSessionPlan'),
  savePayrollPreview: document.querySelector('#savePayrollPreview'),
  exportPayrollPreviewCsv: document.querySelector('#exportPayrollPreviewCsv'),
  exportPayrollPreviewPrint: document.querySelector('#exportPayrollPreviewPrint'),
  exportPayrollPreviewXls: document.querySelector('#exportPayrollPreviewXls'),
  buildPayrollSettlement: document.querySelector('#buildPayrollSettlement'),
  buildPayrollSettlementFromImport: document.querySelector('#buildPayrollSettlementFromImport'),
  printPayrollSettlement: document.querySelector('#printPayrollSettlement'),
  savePayrollSettlement: document.querySelector('#savePayrollSettlement'),
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
  batchPaymentAssetAccount: document.querySelector('#batchPaymentAssetAccount'),
  batchPaymentForm: document.querySelector('#batchPaymentForm'),
  batchPaymentPreview: document.querySelector('#batchPaymentPreview'),
  batchPaymentReceivables: document.querySelector('#batchPaymentReceivables'),
  batchPaymentStudent: document.querySelector('#batchPaymentStudent'),
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
  refundPreview: document.querySelector('#refundPreview'),
  refundReceivable: document.querySelector('#refundReceivable'),
  tuitionRecords: document.querySelector('#tuitionRecords'),
  withdrawalRefundForm: document.querySelector('#withdrawalRefundForm'),
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
  manualImportCompareRows: document.querySelector('#manualImportCompareRows'),
  manualImportCompareSummary: document.querySelector('#manualImportCompareSummary'),
  manualMasterRows: document.querySelector('#manualMasterRows'),
  manualStudentCohort: document.querySelector('#manualStudentCohort'),
  manualStudentForm: document.querySelector('#manualStudentForm'),
  manualTeacherForm: document.querySelector('#manualTeacherForm'),
  manualTeacherOptions: document.querySelector('#manualTeacherOptions'),
  manualTermForm: document.querySelector('#manualTermForm'),
  manualTermOptions: document.querySelector('#manualTermOptions'),
  masterCourseArchivedOnly: document.querySelector('#masterCourseArchivedOnly'),
  masterCourseDetail: document.querySelector('#masterCourseDetail'),
  masterCourseKeyword: document.querySelector('#masterCourseKeyword'),
  masterCourseRows: document.querySelector('#masterCourseRows'),
  masterCourseSummary: document.querySelector('#masterCourseSummary'),
  masterCourseTeacherFilter: document.querySelector('#masterCourseTeacherFilter'),
  masterCourseTermFilter: document.querySelector('#masterCourseTermFilter'),
  masterImportRows: document.querySelector('#masterImportRows'),
  masterImportSummary: document.querySelector('#masterImportSummary'),
  masterTeacherArchivedOnly: document.querySelector('#masterTeacherArchivedOnly'),
  masterTeacherDetail: document.querySelector('#masterTeacherDetail'),
  masterTeacherKeyword: document.querySelector('#masterTeacherKeyword'),
  masterTeacherRows: document.querySelector('#masterTeacherRows'),
  masterTeacherSummary: document.querySelector('#masterTeacherSummary'),
  masterTeacherTermFilter: document.querySelector('#masterTeacherTermFilter'),
  previewMasterImport: document.querySelector('#previewMasterImport'),
  applyMasterImport: document.querySelector('#applyMasterImport'),
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
      payrollSettlements: [],
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
      payrollSettlements: [],
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
    payrollSettlements: state.payrollSettlements,
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
  const draftCount = state.tuitionPayments.length +
    state.membershipEvents.length +
    state.payrollRuns.length +
    state.payrollSettlements.length +
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
  try {
    localStorage.setItem(storageKey, JSON.stringify(persistedState));
    elements.storageStatus.textContent = `本機草稿 ${draftCount} 筆`;
  } catch (error) {
    elements.storageStatus.textContent = `雲端主檔 ${draftCount} 筆`;
    setCloudStatus(`本機暫存空間不足，資料仍以雲端主檔為準：${error.name || error.message}`);
  }
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
  if (!elements.pricingVersion || !elements.packageId || !elements.courseOptions) return;
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
  if (!elements.tuitionForm) return;
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
  saveState();
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

function importedPayrollDateToIso(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return '';
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function getStudents() {
  const byId = new Map();
  for (const student of state.importSnapshot?.students || []) {
    if (student?.id) byId.set(student.id, student);
  }
  for (const student of state.manualStudents || []) {
    if (student?.id) byId.set(student.id, student);
  }
  return Array.from(byId.values()).filter((student) => !student.archived);
}

function getAllStudents() {
  const byId = new Map();
  for (const student of state.importSnapshot?.students || []) {
    if (student?.id) byId.set(student.id, student);
  }
  for (const student of state.manualStudents || []) {
    if (student?.id) byId.set(student.id, student);
  }
  return Array.from(byId.values());
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

function normalizedCompareText(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function studentPhones(student) {
  const profile = student?.profile || {};
  return new Set([profile.motherPhone, profile.fatherPhone, profile.phone, profile.phone1]
    .map(normalizedCompareText)
    .filter(Boolean));
}

function studentsLikelySame(left, right) {
  const leftName = normalizedCompareText(studentName(left));
  const rightName = normalizedCompareText(studentName(right));
  if (!leftName || leftName !== rightName) return false;
  const leftSchool = normalizedCompareText(studentSchool(left));
  const rightSchool = normalizedCompareText(studentSchool(right));
  if (leftSchool && rightSchool && leftSchool === rightSchool) return true;
  const rightPhones = studentPhones(right);
  return Array.from(studentPhones(left)).some((phone) => rightPhones.has(phone));
}

function studentCourseSubjects(student) {
  return new Set((student?.selectedCourses || [])
    .map((course) => canonicalSubject(courseLabel(course)))
    .filter(Boolean));
}

function manualCourseSubject(course) {
  return canonicalSubject(`${course?.courseName || ''} ${course?.teacherName || ''} ${course?.subject || ''}`);
}

function manualImportCompareRows() {
  const students = getStudents();
  const { studentsById } = buildStudentIndexes();
  const importedStudents = students.filter((student) => student.source !== 'manual');
  const rows = [];

  for (const enrollment of state.manualCourseEnrollments || []) {
    const student = studentsById.get(enrollment.studentId);
    if (!student) continue;
    const course = manualCoursesById().get(enrollment.courseId);
    const courseSubject = manualCourseSubject(course);
    const sameNameImported = importedStudents.filter((candidate) => normalizedCompareText(studentName(candidate)) === normalizedCompareText(studentName(student)));
    const samePersonImported = sameNameImported.filter((candidate) => studentsLikelySame(student, candidate));
    const courseMatches = sameNameImported.filter((candidate) => studentCourseSubjects(candidate).has(courseSubject));
    let status = '網頁新增';
    let matched = '';
    let note = '匯入資料尚未看到同名學生，可視為新網頁資料。';

    if (student.source !== 'manual') {
      status = '匯入生加網頁課';
      matched = `${student.sheet} 列 ${student.row}`;
      note = '這筆網頁課程直接掛在匯入學生上，適合日常新增科目。';
    } else if (sameNameImported.length > 1 && !samePersonImported.length) {
      status = '同名需確認';
      matched = sameNameImported.map((candidate) => `${candidate.sheet} 列 ${candidate.row}`).slice(0, 3).join('、');
      note = '匯入資料有多位同名學生，請用學校或電話確認是否同一人。';
    } else if (courseMatches.length) {
      status = '疑似重複報名';
      matched = courseMatches.map((candidate) => `${candidate.sheet} 列 ${candidate.row}`).slice(0, 3).join('、');
      note = '同名匯入學生已有相同科目，請確認是不是把 Numbers 既有報名又在網頁新增一次。';
    } else if (samePersonImported.length) {
      status = '疑似同人新科';
      matched = samePersonImported.map((candidate) => `${candidate.sheet} 列 ${candidate.row}`).slice(0, 3).join('、');
      note = '看起來是同一位學生，但這門網頁課程在匯入資料中未看到，可作為新增科目。';
    } else if (sameNameImported.length === 1) {
      status = '同名可參考';
      matched = `${sameNameImported[0].sheet} 列 ${sameNameImported[0].row}`;
      note = '匯入資料有一位同名學生，但學校/電話未完全對上，請人工確認。';
    }

    rows.push({
      status,
      studentName: studentName(student),
      manualSheet: student.sheet || '',
      manualCourse: course ? manualCourseLabel(course) : enrollment.courseName || '',
      matched,
      note
    });
  }

  const enrolledManualStudentIds = new Set((state.manualCourseEnrollments || []).map((enrollment) => enrollment.studentId));
  for (const student of state.manualStudents || []) {
    if (enrolledManualStudentIds.has(student.id)) continue;
    const sameNameImported = importedStudents.filter((candidate) => normalizedCompareText(studentName(candidate)) === normalizedCompareText(studentName(student)));
    rows.push({
      status: sameNameImported.length ? '同名未報課' : '新網頁學生',
      studentName: studentName(student),
      manualSheet: student.sheet || '',
      manualCourse: '尚未加入科目',
      matched: sameNameImported.map((candidate) => `${candidate.sheet} 列 ${candidate.row}`).slice(0, 3).join('、'),
      note: sameNameImported.length ? '只有新增學生，尚未新增科目；匯入資料有同名可對照。' : '網頁新增學生尚未加入科目。'
    });
  }

  return rows.sort((a, b) => {
    const order = {
      '疑似重複報名': 0,
      '同名需確認': 1,
      '同名可參考': 2,
      '疑似同人新科': 3,
      '匯入生加網頁課': 4,
      '網頁新增': 5,
      '新網頁學生': 6,
      '同名未報課': 7
    };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      a.studentName.localeCompare(b.studentName, 'zh-Hant') ||
      a.manualCourse.localeCompare(b.manualCourse, 'zh-Hant');
  });
}

function normalizedCourseEntriesForStudent(student) {
  let currentGroup = '';
  return (student?.selectedCourses || []).map((course) => {
    currentGroup = course.group || currentGroup;
    return {
      ...course,
      group: course.group || currentGroup,
      normalizedGroup: currentGroup,
      term: inferTermLabel(currentGroup, student?.sheet),
      subject: canonicalSubject(course.header || ''),
      label: [currentGroup, course.header, course.column ? `欄 ${course.column}` : ''].filter(Boolean).join(' / ')
    };
  });
}

function inferTermLabel(group, fallbackSheet = '') {
  const text = String(group || fallbackSheet || '').trim();
  const yearMatch = text.match(/(\d{3})\s*學年度/);
  const semester = /下學期|下期/.test(text) ? '下學期' : (/上學期|暑期|上期/.test(text) ? '上學期' : '');
  if (yearMatch && semester) return `${yearMatch[1]}學年度${semester}`;
  if (yearMatch) return `${yearMatch[1]}學年度`;
  return text || '未分學期';
}

function normalizeMasterCourseTerm(term, cohort = '') {
  const raw = String(term || '').trim();
  const cohortYear = String(cohort || '').match(/(\d{3})\s*學年度/);
  if (raw && !/(\d{3})\s*學年度/.test(raw) && cohortYear && raw.startsWith('學年度')) {
    return raw.replace(/^學年度/, `${cohortYear[1]}學年度`);
  }
  return raw || (cohortYear ? `${cohortYear[1]}學年度` : '未分學期');
}

function compactTeacherTermSummary(teacher) {
  const terms = Array.from(new Set((teacher.courses || [])
    .map((course) => course.term)
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  if (!terms.length) return '';
  const shown = terms.slice(0, 2).join('、');
  return terms.length > 2 ? `${shown} 等` : shown;
}

function stableMasterId(prefix, parts) {
  return `${prefix}_${safeFirebaseKey(parts.filter(Boolean).join('_')).slice(0, 120)}`;
}

function importedTeacherNameForCourse(courseName, term, sheet) {
  const text = normalizedCompareText(`${courseName || ''} ${term || ''} ${sheet || ''}`);
  const match = getTeacherRosterBlocks().find((block) => {
    const haystack = normalizedCompareText(`${block.title || ''} ${block.sheet || ''} ${block.teacherSheet || ''}`);
    return haystack.includes(normalizedCompareText(courseName || '')) || text.includes(normalizedCompareText(block.title || ''));
  });
  return match?.teacherSheet || '';
}

function buildMasterImportPlan() {
  const plan = {
    students: [],
    terms: [],
    teachers: [],
    courses: [],
    enrollments: [],
    receivables: [],
    stats: {
      students: { added: 0, existing: 0, skipped: 0 },
      terms: { added: 0, existing: 0, skipped: 0 },
      teachers: { added: 0, existing: 0, skipped: 0 },
      courses: { added: 0, existing: 0, skipped: 0 },
      enrollments: { added: 0, existing: 0, skipped: 0 },
      receivables: { added: 0, existing: 0, skipped: 0 }
    }
  };
  const snapshot = state.importSnapshot;
  if (!snapshot?.students?.length) return plan;

  const existingStudents = new Set((state.manualStudents || []).map((student) => student.id));
  const existingTerms = new Set((state.manualTerms || []).map((term) => term.label));
  const existingTeachers = new Set((state.manualTeachers || []).map((teacher) => teacher.name));
  const existingCourses = new Set((state.manualCourses || []).map((course) => course.id));
  const existingEnrollments = new Set((state.manualCourseEnrollments || []).map((enrollment) => enrollment.id));
  const existingReceivables = new Set((state.receivables || []).map((receivable) => receivable.id));
  const generatedTerms = new Set();
  const generatedTeachers = new Set();
  const generatedCourses = new Map();
  const tuitionEntries = getTuitionEntries();

  for (const student of snapshot.students || []) {
    if (!student?.id || !studentName(student)) {
      plan.stats.students.skipped += 1;
      continue;
    }
    const studentRecord = {
      id: student.id,
      source: 'masterImport',
      sourceStudentId: student.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sheet: student.sheet || '',
      row: student.row || '',
      selectedCourses: student.selectedCourses || [],
      profile: {
        ...(student.profile || {}),
        name: studentName(student),
        highSchool: studentSchool(student),
        note: student.profile?.note || ''
      }
    };
    plan.students.push(studentRecord);
    plan.stats.students[existingStudents.has(studentRecord.id) ? 'existing' : 'added'] += 1;

    for (const courseEntry of normalizedCourseEntriesForStudent(student)) {
      if (!courseEntry.header) continue;
      const term = courseEntry.term || '未分學期';
      generatedTerms.add(term);
      const courseName = courseEntry.header;
      const courseId = stableMasterId('course', [student.sheet, term, courseEntry.normalizedGroup, courseName, courseEntry.column]);
      const teacherName = importedTeacherNameForCourse(courseName, term, student.sheet);
      if (teacherName) generatedTeachers.add(teacherName);
      if (!generatedCourses.has(courseId)) {
        generatedCourses.set(courseId, {
          id: courseId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          cohort: student.sheet || '',
          term,
          subject: courseEntry.subject,
          courseName,
          teacherName,
          defaultTuition: 21600,
          refundUnitPrice: 1000,
          sessionCount: 24,
          source: 'masterImport',
          sourceColumn: courseEntry.column || '',
          sourceGroup: courseEntry.normalizedGroup || '',
          note: courseEntry.label
        });
      }
      const tuition = courseTuitionForStudent(student, courseKey(courseEntry), tuitionEntries) || {};
      const tuitionAmount = Math.round(parseNumber(tuition.amount || 0));
      const enrollmentId = `manual_enrollment_${safeFirebaseKey(courseId)}_${safeFirebaseKey(student.id)}`;
      const enrollment = {
        id: enrollmentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        courseId,
        courseName,
        studentId: student.id,
        studentName: studentName(student),
        tuitionAmount,
        originalAmount: tuitionAmount,
        discountAmount: 0,
        packageDiscountAmount: 0,
        voucherAmount: 0,
        dueDate: todayIso(),
        paymentDate: '',
        status: 'active',
        source: 'masterImport',
        note: tuition.label || courseEntry.label
      };
      plan.enrollments.push(enrollment);
      plan.stats.enrollments[existingEnrollments.has(enrollmentId) ? 'existing' : 'added'] += 1;
      const receivableId = receivableIdForEnrollment(enrollmentId);
      const receivable = {
        id: receivableId,
        enrollmentId,
        studentId: student.id,
        studentName: studentName(student),
        courseId,
        courseName,
        dueDate: todayIso(),
        originalAmount: tuitionAmount,
        amount: tuitionAmount,
        paidAmount: 0,
        balance: tuitionAmount,
        status: tuitionAmount > 0 ? 'open' : 'void',
        followUpStatus: tuitionAmount > 0 ? '待確認' : '免建立',
        incomeAccountId: 'income_tuition',
        note: tuition.label || '匯入主檔自動建立',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      plan.receivables.push(receivable);
      plan.stats.receivables[existingReceivables.has(receivableId) ? 'existing' : (tuitionAmount > 0 ? 'added' : 'skipped')] += 1;
    }
  }

  for (const term of generatedTerms) {
    const record = {
      id: stableMasterId('manual_term', [term]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      label: term,
      startMonth: '',
      endMonth: '',
      note: '匯入主檔自動建立'
    };
    plan.terms.push(record);
    plan.stats.terms[existingTerms.has(term) ? 'existing' : 'added'] += 1;
  }
  for (const teacherName of generatedTeachers) {
    const record = {
      id: stableMasterId('manual_teacher', [teacherName]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: teacherName,
      subject: canonicalSubject(teacherName),
      defaultShare: 50,
      defaultFixedRate: 0,
      contact: '',
      note: '匯入主檔自動建立'
    };
    plan.teachers.push(record);
    plan.stats.teachers[existingTeachers.has(teacherName) ? 'existing' : 'added'] += 1;
  }
  for (const course of generatedCourses.values()) {
    plan.courses.push(course);
    plan.stats.courses[existingCourses.has(course.id) ? 'existing' : 'added'] += 1;
  }
  return plan;
}

function mergeByIdIntoState(key, rows) {
  const existing = new Map((state[key] || []).map((row) => [row.id, row]));
  for (const row of rows || []) {
    if (!row?.id) continue;
    existing.set(row.id, {
      ...(existing.get(row.id) || {}),
      ...row,
      createdAt: existing.get(row.id)?.createdAt || row.createdAt
    });
  }
  state[key] = Array.from(existing.values());
}

function masterCourseRowsData() {
  const enrollments = state.manualCourseEnrollments || [];
  const receivableMap = new Map((state.receivables || []).map((receivable) => [receivable.enrollmentId, receivable]));
  return (state.manualCourses || []).map((course) => {
    const courseEnrollments = enrollments.filter((enrollment) => enrollment.courseId === course.id && enrollment.status !== 'archived');
    const feeTotal = courseEnrollments.reduce((sum, enrollment) => {
      const receivable = receivableMap.get(enrollment.id);
      return sum + parseNumber(receivable?.amount ?? enrollment.tuitionAmount);
    }, 0);
    return {
      ...course,
      term: normalizeMasterCourseTerm(course.term || course.termLabel, course.cohort || course.sheet),
      enrollmentCount: courseEnrollments.length,
      feeTotal,
      enrollments: courseEnrollments
    };
  });
}

function masterTeacherRowsData() {
  const courses = masterCourseRowsData();
  const rows = new Map();
  for (const teacher of state.manualTeachers || []) {
    rows.set(teacher.id, {
      ...teacher,
      courseCount: 0,
      enrollmentCount: 0,
      feeTotal: 0,
      courses: []
    });
  }
  for (const course of courses) {
    const teacherName = String(course.teacherName || '未指定老師').trim();
    const existing = Array.from(rows.values()).find((row) => row.name === teacherName);
    const id = existing?.id || stableMasterId('virtual_teacher', [teacherName]);
    const row = rows.get(id) || {
      id,
      name: teacherName,
      subject: canonicalSubject(teacherName),
      defaultShare: 50,
      defaultFixedRate: 0,
      archived: false,
      courseCount: 0,
      enrollmentCount: 0,
      feeTotal: 0,
      courses: []
    };
    row.courseCount += 1;
    row.enrollmentCount += course.enrollmentCount;
    row.feeTotal += course.feeTotal;
    row.courses.push(course);
    rows.set(id, row);
  }
  return Array.from(rows.values());
}

const cohortGradeLabels = new Map([
  ['112', '112（升高一）'],
  ['111', '111（高一）'],
  ['110', '110（高二）'],
  ['109', '109（高三）'],
  ['108', '108（已畢業）']
]);

function studentCohortCode(student) {
  const text = `${student?.sheet || ''} ${student?.profile?.grade || ''} ${student?.profile?.note || ''}`;
  const match = text.match(/\b(10[8-9]|11[0-2])\b/);
  return match?.[1] || student?.sheet || '';
}

function studentCohortLabel(student) {
  if (student?.sheet) return student.sheet;
  const code = studentCohortCode(student);
  return cohortGradeLabels.get(code) || code || '未分年級';
}

function studentCohortFilterValue(student) {
  return student?.sheet || studentCohortCode(student);
}

function cleanStudentSearchText(student) {
  const { tuitionByStudent } = buildStudentIndexes();
  return studentSearchText(student, tuitionByStudent.get(student.id) || []);
}

function cleanStudentActualCourseCount(student, tuitionEntries = [], manualEnrollments = []) {
  const activeManualEnrollments = manualEnrollments.filter((enrollment) => enrollment.status !== 'archived');
  if (student?.source === 'masterImport' && activeManualEnrollments.length) {
    return activeManualEnrollments.length;
  }
  let count = 0;
  for (const course of normalizedCourseEntriesForStudent(student)) {
    const fee = courseTuitionForStudent(student, courseKey(course), tuitionEntries);
    const amount = Math.round(parseNumber(fee?.amount));
    if (amount > 0 || studentCourseWithdrawalInfo(student, course.header || course.label)) {
      count += 1;
    }
  }
  return count + activeManualEnrollments.length;
}

function cleanFilteredStudents() {
  const grade = elements.cleanStudentGradeFilter?.value || '';
  const keyword = normalizedCompareText(elements.cleanStudentSearch?.value || '');
  const { tuitionByStudent } = buildStudentIndexes();
  const enrollmentsByStudent = manualEnrollmentsByStudent();
  return getStudents()
    .filter((student) => !grade || studentCohortFilterValue(student) === grade || studentCohortCode(student) === grade)
    .filter((student) => !keyword || normalizedCompareText(cleanStudentSearchText(student)).includes(keyword))
    .map((student) => ({
      student,
      courseCount: cleanStudentActualCourseCount(student, tuitionByStudent.get(student.id) || [], enrollmentsByStudent.get(student.id) || [])
    }))
    .sort((a, b) => (
      (b.courseCount > 0) - (a.courseCount > 0) ||
      b.courseCount - a.courseCount ||
      `${studentCohortFilterValue(a.student)} ${studentName(a.student)} ${a.student.row}`.localeCompare(`${studentCohortFilterValue(b.student)} ${studentName(b.student)} ${b.student.row}`, 'zh-Hant')
    ))
    .map((row) => row.student);
}

function receivableForEnrollment(enrollmentId) {
  return (state.receivables || []).find((receivable) => receivable.enrollmentId === enrollmentId) || null;
}

function studentCourseWithdrawalInfo(student, courseName, receivable = null) {
  if (receivable?.withdrawal) {
    const withdrawal = receivable.withdrawal;
    return {
      label: `${withdrawal.date || ''} 第 ${withdrawal.withdrawSessionNo || ''} 堂退；已上 ${formatMoney(withdrawal.sessionsTaken)} 堂；退 ${formatMoney(withdrawal.refundAmount)}`,
      amount: parseNumber(withdrawal.refundAmount),
      date: withdrawal.date || ''
    };
  }
  const name = studentName(student);
  const event = (state.membershipEvents || []).find((row) => (
    row.action === '退出' &&
    (row.studentId === student.id || (!row.studentId && row.studentName === name)) &&
    eventMatchesCourseName(row, courseName)
  ));
  if (!event) return null;
  return {
    label: `${event.date || ''} ${event.sessionNo ? `第 ${event.sessionNo} 堂` : ''}退出${event.note ? `；${event.note}` : ''}`,
    amount: 0,
    date: event.date || ''
  };
}

function inferStandardTuition(amount) {
  const value = Math.round(parseNumber(amount));
  if (value <= 0) return 0;
  if (value >= 18000) return 21600;
  if (value >= 14000) return 16800;
  return value;
}

const packagePricingRules = [
  { label: '新制單科早鳥 / 特價', count: 1, total: 21600, earlySingle: 21600, baseSingle: 24000 },
  { label: '新制兩科合報', count: 2, total: 42200, earlySingle: 21600, baseSingle: 24000 },
  { label: '新制三科合報', count: 3, total: 61800, earlySingle: 21600, baseSingle: 24000 },
  { label: '新制四科合報', count: 4, total: 81400, earlySingle: 21600, baseSingle: 24000 },
  { label: '舊制單科早鳥', count: 1, total: 16800, earlySingle: 16800, baseSingle: 21600 },
  { label: '舊制兩科合報', count: 2, total: 32600, earlySingle: 16800, baseSingle: 21600 },
  { label: '舊制三科合報', count: 3, total: 47400, earlySingle: 16800, baseSingle: 21600 },
  { label: '舊制四科合報', count: 4, total: 62200, earlySingle: 16800, baseSingle: 21600 },
  { label: '數自全科合報', minCount: 4, total: 77000, baseSingle: 24000 },
  { label: '自然全科合報', minCount: 4, total: 52000, baseSingle: 24000 },
  { label: '物化合報優惠', count: 2, total: 42000, baseSingle: 24000 },
  { label: '生地全報優惠', count: 2, total: 12000, baseSingle: 8000 }
];

function matchingPackageRule(count, total) {
  return packagePricingRules.find((rule) => (
    (rule.count ? rule.count === count : count >= rule.minCount) &&
    Math.abs(Math.round(parseNumber(total)) - rule.total) <= 4
  )) || null;
}

function annotatePackageRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.term || parseNumber(row.amount) <= 0) continue;
    const groupRows = groups.get(row.term) || [];
    groupRows.push(row);
    groups.set(row.term, groupRows);
  }
  for (const groupRows of groups.values()) {
    if (groupRows.length < 2) continue;
    const total = groupRows.reduce((sum, row) => sum + parseNumber(row.amount), 0);
    const rule = matchingPackageRule(groupRows.length, total);
    if (rule) {
      const average = Math.round(total / groupRows.length);
      const earlyTotal = rule.earlySingle ? rule.earlySingle * groupRows.length : 0;
      const baseTotal = rule.baseSingle ? rule.baseSingle * groupRows.length : 0;
      const discountParts = [
        earlyTotal > total ? `較單科早鳥少 ${formatMoney(earlyTotal - total)}` : '',
        baseTotal > total ? `較原價少 ${formatMoney(baseTotal - total)}` : ''
      ].filter(Boolean).join('，');
      for (const row of groupRows) {
        row.packageNote = `${rule.label}：總 ${formatMoney(total)}，平均 ${formatMoney(average)} / 科${discountParts ? `；${discountParts}` : ''}`;
      }
      continue;
    }
    const average = Math.round(total / groupRows.length);
    for (const row of groupRows) {
      row.packageNote = `同學期 ${groupRows.length} 科，已登記總額 ${formatMoney(total)}，平均 ${formatMoney(average)} / 科`;
    }
  }
}

function buildStudentCourseFinanceRows(student) {
  if (!student) return [];
  const tuitionEntries = buildStudentIndexes().tuitionByStudent.get(student.id) || [];
  const manualEnrollments = manualEnrollmentsByStudent().get(student.id) || [];
  const showImportedRows = !(student.source === 'masterImport' && manualEnrollments.some((enrollment) => enrollment.status !== 'archived'));
  const rows = [];
  if (showImportedRows) {
    for (const course of normalizedCourseEntriesForStudent(student)) {
      const fee = courseTuitionForStudent(student, courseKey(course), tuitionEntries);
      const amount = Math.round(parseNumber(fee?.amount));
      const withdrawal = studentCourseWithdrawalInfo(student, course.header || course.label);
      if (amount <= 0 && !withdrawal) continue;
      const standard = inferStandardTuition(amount);
      rows.push({
        id: `imported:${student.id}:${courseKey(course)}`,
        source: 'import',
        term: course.term || inferTermLabel(course.group, student.sheet),
        cohort: student.sheet || '',
        courseName: course.header || course.label,
        courseLabel: course.label || courseLabel(course),
        teacherName: importedTeacherNameForCourse(course.header, course.term, student.sheet),
        amount,
        originalAmount: standard,
        paidAmount: 0,
        balance: 0,
        paymentLabel: amount > 0 ? studentEffectivePaymentState(student.id, tuitionEntries).label : '未對到科目收費',
        paymentDate: fee?.paymentDate || tuitionPaymentDateLabel(tuitionEntries),
        status: '匯入底稿',
        note: fee?.label || '',
        withdrawal
      });
    }
  }

  const courses = manualCoursesById();
  for (const enrollment of manualEnrollments) {
    const course = courses.get(enrollment.courseId);
    const receivable = receivableForEnrollment(enrollment.id);
    const amount = Math.round(parseNumber(receivable?.amount ?? enrollment.tuitionAmount));
    const paymentDate = Array.from(new Set([
      enrollment.paymentDate,
      ...(state.paymentLedger || [])
        .filter((payment) => payment.sourceEnrollmentId === enrollment.id || payment.receivableId === receivable?.id)
        .map((payment) => payment.date)
    ].filter(Boolean))).join('、');
    rows.push({
      id: `manual:${enrollment.id}`,
      source: 'manual',
      term: course?.term || '',
      cohort: course?.cohort || student.sheet || '',
      courseName: course?.courseName || enrollment.courseName || '',
      courseLabel: course ? manualCourseLabel(course) : enrollment.courseName || enrollment.courseId,
      teacherName: course?.teacherName || '',
      amount,
      originalAmount: Math.round(parseNumber(receivable?.originalAmount ?? enrollment.originalAmount ?? enrollment.tuitionAmount)),
      discountAmount: Math.round(parseNumber(receivable?.discountAmount ?? enrollment.discountAmount)),
      paidAmount: Math.round(parseNumber(receivable?.paidAmount)),
      balance: Math.round(parseNumber(receivable?.balance)),
      paymentDate,
      paymentLabel: receivableStatusLabel(receivable?.status) || (enrollment.paymentDate ? '有繳費日期' : '未收'),
      status: enrollment.status || receivable?.status || 'active',
      note: [enrollment.note, receivable?.note].filter(Boolean).join('；'),
      withdrawal: studentCourseWithdrawalInfo(student, course?.courseName || enrollment.courseName, receivable),
      receivable
    });
  }

  annotatePackageRows(rows);

  return rows.sort((a, b) => `${a.term} ${a.courseName}`.localeCompare(`${b.term} ${b.courseName}`, 'zh-Hant'));
}

function cleanCohortOptions() {
  const importedCohorts = Array.from(new Map(getStudents()
    .map((student) => [studentCohortFilterValue(student), studentCohortLabel(student)])
    .filter(([value]) => value)).entries());
  return Array.from(new Map([
    ...importedCohorts,
    ...Array.from(cohortGradeLabels.entries()),
    ...cohortOptions().map((cohort) => [cohort, cohort])
  ]).entries());
}

function syncCleanStudentForm(student) {
  if (!elements.cleanStudentForm) return;
  const current = elements.cleanStudentForm.elements.cohort.value;
  elements.cleanStudentFormCohort.innerHTML = cleanCohortOptions()
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  const form = elements.cleanStudentForm;
  if (!student) {
    form.reset();
    form.elements.id.value = '';
    form.elements.cohort.value = current || elements.cleanStudentGradeFilter.value || '112';
    elements.cleanStudentArchive.disabled = true;
    return;
  }
  const profile = student.profile || {};
  form.elements.id.value = student.id || '';
  form.elements.name.value = studentName(student) || '';
  form.elements.cohort.value = studentCohortFilterValue(student) || current || '112';
  form.elements.highSchool.value = profile.highSchool || '';
  form.elements.juniorHigh.value = profile.juniorHigh || '';
  form.elements.grade.value = profile.grade || '';
  form.elements.motherPhone.value = profile.motherPhone || '';
  form.elements.fatherPhone.value = profile.fatherPhone || '';
  form.elements.note.value = profile.note || '';
  elements.cleanStudentArchive.disabled = false;
}

function cleanStudentRecordFromForm() {
  const form = elements.cleanStudentForm;
  const data = Object.fromEntries(new FormData(form).entries());
  const existing = data.id ? getAllStudents().find((student) => student.id === data.id) : null;
  const existingManual = data.id ? (state.manualStudents || []).find((student) => student.id === data.id) : null;
  const id = data.id || nowId('manual_student');
  return {
    ...(existing || {}),
    ...(existingManual || {}),
    id,
    source: existing?.source === 'masterImport' ? 'masterEdit' : 'manual',
    sheet: data.cohort || existing?.sheet || '',
    row: existing?.row || existingManual?.row || '',
    selectedCourses: existing?.selectedCourses || existingManual?.selectedCourses || [],
    archived: false,
    createdAt: existingManual?.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      ...(existing?.profile || {}),
      ...(existingManual?.profile || {}),
      name: String(data.name || '').trim(),
      highSchool: String(data.highSchool || '').trim(),
      juniorHigh: String(data.juniorHigh || '').trim(),
      grade: String(data.grade || '').trim(),
      motherPhone: String(data.motherPhone || '').trim(),
      fatherPhone: String(data.fatherPhone || '').trim(),
      note: String(data.note || '').trim()
    }
  };
}

function cleanTeacherById(id) {
  return cleanTeacherRows().find((teacher) => teacher.id === id) ||
    masterTeacherRowsData().find((teacher) => teacher.id === id) ||
    (state.manualTeachers || []).find((teacher) => teacher.id === id) ||
    null;
}

function syncCleanTeacherForm(teacher) {
  if (!elements.cleanTeacherForm) return;
  const form = elements.cleanTeacherForm;
  if (!teacher) {
    form.reset();
    form.elements.id.value = '';
    elements.cleanTeacherArchive.disabled = true;
    return;
  }
  form.elements.id.value = teacher.id || '';
  form.elements.name.value = teacher.name || '';
  form.elements.subject.value = teacher.subject || '';
  form.elements.defaultShare.value = teacher.defaultShare || '';
  form.elements.defaultFixedRate.value = teacher.defaultFixedRate || '';
  form.elements.contact.value = teacher.contact || '';
  form.elements.note.value = teacher.note || '';
  elements.cleanTeacherArchive.disabled = false;
}

function cleanTeacherRecordFromForm() {
  const form = elements.cleanTeacherForm;
  const data = Object.fromEntries(new FormData(form).entries());
  const name = String(data.name || '').trim();
  const existing = data.id ? cleanTeacherById(data.id) : null;
  const existingByName = (state.manualTeachers || []).find((teacher) => normalizedCompareText(teacher.name) === normalizedCompareText(name));
  const id = existingByName?.id || existing?.id || stableMasterId('manual_teacher', [name]);
  return {
    ...(existing || {}),
    ...(existingByName || {}),
    id,
    createdAt: existingByName?.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name,
    subject: String(data.subject || '').trim(),
    defaultShare: parseNumber(data.defaultShare),
    defaultFixedRate: parseNumber(data.defaultFixedRate),
    contact: String(data.contact || '').trim(),
    note: String(data.note || '').trim(),
    archived: false
  };
}

function cleanSelectedStudent() {
  const students = getStudents();
  if (selectedCleanStudentId && students.some((student) => student.id === selectedCleanStudentId)) {
    return students.find((student) => student.id === selectedCleanStudentId);
  }
  const filtered = cleanFilteredStudents();
  selectedCleanStudentId = filtered[0]?.id || '';
  return filtered[0] || null;
}

function renderCleanStudentLedger() {
  if (!elements.cleanStudentSelect) return;
  const gradeOptions = Array.from(new Map(getStudents().map((student) => [studentCohortCode(student), studentCohortLabel(student)])).entries())
    .filter(([value]) => value)
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'));
  const selectedGrade = elements.cleanStudentGradeFilter.value;
  elements.cleanStudentGradeFilter.innerHTML = '<option value="">全部</option>' +
    gradeOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
  elements.cleanStudentGradeFilter.value = gradeOptions.some(([value]) => value === selectedGrade) ? selectedGrade : '';

  const students = cleanFilteredStudents();
  if (selectedCleanStudentId && !students.some((student) => student.id === selectedCleanStudentId)) {
    selectedCleanStudentId = students[0]?.id || '';
    cleanStudentSelectionTouched = false;
  }
  if (!cleanStudentSelectionTouched && selectedCleanStudentId && students[0]?.id && selectedCleanStudentId !== students[0].id) {
    const { tuitionByStudent } = buildStudentIndexes();
    const enrollmentsByStudent = manualEnrollmentsByStudent();
    const selectedStudentForPriority = students.find((student) => student.id === selectedCleanStudentId);
    const selectedCourseCount = cleanStudentActualCourseCount(selectedStudentForPriority, tuitionByStudent.get(selectedCleanStudentId) || [], enrollmentsByStudent.get(selectedCleanStudentId) || []);
    const firstCourseCount = cleanStudentActualCourseCount(students[0], tuitionByStudent.get(students[0].id) || [], enrollmentsByStudent.get(students[0].id) || []);
    if (selectedCourseCount <= 0 && firstCourseCount > 0) {
      selectedCleanStudentId = students[0].id;
    }
  }
  const selectedStudent = cleanSelectedStudent();
  const { tuitionByStudent } = buildStudentIndexes();
  const enrollmentsByStudent = manualEnrollmentsByStudent();
  elements.cleanStudentSelect.innerHTML = students.length
    ? students.map((student) => {
      const courseCount = cleanStudentActualCourseCount(student, tuitionByStudent.get(student.id) || [], enrollmentsByStudent.get(student.id) || []);
      return `<option value="${escapeHtml(student.id)}">${escapeHtml(studentName(student))}｜${escapeHtml(studentCohortLabel(student))}｜${escapeHtml(studentSchool(student) || '未填學校')}${courseCount ? `｜${formatMoney(courseCount)} 科` : ''}</option>`;
    }).join('')
    : '<option value="">沒有符合的學生</option>';
  elements.cleanStudentSelect.value = selectedStudent?.id || '';
  elements.cleanStudentSelect.disabled = !students.length;
  syncCleanStudentForm(selectedStudent);

  const courseRows = buildStudentCourseFinanceRows(selectedStudent);
  const selectedTerm = elements.cleanStudentTermFilter.value;
  const termOptions = Array.from(new Set(courseRows.map((row) => row.term).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  elements.cleanStudentTermFilter.innerHTML = '<option value="">全部學期</option>' +
    termOptions.map((term) => `<option value="${escapeHtml(term)}">${escapeHtml(term)}</option>`).join('');
  elements.cleanStudentTermFilter.value = termOptions.includes(selectedTerm) ? selectedTerm : '';
  const termFilteredRows = courseRows.filter((row) => !elements.cleanStudentTermFilter.value || row.term === elements.cleanStudentTermFilter.value);
  const selectedCourse = elements.cleanStudentCourseFilter.value;
  const courseOptions = Array.from(new Map(termFilteredRows.map((row) => [row.courseName, row.courseName])).entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'zh-Hant'));
  elements.cleanStudentCourseFilter.innerHTML = '<option value="">全部課程</option>' +
    courseOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
  elements.cleanStudentCourseFilter.value = courseOptions.some(([value]) => value === selectedCourse) ? selectedCourse : '';
  const visibleRows = termFilteredRows.filter((row) => !elements.cleanStudentCourseFilter.value || row.courseName === elements.cleanStudentCourseFilter.value);
  const amountTotal = visibleRows.reduce((sum, row) => sum + parseNumber(row.amount), 0);
  const paidTotal = visibleRows.reduce((sum, row) => sum + parseNumber(row.paidAmount), 0);
  const refundTotal = visibleRows.reduce((sum, row) => sum + parseNumber(row.withdrawal?.amount), 0);
  elements.cleanStudentSummary.innerHTML = selectedStudent
    ? [
      summaryCell('篩選學生', students.length),
      summaryCell('修課筆數', visibleRows.length),
      summaryCell('應收 / 學收', amountTotal),
      summaryCell('已收', paidTotal),
      summaryCell('退費紀錄', refundTotal)
    ].join('')
    : '<div class="record-item"><p>尚未載入學生資料。</p></div>';
  elements.cleanStudentCourseRows.innerHTML = visibleRows.length
    ? visibleRows.map((row) => {
      const discountText = [
        row.packageNote,
        row.discountAmount ? `手動優惠 ${formatMoney(row.discountAmount)}` : ''
      ].filter(Boolean).join('；') || '無';
      const paymentText = [
        row.paymentDate ? `繳費日期 ${escapeHtml(row.paymentDate)}` : '',
        row.paidAmount ? `已收 ${formatMoney(row.paidAmount)}` : '',
        row.balance ? `未收 ${formatMoney(row.balance)}` : '',
        row.withdrawal ? escapeHtml(row.withdrawal.label) : ''
      ].filter(Boolean).join('<br>') || escapeHtml(row.paymentLabel || '');
      return `
        <tr>
          <td>${escapeHtml(row.term || '未分學期')}<br><span class="muted">${escapeHtml(row.cohort || '')}</span></td>
          <td><strong>${escapeHtml([row.term, row.courseName].filter(Boolean).join(' '))}</strong><br><span class="muted">${escapeHtml(row.note || row.courseLabel || '')}</span></td>
          <td>${escapeHtml(row.teacherName || '未指定')}</td>
          <td class="money">${row.amount ? formatMoney(row.amount) : '未對到'}${row.originalAmount ? `<br><span class="muted">原 ${formatMoney(row.originalAmount)}</span>` : ''}</td>
          <td>${escapeHtml(discountText)}</td>
          <td>${paymentText}</td>
          <td>${escapeHtml(row.status || '')}</td>
        </tr>
      `;
    }).join('')
    : emptyRow(7);
  if (!selectedStudent) {
    elements.cleanStudentDetail.innerHTML = '<p class="empty">尚未載入學生資料</p>';
    return;
  }
  const profile = selectedStudent.profile || {};
  const events = (state.membershipEvents || []).filter((event) => (
    event.studentId === selectedStudent.id || (!event.studentId && event.studentName === studentName(selectedStudent))
  ));
  const paymentDateCount = new Set(courseRows.map((row) => row.paymentDate).filter(Boolean)).size;
  elements.cleanStudentDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(studentCohortLabel(selectedStudent))} · ${escapeHtml(selectedStudent.sheet || '')} 列 ${escapeHtml(selectedStudent.row || '')}</p>
        <h2>${escapeHtml(studentName(selectedStudent) || '未命名學生')}</h2>
      </div>
      <button class="ghost" type="button" data-clean-fill-student="${escapeHtml(selectedStudent.id)}">帶到異動收退費</button>
    </div>
    <div class="profile-grid">
      <div><span>高中 / 學校</span><strong>${escapeHtml(profile.highSchool || '')}</strong></div>
      <div><span>國中</span><strong>${escapeHtml(profile.juniorHigh || '')}</strong></div>
      <div><span>年級文字</span><strong>${escapeHtml(profile.grade || '')}</strong></div>
      <div><span>狀態</span><strong>${escapeHtml(studentStatusLabel(selectedStudent.id))}</strong></div>
      <div><span>母手機</span><strong>${escapeHtml(profile.motherPhone || '')}</strong></div>
      <div><span>父手機</span><strong>${escapeHtml(profile.fatherPhone || '')}</strong></div>
      <div><span>實際修課</span><strong>${formatMoney(courseRows.length)} 科</strong></div>
      <div><span>繳費日期</span><strong>${paymentDateCount ? `${formatMoney(paymentDateCount)} 組` : '未見'}</strong></div>
    </div>
    <details class="compact-fold">
      <summary>異動紀錄 ${events.length ? `(${formatMoney(events.length)})` : ''}</summary>
      <div class="mini-record-list">
        ${events.length ? events.map((event) => `<div>${escapeHtml(event.date || '')}｜${escapeHtml(event.courseName || '')}｜${escapeHtml(event.action || '')}${event.sessionNo ? ` 第 ${escapeHtml(event.sessionNo)} 堂` : ''}${event.note ? `｜${escapeHtml(event.note)}` : ''}</div>`).join('') : '<div class="muted">尚無異動。</div>'}
      </div>
    </details>
  `;
}

function cleanTeacherRows() {
  const archivedTeacherNames = new Set((state.manualTeachers || [])
    .filter((teacher) => teacher.archived)
    .map((teacher) => normalizedCompareText(teacher.name)));
  const masterRows = masterTeacherRowsData();
  const hasMasterCourses = masterRows.some((teacher) => (teacher.courses || []).length);
  return mergeCleanTeacherRows({
    masterRows,
    rosterBlocks: hasMasterCourses ? [] : getTeacherRosterBlocks(),
    archivedTeacherNames,
    normalizeText: normalizedCompareText,
    parseAmount: parseNumber,
    stableFallbackId: (teacherName) => stableMasterId('fallback_teacher', [teacherName]),
    canonicalSubject,
    inferTermLabel
  });
}

function renderCleanTeacherLedger() {
  if (!elements.cleanTeacherSelect) return;
  const keyword = normalizedCompareText(elements.cleanTeacherSearch.value || '');
  const selectedTerm = elements.cleanTeacherTermFilter.value || '';
  const allTeachers = cleanTeacherRows();
  const terms = Array.from(new Set(allTeachers.flatMap((teacher) => (teacher.courses || []).map((course) => course.term).filter(Boolean))))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  elements.cleanTeacherTermFilter.innerHTML = '<option value="">全部</option>' +
    terms.map((term) => `<option value="${escapeHtml(term)}">${escapeHtml(term)}</option>`).join('');
  elements.cleanTeacherTermFilter.value = terms.includes(selectedTerm) ? selectedTerm : '';
  const teachers = allTeachers
    .filter((teacher) => {
      const text = normalizedCompareText([teacher.name, teacher.subject, ...(teacher.courses || []).map((course) => course.courseName)].join(' '));
      return !keyword || text.includes(keyword);
    })
    .filter((teacher) => !elements.cleanTeacherTermFilter.value || (teacher.courses || []).some((course) => course.term === elements.cleanTeacherTermFilter.value))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  if (selectedMasterTeacherId && !teachers.some((teacher) => teacher.id === selectedMasterTeacherId)) {
    selectedMasterTeacherId = '';
  }
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedMasterTeacherId) || teachers[0] || null;
  selectedMasterTeacherId = selectedTeacher?.id || '';
  elements.cleanTeacherSelect.innerHTML = teachers.length
    ? teachers.map((teacher) => {
      const termSummary = compactTeacherTermSummary(teacher);
      return `<option value="${escapeHtml(teacher.id)}">${escapeHtml(teacher.name)}｜${formatMoney(teacher.courseCount)} 門課${termSummary ? `｜${escapeHtml(termSummary)}` : ''}</option>`;
    }).join('')
    : '<option value="">沒有符合的老師</option>';
  elements.cleanTeacherSelect.value = selectedMasterTeacherId;
  elements.cleanTeacherSelect.disabled = !teachers.length;
  syncCleanTeacherForm(selectedTeacher);
  const courses = (selectedTeacher?.courses || [])
    .filter((course) => !elements.cleanTeacherTermFilter.value || course.term === elements.cleanTeacherTermFilter.value)
    .sort((a, b) => `${a.term} ${a.courseName}`.localeCompare(`${b.term} ${b.courseName}`, 'zh-Hant'));
  const selectedCourse = courses.find((course) => course.id === selectedCleanTeacherCourseId) || courses[0] || null;
  selectedCleanTeacherCourseId = selectedCourse?.id || '';
  const feeTotal = courses.reduce((sum, course) => sum + parseNumber(course.feeTotal), 0);
  elements.cleanTeacherSummary.innerHTML = selectedTeacher
    ? [
      summaryCell('老師課程', courses.length),
      summaryCell('學生人次', courses.reduce((sum, course) => sum + parseNumber(course.enrollmentCount), 0)),
      summaryCell('收費合計', feeTotal),
      summaryCell('平均每課', courses.length ? Math.round(feeTotal / courses.length) : 0)
    ].join('')
    : '<div class="record-item"><p>尚未載入老師或課程資料。</p></div>';
  elements.cleanTeacherCourseRows.innerHTML = courses.length
    ? courses.map((course) => {
      const averagePerSession = course.sessionCount && course.enrollmentCount
        ? Math.round(parseNumber(course.feeTotal) / parseNumber(course.sessionCount) / parseNumber(course.enrollmentCount))
        : 0;
      return `
        <tr class="${course.id === selectedCleanTeacherCourseId ? 'is-selected' : ''}">
          <td>${escapeHtml(course.term || '未分學期')}</td>
          <td><strong>${escapeHtml(course.courseName || '')}</strong><br><span class="muted">${escapeHtml(course.cohort || '')}</span></td>
          <td class="money">${formatMoney(course.enrollmentCount)}</td>
          <td class="money">${formatMoney(parseNumber(course.sessionCount) || 24)}</td>
          <td class="money">${averagePerSession ? formatMoney(averagePerSession) : ''}</td>
          <td class="money">${formatMoney(course.feeTotal)}</td>
          <td><button class="ghost small" type="button" data-clean-view-teacher-course="${escapeHtml(course.id)}">名單</button></td>
        </tr>
      `;
    }).join('')
    : emptyRow(7);
  renderCleanTeacherCourseDetail(selectedCourse);
}

function renderCleanTeacherCourseDetail(course) {
  if (!elements.cleanTeacherCourseDetail) return;
  if (!course) {
    elements.cleanTeacherCourseDetail.innerHTML = '<p class="empty">選一門課查看名單</p>';
    return;
  }
  const { studentsById } = buildStudentIndexes();
  const receivableMap = new Map((state.receivables || []).map((receivable) => [receivable.enrollmentId, receivable]));
  const studentRows = (course.enrollments || []).map((enrollment) => {
    const student = studentsById.get(enrollment.studentId);
    const receivable = receivableMap.get(enrollment.id);
    const amount = parseNumber(receivable?.amount ?? enrollment.tuitionAmount);
    const withdrawal = student ? studentCourseWithdrawalInfo(student, course.courseName, receivable) : null;
    return `
      <tr>
        <td><strong>${escapeHtml(enrollment.studentName || studentName(student) || '')}</strong></td>
        <td>${escapeHtml(studentSchool(student))}</td>
        <td class="money">${formatMoney(amount)}</td>
        <td class="money">${formatMoney(Math.round(amount / (parseNumber(course.sessionCount) || 24)))}</td>
        <td>${escapeHtml(withdrawal?.label || receivableStatusLabel(receivable?.status) || enrollment.status || '')}</td>
      </tr>
    `;
  }).join('');
  elements.cleanTeacherCourseDetail.innerHTML = `
    <h3>${escapeHtml(course.courseName || '')}</h3>
    <p class="muted">${escapeHtml([course.term, course.cohort, course.teacherName].filter(Boolean).join(' / '))}</p>
    <div class="profile-grid">
      <div><strong>${formatMoney(course.enrollmentCount)}</strong><span>目前名單</span></div>
      <div><strong>${formatMoney(course.feeTotal)}</strong><span>收費合計</span></div>
      <div><strong>${formatMoney(parseNumber(course.sessionCount) || 24)}</strong><span>總堂數</span></div>
      <div><strong>${formatMoney(parseNumber(course.refundUnitPrice) || 1000)}</strong><span>退班單堂</span></div>
    </div>
    <h4>學生名單 / 每堂收入參考</h4>
    <div class="table-wrap embedded-table">
      <table>
        <thead><tr><th>學生</th><th>學校</th><th>科目收入</th><th>每堂平均</th><th>狀態</th></tr></thead>
        <tbody>${studentRows || emptyRow(5)}</tbody>
      </table>
    </div>
  `;
}

function renderCleanMovementLedger() {
  if (!elements.cleanMovementRows) return;
  const students = getStudents().slice().sort((a, b) => `${studentName(a)} ${a.sheet}`.localeCompare(`${studentName(b)} ${b.sheet}`, 'zh-Hant'));
  const selectedStudent = elements.cleanMovementStudent.value;
  elements.cleanMovementStudent.innerHTML = students.length
    ? students.map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(studentName(student))}｜${escapeHtml(studentCohortLabel(student))}｜${escapeHtml(studentSchool(student) || '')}</option>`).join('')
    : '<option value="">尚無學生</option>';
  elements.cleanMovementStudent.value = students.some((student) => student.id === selectedStudent) ? selectedStudent : (selectedCleanStudentId || students[0]?.id || '');
  const student = students.find((row) => row.id === elements.cleanMovementStudent.value) || null;
  const courseRows = buildStudentCourseFinanceRows(student);
  const courseOptions = courseRows.map((row) => `<option value="${escapeHtml(row.courseName)}">${escapeHtml(row.term || '未分學期')}｜${escapeHtml(row.courseName)}</option>`).join('');
  elements.cleanMovementCourse.innerHTML = courseOptions || '<option value="">這位學生尚無課程</option>';

  const moneyRows = (state.paymentLedger || []).map((payment) => ({
    date: payment.date || payment.createdAt?.slice(0, 10) || '',
    studentName: payment.studentName || '',
    studentId: payment.studentId || '',
    courseName: payment.courseName || '',
    type: payment.amount < 0 ? '退費' : '收款',
    sessionNo: '',
    amountText: formatMoney(payment.amount),
    note: payment.note || ''
  }));
  const eventRows = (state.membershipEvents || []).map((event) => ({
    date: event.date || event.createdAt?.slice(0, 10) || '',
    studentName: event.studentName || '',
    studentId: event.studentId || '',
    courseName: event.courseName || '',
    type: event.action || '異動',
    sessionNo: event.sessionNo || '',
    amountText: '',
    note: event.note || ''
  }));
  const rows = [...eventRows, ...moneyRows]
    .sort((a, b) => `${b.date} ${b.type}`.localeCompare(`${a.date} ${a.type}`, 'zh-Hant'));
  elements.cleanMovementSummary.innerHTML = [
    summaryCell('異動紀錄', state.membershipEvents.length),
    summaryCell('收款 / 退費流水', state.paymentLedger.length),
    summaryCell('退費筆數', state.paymentLedger.filter((payment) => parseNumber(payment.amount) < 0).length),
    summaryCell('退出紀錄', state.membershipEvents.filter((event) => event.action === '退出').length)
  ].join('');
  elements.cleanMovementRows.innerHTML = rows.length
    ? rows.slice(0, 180).map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td><strong>${escapeHtml(row.studentName)}</strong></td>
        <td>${escapeHtml(row.courseName)}</td>
        <td>${escapeHtml(row.type)}</td>
        <td>${escapeHtml(row.sessionNo ? `第 ${row.sessionNo} 堂` : '')}</td>
        <td class="money">${escapeHtml(row.amountText)}</td>
        <td>${escapeHtml(row.note)}</td>
      </tr>
    `).join('')
    : emptyRow(7);
}

function renderCleanPayrollLedger() {
  if (!elements.cleanPayrollRows) return;
  const month = elements.cleanPayrollMonth.value || elements.payrollSettlementMonth.value || currentMonthIso();
  const teachers = cleanTeacherRows().map((teacher) => teacher.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const selected = elements.cleanPayrollTeacher.value;
  elements.cleanPayrollTeacher.innerHTML = '<option value="">全部老師</option>' +
    teachers.map((teacher) => `<option value="${escapeHtml(teacher)}">${escapeHtml(teacher)}</option>`).join('');
  elements.cleanPayrollTeacher.value = teachers.includes(selected) ? selected : '';
  const settlementRows = payrollSettlement?.classes || [];
  const archive = (state.payrollSettlements || []).find((settlement) => settlement.month === month);
  const rows = settlementRows.length ? settlementRows : (archive?.classes || []);
  const visibleRows = rows.filter((row) => !elements.cleanPayrollTeacher.value || row.teacherName === elements.cleanPayrollTeacher.value);
  const visibleTeacherCount = new Set(visibleRows.map((row) => row.teacherName).filter(Boolean)).size;
  elements.cleanPayrollSummary.innerHTML = [
    summaryCell(`${month} 老師數`, visibleTeacherCount),
    summaryCell('課程列', visibleRows.length),
    summaryCell('堂數 / 時數', visibleRows.reduce((sum, row) => sum + parseNumber(row.sessionCount || row.hours), 0)),
    summaryCell('薪資小計', visibleRows.reduce((sum, row) => sum + parseNumber(row.total), 0))
  ].join('') + (!rows.length ? '<div class="notice-line">尚未產生這個月份的薪資結算；請按右上角打開薪資計算工具，先補堂次與產生月底結算。</div>' : '');
  elements.cleanPayrollRows.innerHTML = visibleRows.length
    ? visibleRows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.teacherName || '')}</strong></td>
        <td>${escapeHtml(row.courseName || row.className || '')}</td>
        <td class="money">${formatMoney(row.sessionCount || row.hours || 0)}</td>
        <td>${escapeHtml(row.headcountText || row.peopleText || row.studentCount || '')}</td>
        <td>${escapeHtml(row.methodLabel || row.ruleLabel || row.calcMethod || row.status || '')}</td>
        <td class="money">${formatMoney(row.total)}</td>
      </tr>
    `).join('')
    : emptyRow(6);
}

function masterCourseMatchesFilters(course) {
  const keyword = normalizedCompareText(elements.masterCourseKeyword?.value || '');
  const term = elements.masterCourseTermFilter?.value || '';
  const teacher = elements.masterCourseTeacherFilter?.value || '';
  const archivedOnly = !!elements.masterCourseArchivedOnly?.checked;
  const text = normalizedCompareText([
    course.courseName,
    course.term,
    course.cohort,
    course.teacherName,
    ...(course.enrollments || []).map((enrollment) => enrollment.studentName)
  ].join(' '));
  return (!keyword || text.includes(keyword)) &&
    (!term || course.term === term) &&
    (!teacher || course.teacherName === teacher) &&
    (archivedOnly ? course.archived : !course.archived);
}

function masterTeacherMatchesFilters(teacher) {
  const keyword = normalizedCompareText(elements.masterTeacherKeyword?.value || '');
  const term = elements.masterTeacherTermFilter?.value || '';
  const archivedOnly = !!elements.masterTeacherArchivedOnly?.checked;
  const text = normalizedCompareText([
    teacher.name,
    teacher.subject,
    ...(teacher.courses || []).map((course) => `${course.courseName} ${course.term}`)
  ].join(' '));
  return (!keyword || text.includes(keyword)) &&
    (!term || (teacher.courses || []).some((course) => course.term === term)) &&
    (archivedOnly ? teacher.archived : !teacher.archived);
}

function renderManualImportCompare() {
  const rows = manualImportCompareRows();
  const issueCount = rows.filter((row) => ['疑似重複報名', '同名需確認', '同名可參考'].includes(row.status)).length;
  elements.manualImportCompareSummary.innerHTML = [
    summaryCell('匯入學生', (state.importSnapshot?.students || []).length),
    summaryCell('網頁學生', state.manualStudents.length),
    summaryCell('網頁報名', state.manualCourseEnrollments.length),
    summaryCell('需確認', issueCount)
  ].join('');
  elements.manualImportCompareRows.innerHTML = rows.length
    ? rows.slice(0, 120).map((row) => `
      <tr>
        <td><span class="status-tag ${row.status === '疑似重複報名' || row.status.includes('確認') ? 'status-warn' : 'status-ok'}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.studentName)}</td>
        <td>${escapeHtml(row.manualSheet)}</td>
        <td>${escapeHtml(row.manualCourse)}</td>
        <td>${escapeHtml(row.matched || '無')}</td>
        <td>${escapeHtml(row.note)}</td>
      </tr>
    `).join('')
    : emptyRow(6);
  if (rows.length > 120) {
    elements.manualImportCompareRows.insertAdjacentHTML('beforeend', `
      <tr><td colspan="6" class="empty">另有 ${formatMoney(rows.length - 120)} 筆，先顯示最需要確認的前 120 筆。</td></tr>
    `);
  }
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
  if (elements.tuitionStudentId && elements.tuitionStudentId.innerHTML !== html) elements.tuitionStudentId.innerHTML = html;
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

function tuitionPaymentDateLabel(entries, anchorColumn = null) {
  const dates = (entries || [])
    .filter((entry) => entry.kind === 'payment_date')
    .map((entry) => ({
      date: tuitionEntryDisplayValue(entry),
      distance: anchorColumn === null ? 0 : columnIndex(entry.column) - anchorColumn
    }))
    .filter((entry) => entry.date)
    .filter((entry) => anchorColumn === null || (entry.distance >= -2 && entry.distance <= 10));
  const source = dates.length ? dates : (entries || [])
    .filter((entry) => entry.kind === 'payment_date')
    .map((entry) => ({ date: tuitionEntryDisplayValue(entry), distance: 0 }))
    .filter((entry) => entry.date);
  const uniqueDates = Array.from(new Set(source
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
    .map((entry) => entry.date)));
  if (!uniqueDates.length) return '';
  return uniqueDates.slice(0, 2).join('、') + (uniqueDates.length > 2 ? ` 等 ${formatMoney(uniqueDates.length)} 筆` : '');
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
    column: match.column,
    paymentDate: tuitionPaymentDateLabel(tuitionEntries, columnIndex(match.column))
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
      <button class="ghost" type="button" data-fill-student="${escapeHtml(student.id)}">帶入異動表單</button>
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

function renderMasterFilterOptions() {
  const courses = masterCourseRowsData();
  const terms = Array.from(new Set([
    ...courses.map((course) => course.term).filter(Boolean),
    ...(state.manualTerms || []).map((term) => term.label).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const teachers = Array.from(new Set([
    ...courses.map((course) => course.teacherName).filter(Boolean),
    ...(state.manualTeachers || []).map((teacher) => teacher.name).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  const currentCourseTerm = elements.masterCourseTermFilter?.value || '';
  const currentTeacherTerm = elements.masterTeacherTermFilter?.value || '';
  const currentCourseTeacher = elements.masterCourseTeacherFilter?.value || '';
  if (elements.masterCourseTermFilter) {
    elements.masterCourseTermFilter.innerHTML = '<option value="">全部</option>' +
      terms.map((term) => `<option value="${escapeHtml(term)}">${escapeHtml(term)}</option>`).join('');
    elements.masterCourseTermFilter.value = terms.includes(currentCourseTerm) ? currentCourseTerm : '';
  }
  if (elements.masterTeacherTermFilter) {
    elements.masterTeacherTermFilter.innerHTML = '<option value="">全部</option>' +
      terms.map((term) => `<option value="${escapeHtml(term)}">${escapeHtml(term)}</option>`).join('');
    elements.masterTeacherTermFilter.value = terms.includes(currentTeacherTerm) ? currentTeacherTerm : '';
  }
  if (elements.masterCourseTeacherFilter) {
    elements.masterCourseTeacherFilter.innerHTML = '<option value="">全部</option>' +
      teachers.map((teacher) => `<option value="${escapeHtml(teacher)}">${escapeHtml(teacher)}</option>`).join('');
    elements.masterCourseTeacherFilter.value = teachers.includes(currentCourseTeacher) ? currentCourseTeacher : '';
  }
}

function renderMasterCourses() {
  if (!elements.masterCourseRows) return;
  renderMasterFilterOptions();
  const courses = masterCourseRowsData();
  const visibleCourses = courses.filter(masterCourseMatchesFilters)
    .sort((a, b) => `${a.term} ${a.cohort} ${a.courseName}`.localeCompare(`${b.term} ${b.cohort} ${b.courseName}`, 'zh-Hant'));
  elements.masterCourseSummary.innerHTML = `
    <div class="record-item">
      <strong>課程 ${formatMoney(courses.filter((course) => !course.archived).length)} 門</strong>
      <p>目前顯示 ${formatMoney(visibleCourses.length)} 門，選課 ${formatMoney(courses.reduce((sum, course) => sum + course.enrollmentCount, 0))} 筆，應收 ${formatMoney(courses.reduce((sum, course) => sum + course.feeTotal, 0))}。</p>
    </div>
  `;
  elements.masterCourseRows.innerHTML = visibleCourses.length
    ? visibleCourses.map((course) => `
      <tr class="${selectedMasterCourseId === course.id ? 'is-selected' : ''}">
        <td><strong>${escapeHtml(course.courseName || '')}</strong><br><span class="muted">${escapeHtml(course.cohort || '')}</span></td>
        <td>${escapeHtml(course.term || '未分學期')}</td>
        <td>${escapeHtml(course.teacherName || '未指定')}</td>
        <td class="money">${formatMoney(parseNumber(course.sessionCount) || 24)}</td>
        <td class="money">${formatMoney(course.enrollmentCount)}</td>
        <td class="money">${formatMoney(course.feeTotal)}</td>
        <td>
          <button class="ghost tiny-button" data-view-master-course="${escapeHtml(course.id)}" type="button">查看</button>
          <button class="ghost tiny-button" data-archive-master-course="${escapeHtml(course.id)}" type="button">${course.archived ? '復原' : '封存'}</button>
        </td>
      </tr>
    `).join('')
    : emptyRow(7);
  renderMasterCourseDetail();
}

function renderMasterCourseDetail() {
  if (!elements.masterCourseDetail) return;
  const course = masterCourseRowsData().find((row) => row.id === selectedMasterCourseId);
  if (!course) {
    elements.masterCourseDetail.innerHTML = '<p class="empty">選一門課查看學生名單、收款與堂次</p>';
    return;
  }
  const { studentsById } = buildStudentIndexes();
  const receivableMap = new Map((state.receivables || []).map((receivable) => [receivable.enrollmentId, receivable]));
  const sessionPlans = Object.values(state.courseSessionPlans || {}).filter((plan) => (
    String(plan.rosterKey || '').includes(course.id) || String(plan.id || '').includes(course.id) || plan.courseName === manualCourseLabel(course)
  ));
  const events = (state.membershipEvents || []).filter((event) => event.courseName === course.courseName || event.courseName === manualCourseLabel(course));
  const studentRows = (course.enrollments || []).map((enrollment) => {
    const student = studentsById.get(enrollment.studentId);
    const receivable = receivableMap.get(enrollment.id);
    return `
      <tr>
        <td><strong>${escapeHtml(enrollment.studentName || studentName(student) || '')}</strong><br><span class="muted">${escapeHtml(studentSchool(student))}</span></td>
        <td class="money">${formatMoney(parseNumber(receivable?.amount ?? enrollment.tuitionAmount))}</td>
        <td class="money">${formatMoney(parseNumber(receivable?.paidAmount))}</td>
        <td>${escapeHtml(receivableStatusLabel(receivable?.status || enrollment.status || 'open'))}</td>
        <td>${escapeHtml(enrollment.note || '')}</td>
      </tr>
    `;
  }).join('');
  elements.masterCourseDetail.innerHTML = `
    <h3>${escapeHtml(course.courseName)}</h3>
    <p class="muted">${escapeHtml([course.term, course.cohort, course.teacherName].filter(Boolean).join(' / '))}</p>
    <div class="profile-grid">
      <div><strong>${formatMoney(course.enrollmentCount)}</strong><span>學生</span></div>
      <div><strong>${formatMoney(course.feeTotal)}</strong><span>收費合計</span></div>
      <div><strong>${formatMoney(parseNumber(course.sessionCount) || 24)}</strong><span>總堂數</span></div>
      <div><strong>${formatMoney(parseNumber(course.refundUnitPrice) || 1000)}</strong><span>退費單堂</span></div>
    </div>
    <h4>學生名單 / 收款</h4>
    <div class="table-wrap embedded-table">
      <table>
        <thead><tr><th>學生</th><th>應收</th><th>已收</th><th>狀態</th><th>備註</th></tr></thead>
        <tbody>${studentRows || emptyRow(5)}</tbody>
      </table>
    </div>
    <h4>堂次日期</h4>
    <div class="mini-record-list">
      ${sessionPlans.length ? sessionPlans.map((plan) => `<div>${escapeHtml(plan.month || '')}：${escapeHtml((plan.sessions || []).map((row) => `第${row.sessionNo}堂 ${row.date}`).join('、'))}</div>`).join('') : '<div class="muted">尚未設定堂次；到薪資頁處理堂次日期。</div>'}
    </div>
    <h4>進退班異動</h4>
    <div class="mini-record-list">
      ${events.length ? events.map((event) => `<div>${escapeHtml(event.date || '')} ${escapeHtml(event.studentName || '')} ${escapeHtml(event.action || '')}${event.sessionNo ? ` 第 ${escapeHtml(event.sessionNo)} 堂` : ''}</div>`).join('') : '<div class="muted">尚無異動。</div>'}
    </div>
  `;
}

function renderMasterTeachers() {
  if (!elements.masterTeacherRows) return;
  renderMasterFilterOptions();
  const teachers = masterTeacherRowsData();
  const visibleTeachers = teachers.filter(masterTeacherMatchesFilters)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  elements.masterTeacherSummary.innerHTML = `
    <div class="record-item">
      <strong>老師 ${formatMoney(teachers.filter((teacher) => !teacher.archived).length)} 位</strong>
      <p>目前顯示 ${formatMoney(visibleTeachers.length)} 位，課程 ${formatMoney(teachers.reduce((sum, teacher) => sum + teacher.courseCount, 0))} 門，學生人次 ${formatMoney(teachers.reduce((sum, teacher) => sum + teacher.enrollmentCount, 0))}。</p>
    </div>
  `;
  elements.masterTeacherRows.innerHTML = visibleTeachers.length
    ? visibleTeachers.map((teacher) => `
      <tr class="${selectedMasterTeacherId === teacher.id ? 'is-selected' : ''}">
        <td><strong>${escapeHtml(teacher.name || '')}</strong></td>
        <td>${escapeHtml(teacher.subject || '')}</td>
        <td class="money">${formatMoney(teacher.courseCount)}</td>
        <td class="money">${formatMoney(teacher.enrollmentCount)}</td>
        <td class="money">${formatMoney(teacher.feeTotal)}</td>
        <td>${escapeHtml(teacher.defaultFixedRate ? `鐘點 ${formatMoney(teacher.defaultFixedRate)}` : `分潤 ${formatMoney(teacher.defaultShare || 50)}%`)}</td>
        <td>
          <button class="ghost tiny-button" data-view-master-teacher="${escapeHtml(teacher.id)}" type="button">查看</button>
          ${teacher.id.startsWith('virtual_teacher') ? '' : `<button class="ghost tiny-button" data-archive-master-teacher="${escapeHtml(teacher.id)}" type="button">${teacher.archived ? '復原' : '封存'}</button>`}
        </td>
      </tr>
    `).join('')
    : emptyRow(7);
  renderMasterTeacherDetail();
}

function renderMasterTeacherDetail() {
  if (!elements.masterTeacherDetail) return;
  const teacher = masterTeacherRowsData().find((row) => row.id === selectedMasterTeacherId);
  if (!teacher) {
    elements.masterTeacherDetail.innerHTML = '<p class="empty">選一位老師查看課程與薪資來源</p>';
    return;
  }
  const courseRows = (teacher.courses || [])
    .filter((course) => !elements.masterTeacherTermFilter?.value || course.term === elements.masterTeacherTermFilter.value)
    .sort((a, b) => `${a.term} ${a.courseName}`.localeCompare(`${b.term} ${b.courseName}`, 'zh-Hant'))
    .map((course) => `
      <tr>
        <td><strong>${escapeHtml(course.courseName)}</strong><br><span class="muted">${escapeHtml(course.cohort || '')}</span></td>
        <td>${escapeHtml(course.term || '')}</td>
        <td class="money">${formatMoney(course.enrollmentCount)}</td>
        <td class="money">${formatMoney(course.feeTotal)}</td>
        <td><button class="ghost tiny-button" data-view-master-course="${escapeHtml(course.id)}" type="button">看課程</button></td>
      </tr>
    `).join('');
  elements.masterTeacherDetail.innerHTML = `
    <h3>${escapeHtml(teacher.name)}</h3>
    <p class="muted">${escapeHtml([teacher.subject, teacher.contact].filter(Boolean).join(' / '))}</p>
    <div class="profile-grid">
      <div><strong>${formatMoney(teacher.courseCount)}</strong><span>課程</span></div>
      <div><strong>${formatMoney(teacher.enrollmentCount)}</strong><span>學生人次</span></div>
      <div><strong>${formatMoney(teacher.feeTotal)}</strong><span>收費合計</span></div>
      <div><strong>${escapeHtml(teacher.defaultFixedRate ? `鐘點 ${formatMoney(teacher.defaultFixedRate)}` : `分潤 ${formatMoney(teacher.defaultShare || 50)}%`)}</strong><span>預設薪資</span></div>
    </div>
    <h4>開設課程</h4>
    <div class="table-wrap embedded-table">
      <table>
        <thead><tr><th>課程</th><th>學期</th><th>學生</th><th>收費</th><th>操作</th></tr></thead>
        <tbody>${courseRows || emptyRow(5)}</tbody>
      </table>
    </div>
  `;
}

function renderMasterImportPreview() {
  if (!elements.masterImportRows) return;
  const plan = masterImportPreview || {
    stats: {
      students: { added: 0, existing: 0, skipped: 0 },
      terms: { added: 0, existing: 0, skipped: 0 },
      teachers: { added: 0, existing: 0, skipped: 0 },
      courses: { added: 0, existing: 0, skipped: 0 },
      enrollments: { added: 0, existing: 0, skipped: 0 },
      receivables: { added: 0, existing: 0, skipped: 0 }
    }
  };
  const labels = {
    students: '學生',
    terms: '學期',
    teachers: '老師',
    courses: '課程',
    enrollments: '選課',
    receivables: '應收'
  };
  elements.masterImportSummary.innerHTML = state.importSnapshot
    ? `<div class="record-item"><strong>目前快照可轉主檔</strong><p>學生 ${formatMoney(state.importSnapshot.students?.length || 0)} 位；按 Dry-run 後才會計算新增 / 已存在數量，轉換後會保留原始匯入快照供核對。</p></div>`
    : '<div class="record-item"><strong>尚未載入匯入快照</strong><p>請先載入雲端資料或 Numbers 快照。</p></div>';
  elements.masterImportRows.innerHTML = Object.entries(labels).map(([key, label]) => {
    const stat = plan.stats[key] || { added: 0, existing: 0, skipped: 0 };
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="money">${formatMoney(stat.added)}</td>
        <td class="money">${formatMoney(stat.existing)}</td>
        <td class="money">${formatMoney(stat.skipped)}</td>
        <td>${escapeHtml(key === 'receivables' ? '0 元選課不建立有效應收' : '用穩定 id 去重，可重複 dry-run')}</td>
      </tr>
    `;
  }).join('');
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

function payrollBlockEvents(block, month) {
  return (state.membershipEvents || [])
    .filter((event) => (
      (!month || String(event.date || event.month || '').startsWith(month)) &&
      eventMatchesCourseName(event, block.title || '')
    ))
    .sort((a, b) => `${a.date || ''}-${a.sessionNo || ''}`.localeCompare(`${b.date || ''}-${b.sessionNo || ''}`));
}

function payrollCloseRows(month) {
  const blocks = getTeacherRosterBlocks();
  const rows = blocks.map((block) => {
    const sessions = payrollSettlementSessionRows(block, month);
    const events = payrollBlockEvents(block, month);
    const status = sessions.length ? '可結算' : '缺堂次';
    const rowCount = block.rowCount ?? (block.rows || []).length;
    return {
      status,
      source: block.source === 'manualCourse' ? '網頁' : '匯入',
      rosterKey: block.key,
      teacherName: payrollSettlementTeacherName(block),
      courseName: block.title || '',
      rowCount,
      sessionCount: sessions.length,
      eventCount: events.length,
      note: sessions.length
        ? (events.length ? `${formatMoney(events.length)} 筆進退班，結算時會套用。` : '可進月底結算。')
        : '尚未儲存本月上課日期，不會進薪資總表。'
    };
  });

  const importedPayrollTitle = monthToImportedPayrollTitle(month);
  const payrollOnlySheets = (state.importSnapshot?.teacherSheets || [])
    .filter((sheet) => (sheet.payrollBlocks || []).length && !(sheet.rosterBlocks || []).length)
    .filter((sheet) => !importedPayrollTitle || (sheet.payrollBlocks || [])
      .some((block) => String(block.title || '').includes(importedPayrollTitle)))
    .map((sheet) => ({
      status: '需手動',
      source: '匯入薪資歷史',
      rosterKey: '',
      teacherName: sheet.summary?.sheet || sheet.sheet || '未命名分頁',
      courseName: '有薪資歷史，但沒有匯入老師名單',
      rowCount: 0,
      sessionCount: 0,
      eventCount: 0,
      note: '需用網頁新增課程 / 鐘點制處理，無法從匯入 roster 自動算人數。'
    }));

  return [...rows, ...payrollOnlySheets].sort((a, b) => {
    const order = { '需手動': 0, '缺堂次': 1, '可結算': 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      a.teacherName.localeCompare(b.teacherName, 'zh-Hant') ||
      a.courseName.localeCompare(b.courseName, 'zh-Hant');
  });
}

function renderPayrollCloseCheck() {
  const month = elements.payrollSettlementMonth.value || elements.payrollCalcMonth.value || currentMonthIso();
  const rows = payrollCloseRows(month);
  const readyCount = rows.filter((row) => row.status === '可結算').length;
  const missingCount = rows.filter((row) => row.status === '缺堂次').length;
  const manualCount = rows.filter((row) => row.status === '需手動').length;
  const eventCount = rows.reduce((sum, row) => sum + row.eventCount, 0);
  elements.payrollCloseSummary.innerHTML = [
    `<div class="summary-cell"><strong>${escapeHtml(month)}</strong><span>月份</span></div>`,
    summaryCell('可結算班級', readyCount),
    summaryCell('缺堂次班級', missingCount),
    summaryCell('需手動處理', manualCount),
    summaryCell('本月異動', eventCount)
  ].join('');
  elements.payrollCloseRows.innerHTML = rows.length
    ? rows.map((row) => `
      <tr ${row.rosterKey ? `data-open-payroll-block="${escapeHtml(row.rosterKey)}"` : ''}>
        <td><span class="status-tag ${row.status === '可結算' ? 'status-ok' : 'status-warn'}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.source)}</td>
        <td>${escapeHtml(row.teacherName)}</td>
        <td>${escapeHtml(row.courseName)}</td>
        <td class="money">${formatMoney(row.rowCount)}</td>
        <td class="money">${formatMoney(row.sessionCount)}</td>
        <td class="money">${formatMoney(row.eventCount)}</td>
        <td>${escapeHtml(row.note)}</td>
        <td>${row.rosterKey ? `<button class="ghost small" type="button" data-open-payroll-block="${escapeHtml(row.rosterKey)}">${row.status === '缺堂次' ? '處理堂次' : '查看'}</button>` : ''}</td>
      </tr>
    `).join('')
    : emptyRow(9);
}

function latestPayrollSettlementSnapshot(month) {
  return (state.payrollSettlements || [])
    .filter((row) => row.month === month)
    .slice()
    .sort((a, b) => String(b.savedAt || b.generatedAt || '').localeCompare(String(a.savedAt || a.generatedAt || '')))[0] || null;
}

function payrollWorkflowRows(month) {
  const closeRows = payrollCloseRows(month);
  const rosterCount = getTeacherRosterBlocks().length;
  const importStudentCount = (state.importSnapshot?.students || []).length;
  const manualCount = closeRows.filter((row) => row.status === '需手動').length;
  const missingCount = closeRows.filter((row) => row.status === '缺堂次').length;
  const readyCount = closeRows.filter((row) => row.status === '可結算').length;
  const eventCount = closeRows.reduce((sum, row) => sum + row.eventCount, 0);
  const activeSettlement = payrollSettlement?.month === month ? payrollSettlement : null;
  const savedSnapshot = latestPayrollSettlementSnapshot(month);
  return [
    {
      status: rosterCount ? '完成' : '待處理',
      step: '載入名單資料',
      metric: rosterCount ? `${formatMoney(importStudentCount)} 位學生 / ${formatMoney(rosterCount)} 個老師名單區塊` : '尚未載入',
      next: rosterCount ? '已可檢查堂次與月結。' : '先登入並載入雲端資料，或本機載入 Numbers 快照。'
    },
    {
      status: !rosterCount ? '待處理' : (manualCount ? '需確認' : '完成'),
      step: '處理需手動項目',
      metric: rosterCount ? `${formatMoney(manualCount)} 項` : '尚未載入',
      next: !rosterCount ? '先載入名單資料。' : (manualCount ? '先處理月結檢查最上方的需手動項目。' : '沒有 payroll-only 項目。')
    },
    {
      status: !rosterCount ? '待處理' : (missingCount ? '待處理' : '完成'),
      step: '補齊堂次日期',
      metric: rosterCount ? `${formatMoney(readyCount)} 可結算 / ${formatMoney(missingCount)} 缺堂次` : '尚未載入',
      next: !rosterCount ? '先載入名單資料。' : (missingCount ? '選缺堂次班級，填本月上課日期並儲存。' : '所有可自動計算的班級都有堂次日期。')
    },
    {
      status: rosterCount ? '完成' : '待處理',
      step: '確認本月進退班',
      metric: rosterCount ? `${formatMoney(eventCount)} 筆本月異動` : '尚未載入',
      next: !rosterCount ? '先載入名單資料。' : (eventCount ? '月結會套用這些進退班；請確認第幾堂或日期正確。' : '若本月有人加入或退出，先在本班本月進退班補上。')
    },
    {
      status: activeSettlement ? '完成' : '待處理',
      step: '產生月底結算',
      metric: activeSettlement ? `$${formatMoney(activeSettlement.total)} / ${formatMoney(activeSettlement.teachers.length)} 位老師` : '尚未產生',
      next: activeSettlement ? '檢查老師付款小計與班級明細。' : '堂次補完後按「產生月底結算」。'
    },
    {
      status: savedSnapshot ? '完成' : '待處理',
      step: '儲存月結快照',
      metric: savedSnapshot ? `$${formatMoney(savedSnapshot.total)} / ${String(savedSnapshot.savedAt || savedSnapshot.generatedAt || '').slice(0, 10)}` : '尚未儲存',
      next: savedSnapshot ? '已保留送審版本，可列印 / 存 PDF。' : '確認總額後按「儲存月結快照」。'
    }
  ];
}

function renderPayrollWorkflow() {
  const month = elements.payrollSettlementMonth.value || elements.payrollCalcMonth.value || currentMonthIso();
  const rows = payrollWorkflowRows(month);
  const completeCount = rows.filter((row) => row.status === '完成').length;
  const waitingCount = rows.length - completeCount;
  const savedSnapshot = latestPayrollSettlementSnapshot(month);
  elements.payrollWorkflowSummary.innerHTML = [
    `<div class="summary-cell"><strong>${escapeHtml(month)}</strong><span>月份</span></div>`,
    summaryCell('完成步驟', completeCount),
    summaryCell('待處理步驟', waitingCount),
    summaryCell('已存快照總額', savedSnapshot?.total || 0)
  ].join('');
  elements.payrollWorkflowRows.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="status-tag ${row.status === '完成' ? 'status-ok' : 'status-warn'}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.step)}</td>
      <td>${escapeHtml(row.metric)}</td>
      <td>${escapeHtml(row.next)}</td>
    </tr>
  `).join('');
}

function selectedMonthlyWorkflowMonth() {
  return elements.monthlyWorkflowMonth?.value ||
    elements.payrollSettlementMonth.value ||
    elements.payrollCalcMonth.value ||
    currentMonthIso();
}

function syncPayrollMonthFields(month) {
  if (!month) return;
  if (elements.monthlyWorkflowMonth) elements.monthlyWorkflowMonth.value = month;
  elements.payrollSettlementMonth.value = month;
  elements.payrollCalcMonth.value = month;
  if (elements.cleanPayrollMonth) elements.cleanPayrollMonth.value = month;
}

function activeMonthlySettlement(month) {
  return payrollSettlement?.month === month ? payrollSettlement : latestPayrollSettlementSnapshot(month);
}

function renderMonthlyWorkflow() {
  if (!elements.monthlyWorkflowSummary) return;
  const month = selectedMonthlyWorkflowMonth();
  syncPayrollMonthFields(month);
  const closeRows = payrollCloseRows(month);
  const workflowRows = payrollWorkflowRows(month);
  const settlement = activeMonthlySettlement(month);
  const readyCount = closeRows.filter((row) => row.status === '可結算').length;
  const missingCount = closeRows.filter((row) => row.status === '缺堂次').length;
  const manualCount = closeRows.filter((row) => row.status === '需手動').length;
  const eventCount = closeRows.reduce((sum, row) => sum + row.eventCount, 0);
  const savedSnapshot = latestPayrollSettlementSnapshot(month);

  elements.monthlyWorkflowSummary.innerHTML = [
    `<div class="summary-cell"><strong>${escapeHtml(month)}</strong><span>結算月份</span></div>`,
    summaryCell('可結算班級', readyCount),
    summaryCell('缺堂次班級', missingCount),
    summaryCell('需手動處理', manualCount),
    summaryCell('本月異動', eventCount),
    summaryCell('目前應付總額', settlement?.total || 0),
    summaryCell('已存快照', savedSnapshot ? 1 : 0)
  ].join('');

  elements.monthlyWorkflowChecklist.innerHTML = workflowRows.map((row) => `
    <tr>
      <td><span class="status-tag ${row.status === '完成' ? 'status-ok' : 'status-warn'}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.step)}</td>
      <td>${escapeHtml(row.metric)}</td>
      <td>${escapeHtml(row.next)}</td>
    </tr>
  `).join('');

  elements.monthlyWorkflowCourseRows.innerHTML = closeRows.length
    ? closeRows.map((row) => `
      <tr ${row.rosterKey ? `data-monthly-open-payroll-block="${escapeHtml(row.rosterKey)}"` : ''}>
        <td><span class="status-tag ${row.status === '可結算' ? 'status-ok' : 'status-warn'}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.teacherName)}</td>
        <td>${escapeHtml(row.courseName)}</td>
        <td class="money">${formatMoney(row.rowCount)}</td>
        <td class="money">${formatMoney(row.sessionCount)}</td>
        <td class="money">${formatMoney(row.eventCount)}</td>
        <td>${escapeHtml(row.note)}</td>
        <td>${row.rosterKey ? `<button class="ghost small" type="button" data-monthly-open-payroll-block="${escapeHtml(row.rosterKey)}">${row.status === '缺堂次' ? '補堂次' : '查看'}</button>` : ''}</td>
      </tr>
    `).join('')
    : emptyRow(8);

  const classRows = settlement?.classes?.filter((row) => row.sessionCount > 0) || [];
  elements.monthlyWorkflowTeacherRows.innerHTML = classRows.length
    ? classRows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.teacherName)}</strong></td>
        <td>${escapeHtml(row.courseName)}</td>
        <td class="money">${formatMoney(row.sessionCount)}</td>
        <td>${escapeHtml(row.headcountText || '')}</td>
        <td class="money">${formatMoney(row.total)}</td>
        <td>${escapeHtml(row.status || row.methodLabel || '')}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="6" class="empty">尚未產生 ${escapeHtml(month)} 月結；先補堂次，再按「產生月底結算」。</td></tr>`;

  const hasSettlement = !!(payrollSettlement?.month === month && payrollSettlement.teachers?.length);
  elements.monthlyWorkflowPrintSettlement.disabled = !hasSettlement;
  elements.monthlyWorkflowSaveSettlement.disabled = !hasSettlement;
}

function payrollSettlementSettings() {
  return {
    month: elements.payrollSettlementMonth.value || elements.payrollCalcMonth.value || currentMonthIso(),
    headRate: Math.max(0, parseNumber(elements.payrollSettlementHeadRate.value || 670)),
    sharePercent: Math.max(0, parseNumber(elements.payrollSettlementShare.value || 50)),
    scienceRate: Math.max(0, parseNumber(elements.payrollSettlementScienceRate.value || 900)),
    minBase: Math.max(0, parseNumber(elements.payrollSettlementMinBase.value || 4500)),
    minThreshold: Math.max(0, parseNumber(elements.payrollSettlementMinThreshold.value || 15)),
    minBonus: Math.max(0, parseNumber(elements.payrollSettlementMinBonus.value || 300)),
    hourlyRate: Math.max(0, parseNumber(elements.payrollSettlementHourlyRate.value || 800)),
    hourlyHours: Math.max(0, parseNumber(elements.payrollSettlementHours.value || 3))
  };
}

function payrollSettlementTeacherName(block) {
  const sheet = block.teacherSheet || '';
  const mapped = {
    '化學師資': '化學師資',
    '物理師資-Nick': '物理師資-Nick',
    '英文師資': '英文師資',
    '數學師資-明軒': '明軒數學',
    '數學師資-黃浩': '黃浩數學',
    '社會師資-蔣明': '蔣明社會',
    '國文師資': '國文師資'
  }[sheet];
  return block.teacherName || mapped || sheet || '未命名老師';
}

function payrollSettlementMethod(block, settings) {
  const sheet = block.teacherSheet || '';
  const title = block.title || '';
  if (sheet.includes('明軒') || title.includes('明軒')) {
    return {
      kind: 'mingxuan',
      label: `保底 ${formatMoney(settings.minBase)} + 超過 ${formatMoney(settings.minThreshold)} 人每人 ${formatMoney(settings.minBonus)}`
    };
  }
  if (sheet.includes('國文') || title.includes('國文')) {
    return {
      kind: 'hourly',
      label: `鐘點 ${formatMoney(settings.hourlyRate)} x ${formatMoney(settings.hourlyHours)} 小時`
    };
  }
  const manualFixedRate = Math.max(0, parseNumber(block.defaultFixedRate));
  if (block.source === 'manualCourse' && manualFixedRate > 0) {
    return {
      kind: 'fixedSession',
      fixedRate: manualFixedRate,
      label: `固定 ${formatMoney(manualFixedRate)} / 堂`
    };
  }
  const perHeadRate = title.includes('自然科學班') ? settings.scienceRate : settings.headRate;
  return {
    kind: 'share',
    perHeadRate,
    teacherPerHead: Math.round(perHeadRate * (settings.sharePercent / 100)),
    label: `人均堂收 ${formatMoney(perHeadRate)} x 分潤 ${formatMoney(settings.sharePercent)}%`
  };
}

function payrollSettlementSessionRows(block, month) {
  const key = payrollSessionPlanKey(block.key, month);
  const plan = key ? state.courseSessionPlans[key] : null;
  return (plan?.sessions || []).slice().sort((a, b) => Number(a.sessionNo || 0) - Number(b.sessionNo || 0));
}

function payrollSettlementStudentState(row, block, month, sessions) {
  const fields = row.fields || {};
  const name = fields['姓名'] || '';
  const explicitStudentId = fields['學生ID'] || '';
  const candidates = explicitStudentId ? [] : payrollStudentCandidates(name, block.title || '');
  const isAmbiguousStudent = !explicitStudentId && candidates.length > 1;
  const studentId = explicitStudentId || (candidates.length === 1 ? candidates[0].id : '');
  const rawEvents = isAmbiguousStudent
    ? payrollEventsForStudentName(name, block.title || '', month)
    : payrollEventsForStudent(name, block.title || '', month, studentId);
  const events = isAmbiguousStudent ? [] : rawEvents;
  const effective = effectiveSessionsForEvents(sessions.length, events, sessions);
  return {
    name,
    school: fields['學校'] || '',
    effective,
    eventCount: rawEvents.length,
    skippedEventCount: isAmbiguousStudent ? rawEvents.length : 0,
    note: [
      effective.note,
      isAmbiguousStudent && rawEvents.length ? '同名風險，異動未自動套用' : ''
    ].filter(Boolean).join('；')
  };
}

function compactHeadcountText(details) {
  const counts = details.map((detail) => detail.headcount);
  if (!counts.length) return '未設定';
  const first = counts[0];
  const last = counts[counts.length - 1];
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  if (min === max) return `${formatMoney(first)} 人固定`;
  if (counts.length <= 6) return counts.map((count) => formatMoney(count)).join(' / ');
  return `${formatMoney(first)} -> ${formatMoney(last)} 人（${formatMoney(min)}-${formatMoney(max)}）`;
}

function buildPayrollSettlementClass(block, settings) {
  const sessions = payrollSettlementSessionRows(block, settings.month);
  const teacherName = payrollSettlementTeacherName(block);
  const method = payrollSettlementMethod(block, settings);
  const base = {
    rosterKey: block.key,
    teacherName,
    courseName: block.title || '',
    methodKind: method.kind,
    methodLabel: method.label,
    sessionCount: sessions.length,
    personSessions: 0,
    total: 0,
    headcountText: '未設定',
    status: '未設定堂次日期',
    sessionDetails: [],
    skippedEventCount: 0
  };
  if (!sessions.length) return base;

  const students = (block.rows || [])
    .map((row) => payrollSettlementStudentState(row, block, settings.month, sessions))
    .filter((student) => student.name);
  const skippedEventCount = students.reduce((sum, student) => sum + student.skippedEventCount, 0);
  const eventCount = students.reduce((sum, student) => sum + student.eventCount, 0);

  const sessionDetails = sessions.map((session) => {
    const sessionNo = Number(session.sessionNo || 0);
    const headcount = students.filter((student) => (
      sessionNo >= Number(student.effective.activeFrom || 1) &&
      sessionNo <= Number(student.effective.activeUntil || sessions.length)
    )).length;
    let amount = 0;
    if (method.kind === 'mingxuan') {
      amount = settings.minBase + Math.max(0, headcount - settings.minThreshold) * settings.minBonus;
    } else if (method.kind === 'hourly') {
      amount = Math.round(settings.hourlyRate * settings.hourlyHours);
    } else if (method.kind === 'fixedSession') {
      amount = Math.round(method.fixedRate || 0);
    } else {
      amount = Math.round((method.teacherPerHead || 0) * headcount);
    }
    return {
      sessionNo,
      date: session.date || '',
      headcount,
      amount
    };
  });

  const personSessions = sessionDetails.reduce((sum, detail) => sum + detail.headcount, 0);
  const total = sessionDetails.reduce((sum, detail) => sum + detail.amount, 0);
  return {
    ...base,
    sessionCount: sessions.length,
    personSessions,
    total,
    headcountText: compactHeadcountText(sessionDetails),
    status: [
      '已計算',
      eventCount ? `${formatMoney(eventCount)} 筆異動` : '',
      skippedEventCount ? `${formatMoney(skippedEventCount)} 筆同名待確認` : ''
    ].filter(Boolean).join('，'),
    sessionDetails,
    skippedEventCount
  };
}

function buildPayrollSettlementData() {
  const settings = payrollSettlementSettings();
  elements.payrollSettlementMonth.value = settings.month;
  const blocks = getTeacherRosterBlocks();
  const classes = blocks
    .map((block) => buildPayrollSettlementClass(block, settings))
    .sort((a, b) => {
      const aMissing = a.sessionCount ? 0 : 1;
      const bMissing = b.sessionCount ? 0 : 1;
      return aMissing - bMissing ||
        a.teacherName.localeCompare(b.teacherName, 'zh-Hant') ||
        a.courseName.localeCompare(b.courseName, 'zh-Hant');
    });

  const teacherMap = new Map();
  for (const row of classes.filter((item) => item.sessionCount > 0)) {
    const key = `${row.teacherName}::${row.methodLabel}`;
    const current = teacherMap.get(key) || {
      key,
      teacherName: row.teacherName,
      methodLabel: row.methodLabel,
      classCount: 0,
      sessionCount: 0,
      personSessions: 0,
      total: 0
    };
    current.classCount += 1;
    current.sessionCount += row.sessionCount;
    current.personSessions += row.personSessions;
    current.total += row.total;
    teacherMap.set(key, current);
  }

  const teachers = Array.from(teacherMap.values())
    .sort((a, b) => b.total - a.total || a.teacherName.localeCompare(b.teacherName, 'zh-Hant'));
  const total = teachers.reduce((sum, teacher) => sum + teacher.total, 0);
  return {
    id: nowId('payroll_settlement'),
    generatedAt: new Date().toISOString(),
    month: settings.month,
    settings,
    teachers,
    classes,
    calculatedClassCount: classes.filter((row) => row.sessionCount > 0).length,
    missingClassCount: classes.filter((row) => row.sessionCount === 0).length,
    total
  };
}

function monthToImportedPayrollTitle(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}年${Number(match[2])}月 堂數`;
}

function excelSerialDateToIso(value) {
  const serial = Number(String(value ?? '').trim());
  if (!Number.isFinite(serial) || serial <= 0) return String(value || '');
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toISOString().slice(0, 10);
}

function importedPayrollCourseBase(courseName) {
  return String(courseName || '').replace(/\d+\s*$/, '').trim() || String(courseName || '').trim();
}

function importedPayrollHeadcount(row, headers) {
  const total = parseNumber(row.J);
  const shareAmount = parseNumber(row.I);
  if (headers.I?.includes('人數津貼')) {
    return Math.max(0, Math.round(15 + (shareAmount / 300)));
  }
  if (shareAmount > 0) return Math.max(0, Math.round(total / shareAmount));
  return 0;
}

function importedPayrollRowsForMonth(month) {
  const title = monthToImportedPayrollTitle(month);
  if (!title) return [];
  return (state.importSnapshot?.teacherSheets || [])
    .flatMap((sheet) => (sheet.payrollBlocks || []).map((block) => ({
      teacherSheet: sheet.summary?.sheet || block.sheet || '',
      block
    })))
    .filter(({ block }) => String(block.title || '').includes(title));
}

function buildPayrollSettlementFromImportedPayroll() {
  const month = elements.payrollSettlementMonth.value || elements.payrollCalcMonth.value || currentMonthIso();
  const importedBlocks = importedPayrollRowsForMonth(month);
  const classes = [];
  const teachers = [];

  for (const { teacherSheet, block } of importedBlocks) {
    const parsedRows = (block.rows || []).map((row) => (
      Object.fromEntries((row.cells || []).map((cell) => [cell.column, cell.value]))
    ));
    const headers = parsedRows[0] || {};
    const totalRow = parsedRows.find((row) => row.B === '總計');
    const teacherName = totalRow?.A || payrollSettlementTeacherName({ teacherSheet });
    const teacher = {
      key: `${teacherName}::Numbers 匯入薪資表`,
      teacherName,
      methodLabel: 'Numbers 匯入薪資表',
      classCount: 0,
      sessionCount: 0,
      personSessions: 0,
      total: 0
    };
    const classMap = new Map();

    for (const row of parsedRows.slice(1)) {
      const courseName = String(row.B || '').trim();
      const amount = Math.round(parseNumber(row.J));
      if (!courseName || courseName === '總計' || !amount) continue;
      const courseBase = importedPayrollCourseBase(courseName);
      const current = classMap.get(courseBase) || {
        rosterKey: '',
        teacherName,
        courseName: courseBase,
        methodKind: 'importedNumbers',
        methodLabel: 'Numbers 匯入薪資表',
        sessionCount: 0,
        personSessions: 0,
        total: 0,
        headcountText: '',
        status: '由 Numbers 薪資表匯入',
        sessionDetails: [],
        skippedEventCount: 0
      };
      const headcount = importedPayrollHeadcount(row, headers);
      current.sessionDetails.push({
        sessionNo: current.sessionDetails.length + 1,
        date: importedPayrollDateToIso(row.A),
        headcount,
        amount
      });
      current.sessionCount += 1;
      current.personSessions += headcount;
      current.total += amount;
      classMap.set(courseBase, current);
    }

    const teacherClasses = Array.from(classMap.values()).map((row) => ({
      ...row,
      headcountText: compactHeadcountText(row.sessionDetails)
    }));
    for (const row of teacherClasses) {
      teacher.classCount += 1;
      teacher.sessionCount += row.sessionCount;
      teacher.personSessions += row.personSessions;
      teacher.total += row.total;
    }
    if (totalRow?.J) teacher.total = Math.round(parseNumber(totalRow.J));
    if (teacher.sessionCount > 0) {
      teachers.push(teacher);
      classes.push(...teacherClasses);
    }
  }

  const total = teachers.reduce((sum, teacher) => sum + teacher.total, 0);
  return {
    id: nowId('payroll_settlement_imported'),
    generatedAt: new Date().toISOString(),
    month,
    settings: { source: 'importedNumbersPayroll' },
    teachers: teachers.sort((a, b) => b.total - a.total || a.teacherName.localeCompare(b.teacherName, 'zh-Hant')),
    classes: classes.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'zh-Hant') || a.courseName.localeCompare(b.courseName, 'zh-Hant')),
    calculatedClassCount: classes.length,
    missingClassCount: 0,
    total
  };
}

function renderPayrollSettlement() {
  if (!payrollSettlement) {
    elements.payrollSettlementSummary.innerHTML = '<div class="record-item"><p>尚未產生月底結算。先儲存各班堂次日期，再按「產生月底結算」。</p></div>';
    elements.payrollSettlementTeacherRows.innerHTML = emptyRow(7);
    elements.payrollSettlementClassRows.innerHTML = emptyRow(7);
    elements.printPayrollSettlement.disabled = true;
    elements.savePayrollSettlement.disabled = true;
    return;
  }

  elements.payrollSettlementSummary.innerHTML = [
    `<div class="summary-cell"><strong>${escapeHtml(payrollSettlement.month)}</strong><span>月份</span></div>`,
    summaryCell('已計算課程', payrollSettlement.calculatedClassCount),
    summaryCell('未設定堂次', payrollSettlement.missingClassCount),
    summaryCell('老師數', payrollSettlement.teachers.length),
    summaryCell('應付總額', payrollSettlement.total)
  ].join('');

  elements.payrollSettlementTeacherRows.innerHTML = payrollSettlement.teachers.length
    ? payrollSettlement.teachers.map((teacher) => `
      <tr>
        <td>${escapeHtml(teacher.teacherName)}</td>
        <td>${escapeHtml(teacher.methodLabel)}</td>
        <td class="money">${formatMoney(teacher.classCount)}</td>
        <td class="money">${formatMoney(teacher.sessionCount)}</td>
        <td class="money">${formatMoney(teacher.personSessions)}</td>
        <td class="money">${formatMoney(teacher.total)}</td>
        <td><button class="ghost small" type="button" data-print-payroll-teacher="${escapeHtml(teacher.key || `${teacher.teacherName}::${teacher.methodLabel}`)}">列印這位</button></td>
      </tr>
    `).join('')
    : emptyRow(7);

  elements.payrollSettlementClassRows.innerHTML = payrollSettlement.classes.length
    ? payrollSettlement.classes.map((row) => `
      <tr>
        <td>${escapeHtml(row.teacherName)}</td>
        <td>${escapeHtml(row.courseName)}</td>
        <td class="money">${formatMoney(row.sessionCount)}</td>
        <td>${escapeHtml(row.headcountText)}</td>
        <td>${escapeHtml(row.methodLabel)}</td>
        <td class="money">${formatMoney(row.total)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>
    `).join('')
    : emptyRow(7);

  elements.printPayrollSettlement.disabled = payrollSettlement.teachers.length === 0;
  elements.savePayrollSettlement.disabled = payrollSettlement.teachers.length === 0;
}

function renderPayrollSettlementArchive() {
  const rows = (state.payrollSettlements || [])
    .slice()
    .sort((a, b) => String(b.savedAt || b.generatedAt || '').localeCompare(String(a.savedAt || a.generatedAt || '')));
  elements.payrollSettlementArchiveRows.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.month || '')}</td>
        <td>${escapeHtml((row.savedAt || row.generatedAt || '').slice(0, 19).replace('T', ' '))}</td>
        <td class="money">${formatMoney((row.teachers || []).length)}</td>
        <td class="money">${formatMoney(row.calculatedClassCount)}</td>
        <td class="money">${formatMoney(row.missingClassCount)}</td>
        <td class="money">${formatMoney(row.total)}</td>
        <td><button class="ghost small" type="button" data-print-payroll-settlement="${escapeHtml(row.id)}">列印 / 存 PDF</button></td>
      </tr>
    `).join('')
    : emptyRow(7);
}

function buildPayrollSettlementPrintHtml(settlement) {
  const generatedAt = new Date(settlement.generatedAt).toLocaleString('zh-TW', { hour12: false });
  const teacherRows = settlement.teachers.map((teacher) => `
    <tr>
      <td>${escapeHtml(teacher.teacherName)}</td>
      <td>${escapeHtml(teacher.methodLabel)}</td>
      <td class="money">${formatMoney(teacher.classCount)}</td>
      <td class="money">${formatMoney(teacher.sessionCount)}</td>
      <td class="money">${formatMoney(teacher.personSessions)}</td>
      <td class="money">${formatMoney(teacher.total)}</td>
    </tr>
  `).join('');
  const classRows = settlement.classes
    .filter((row) => row.sessionCount > 0)
    .map((row) => {
      const detailText = row.sessionDetails
        .map((detail) => `第${formatMoney(detail.sessionNo)}堂 ${detail.date} ${formatMoney(detail.headcount)}人 $${formatMoney(detail.amount)}`)
        .join(' / ');
      return `
        <tr>
          <td>${escapeHtml(row.teacherName)}</td>
          <td>${escapeHtml(row.courseName)}</td>
          <td>${escapeHtml(row.headcountText)}</td>
          <td>${escapeHtml(row.methodLabel)}</td>
          <td>${escapeHtml(detailText)}</td>
          <td class="money">${formatMoney(row.total)}</td>
        </tr>
      `;
    }).join('');
  const missingRows = settlement.classes
    .filter((row) => row.sessionCount === 0)
    .map((row) => `${row.teacherName}｜${row.courseName}`)
    .join('、');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>山熊升大老師薪資總表 ${escapeHtml(settlement.month)}</title>
  <style>
    body { color: #102a3a; font-family: "Microsoft JhengHei", Arial, sans-serif; margin: 24px; }
    h1 { font-size: 24px; margin: 0 0 10px; }
    h2 { font-size: 17px; margin: 22px 0 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #9fb7c7; padding: 7px 9px; vertical-align: top; }
    th { background: #e8f4fb; font-weight: 700; }
    .money { text-align: right; white-space: nowrap; }
    .meta { color: #49606d; margin: 0 0 16px; }
    .total { font-size: 20px; font-weight: 800; text-align: right; }
    .warn { color: #9a5b00; font-size: 13px; margin-top: 12px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>山熊升大老師薪資總表</h1>
  <p class="meta">月份：${escapeHtml(settlement.month)}｜製表：${escapeHtml(generatedAt)}</p>
  <p class="total">應付總額：$${formatMoney(settlement.total)}</p>
  <h2>老師付款小計</h2>
  <table>
    <thead>
      <tr><th>老師</th><th>計算方式</th><th>課程數</th><th>堂數</th><th>人次</th><th>應付小計</th></tr>
    </thead>
    <tbody>${teacherRows || `<tr><td colspan="6">尚無已設定堂次的課程</td></tr>`}</tbody>
  </table>
  <h2>班級明細</h2>
  <table>
    <thead>
      <tr><th>老師</th><th>班級 / 課程</th><th>人數變化</th><th>計算方式</th><th>堂次明細</th><th>小計</th></tr>
    </thead>
    <tbody>${classRows || `<tr><td colspan="6">尚無已設定堂次的課程</td></tr>`}</tbody>
  </table>
  ${missingRows ? `<p class="warn">未列入付款，因為尚未設定堂次日期：${escapeHtml(missingRows)}</p>` : ''}
</body>
</html>`;
}

function settlementTeacherKey(teacher) {
  return teacher?.key || `${teacher?.teacherName || ''}::${teacher?.methodLabel || ''}`;
}

function settlementClassesForTeacher(settlement, teacher) {
  return (settlement?.classes || []).filter((row) => (
    row.sessionCount > 0 &&
    row.teacherName === teacher.teacherName &&
    row.methodLabel === teacher.methodLabel
  ));
}

function buildPayrollSettlementTeacherPrintHtml(settlement, teacherKey) {
  const teacher = (settlement?.teachers || []).find((row) => settlementTeacherKey(row) === teacherKey);
  if (!teacher) return '';
  const generatedAt = new Date(settlement.generatedAt).toLocaleString('zh-TW', { hour12: false });
  const classRows = settlementClassesForTeacher(settlement, teacher)
    .map((row) => {
      const detailText = (row.sessionDetails || [])
        .map((detail) => `第${formatMoney(detail.sessionNo)}堂 ${detail.date} ${formatMoney(detail.headcount)}人 $${formatMoney(detail.amount)}`)
        .join(' / ');
      return `
        <tr>
          <td>${escapeHtml(row.courseName)}</td>
          <td class="money">${formatMoney(row.sessionCount)}</td>
          <td>${escapeHtml(row.headcountText)}</td>
          <td>${escapeHtml(detailText)}</td>
          <td class="money">${formatMoney(row.total)}</td>
        </tr>
      `;
    }).join('');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(settlement.month)} ${escapeHtml(teacher.teacherName)} 薪資表</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #102a3a; font-family: -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", Arial, sans-serif; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 14px; text-align: center; }
    .toolbar { margin: 0 0 12px; text-align: right; }
    .toolbar button { background: #237fa6; border: 0; border-radius: 8px; color: white; cursor: pointer; font: inherit; font-weight: 700; padding: 8px 14px; }
    .meta { border: 1px solid #9fb9c7; border-radius: 8px; display: grid; grid-template-columns: repeat(2, 1fr); margin-bottom: 12px; overflow: hidden; }
    .meta div { border-bottom: 1px solid #d6e3ea; padding: 8px 10px; }
    .meta div:nth-last-child(-n + 2) { border-bottom: 0; }
    .label { color: #5c6f7b; display: block; font-size: 12px; font-weight: 700; margin-bottom: 2px; }
    table { border-collapse: collapse; font-size: 12px; width: 100%; }
    th, td { border: 1px solid #9fb9c7; padding: 6px 7px; vertical-align: top; }
    th { background: #e3f3f9; color: #14232e; }
    .money { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
    .total { font-size: 20px; font-weight: 800; margin: 14px 0; text-align: right; }
    .sign { display: grid; gap: 12px; grid-template-columns: repeat(3, 1fr); margin-top: 22px; }
    .sign div { border-bottom: 1px solid #14232e; height: 46px; padding-top: 28px; }
    @media print { .toolbar { display: none; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">列印 / 存 PDF</button></div>
  <h1>山熊升大老師薪資表</h1>
  <section class="meta">
    <div><span class="label">月份</span>${escapeHtml(settlement.month)}</div>
    <div><span class="label">老師</span>${escapeHtml(teacher.teacherName)}</div>
    <div><span class="label">計算方式</span>${escapeHtml(teacher.methodLabel)}</div>
    <div><span class="label">製表時間</span>${escapeHtml(generatedAt)}</div>
    <div><span class="label">課程數</span>${formatMoney(teacher.classCount)}</div>
    <div><span class="label">堂數 / 人次</span>${formatMoney(teacher.sessionCount)} 堂 / ${formatMoney(teacher.personSessions)} 人次</div>
  </section>
  <p class="total">應付小計：$${formatMoney(teacher.total)}</p>
  <table>
    <thead>
      <tr><th>班級 / 課程</th><th>堂數</th><th>人數變化</th><th>堂次明細</th><th>小計</th></tr>
    </thead>
    <tbody>${classRows || `<tr><td colspan="5">尚無已設定堂次的課程</td></tr>`}</tbody>
  </table>
  <section class="sign">
    <div>製表</div>
    <div>覆核</div>
    <div>付款確認</div>
  </section>
</body>
</html>`;
}

function openPayrollSettlementTeacherPrint(settlement, teacherKey) {
  const html = buildPayrollSettlementTeacherPrintHtml(settlement, teacherKey);
  if (!html) return;
  const teacher = (settlement.teachers || []).find((row) => settlementTeacherKey(row) === teacherKey);
  const popup = window.open('', '_blank');
  if (!popup) {
    downloadFile(`bearhigh-payroll-${filenameSafe(settlement.month)}-${filenameSafe(teacher?.teacherName || 'teacher')}.html`, html, 'text/html;charset=utf-8');
    setCloudStatus('瀏覽器封鎖列印視窗，已改下載單一老師 HTML，可開啟後列印成 PDF');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 350);
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
  state.payrollSettlements = mergeRecordsById(state.payrollSettlements, Object.values(manual.payrollSettlements || {}));
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

async function saveCloudRecordsBatch(recordsByKind) {
  if (!currentUser) return;
  const syncedAt = new Date().toISOString();
  const syncedBy = currentUser.email || currentUser.uid;
  const updates = {};
  for (const [kind, rows] of Object.entries(recordsByKind || {})) {
    for (const row of rows || []) {
      if (!row?.id) continue;
      updates[`manual/${kind}/${safeFirebaseKey(row.id)}`] = {
        ...row,
        syncedAt,
        syncedBy
      };
    }
  }
  if (!Object.keys(updates).length) return;
  await update(accountingRef(''), updates);
  setCloudStatus('雲端已批次同步');
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
  elements.batchPaymentAssetAccount.innerHTML = elements.paymentAssetAccount.innerHTML;

  const studentsWithReceivables = Array.from(new Map((state.receivables || [])
    .filter((receivable) => receivable.status !== 'void')
    .map((receivable) => [receivable.studentId || receivable.studentName, receivable])).values())
    .sort((a, b) => String(a.studentName || '').localeCompare(String(b.studentName || ''), 'zh-Hant'));
  const selectedStudent = elements.batchPaymentStudent.value;
  elements.batchPaymentStudent.innerHTML = studentsWithReceivables.length
    ? studentsWithReceivables.map((receivable) => `<option value="${escapeHtml(receivable.studentId || receivable.studentName)}">${escapeHtml(receivable.studentName)}</option>`).join('')
    : '<option value="">尚無學生應收</option>';
  elements.batchPaymentStudent.value = studentsWithReceivables.some((receivable) => (receivable.studentId || receivable.studentName) === selectedStudent)
    ? selectedStudent
    : (studentsWithReceivables[0]?.studentId || studentsWithReceivables[0]?.studentName || '');
  elements.batchPaymentStudent.disabled = !studentsWithReceivables.length;

  const selectedRefund = elements.refundReceivable.value;
  const refundable = (state.receivables || [])
    .filter((receivable) => receivable.status !== 'void' && !receivable.withdrawal && parseNumber(receivable.paidAmount) > 0)
    .sort((a, b) => `${a.studentName || ''} ${a.courseName || ''}`.localeCompare(`${b.studentName || ''} ${b.courseName || ''}`, 'zh-Hant'));
  elements.refundReceivable.innerHTML = refundable.length
    ? refundable.map((receivable) => `<option value="${escapeHtml(receivable.id)}">${escapeHtml(receivable.studentName)}｜${escapeHtml(receivable.courseName)}｜已收 ${formatMoney(receivable.paidAmount)}</option>`).join('')
    : '<option value="">尚無可退費收款</option>';
  elements.refundReceivable.value = refundable.some((receivable) => receivable.id === selectedRefund) ? selectedRefund : (refundable[0]?.id || '');
  elements.refundReceivable.disabled = !refundable.length;
  renderBatchPaymentChoices();
  renderRefundPreview();
}

function receivablesForBatchStudent() {
  const studentKey = elements.batchPaymentStudent.value;
  if (!studentKey) return [];
  return (state.receivables || [])
    .filter((receivable) => (
      receivable.status !== 'void' &&
      (receivable.studentId === studentKey || (!receivable.studentId && receivable.studentName === studentKey))
    ))
    .sort((a, b) => String(a.courseName || '').localeCompare(String(b.courseName || ''), 'zh-Hant'));
}

function selectedBatchReceivables() {
  const selectedIds = Array.from(elements.batchPaymentReceivables.querySelectorAll('input[name="batchReceivable"]:checked'))
    .map((input) => input.value);
  return receivablesForBatchStudent().filter((receivable) => selectedIds.includes(receivable.id));
}

function distributeAmount(total, weights) {
  const roundedTotal = Math.round(parseNumber(total));
  const sum = weights.reduce((value, item) => value + Math.max(0, parseNumber(item.weight)), 0);
  if (!sum || roundedTotal === 0) return weights.map((item) => ({ ...item, amount: 0 }));
  let used = 0;
  return weights.map((item, index) => {
    const amount = index === weights.length - 1
      ? roundedTotal - used
      : Math.round(roundedTotal * (Math.max(0, parseNumber(item.weight)) / sum));
    used += amount;
    return { ...item, amount };
  });
}

function distributeAmountEven(total, items) {
  const roundedTotal = Math.round(parseNumber(total));
  if (!items.length || roundedTotal === 0) return items.map((item) => ({ ...item, amount: 0 }));
  const base = Math.trunc(roundedTotal / items.length);
  let used = 0;
  return items.map((item, index) => {
    const amount = index === items.length - 1 ? roundedTotal - used : base;
    used += amount;
    return { ...item, amount };
  });
}

function appendUniqueNotes(...parts) {
  const seen = new Set();
  return parts
    .flatMap((part) => String(part || '').split('；'))
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join('；');
}

function batchPaymentPlan() {
  const receivables = selectedBatchReceivables();
  const data = Object.fromEntries(new FormData(elements.batchPaymentForm).entries());
  const packageDiscount = Math.max(0, parseNumber(data.packageDiscount));
  const voucherAmount = Math.max(0, parseNumber(data.voucherAmount));
  const paidAmount = Math.max(0, parseNumber(data.paidAmount));
  const discountInputTotal = packageDiscount + voucherAmount;
  const discountShares = discountInputTotal
    ? distributeAmountEven(discountInputTotal, receivables.map((receivable) => ({ receivable })))
    : receivables.map((receivable) => ({
      receivable,
      amount: Math.max(0, parseNumber(receivable.discountAmount) || (parseNumber(receivable.originalAmount) - parseNumber(receivable.amount)))
    }));
  const netRows = receivables.map((receivable, index) => {
    const discount = discountShares[index]?.amount || 0;
    const originalAmount = Math.max(parseNumber(receivable.originalAmount), parseNumber(receivable.amount), parseNumber(receivable.balance));
    const netAmount = Math.max(0, originalAmount - discount);
    const alreadyPaid = postedPaymentAmountForReceivable(receivable.id);
    const remaining = Math.max(0, netAmount - alreadyPaid);
    return { receivable, discount, originalAmount, netAmount, alreadyPaid, remaining };
  });
  const remainingTotal = netRows.reduce((sum, row) => sum + row.remaining, 0);
  const paidToApply = Math.min(paidAmount, remainingTotal);
  const paymentShares = distributeAmount(paidToApply, netRows.map((row) => ({ row, weight: row.remaining })));
  return {
    date: data.date || todayIso(),
    method: data.method || '轉帳',
    assetAccountId: data.assetAccountId || 'bank_main',
    installmentNote: String(data.installmentNote || '').trim(),
    packageDiscount,
    voucherAmount,
    discountInputTotal,
    paidAmount,
    unappliedAmount: Math.max(0, paidAmount - paidToApply),
    rows: netRows.map((row, index) => ({
      ...row,
      paymentAmount: Math.min(row.remaining, Math.max(0, paymentShares[index]?.amount || 0))
    }))
  };
}

function renderBatchPaymentChoices() {
  if (!elements.batchPaymentReceivables) return;
  const rows = receivablesForBatchStudent();
  elements.batchPaymentReceivables.innerHTML = rows.length
    ? rows.map((receivable) => `
      <label class="check-card">
        <input type="checkbox" name="batchReceivable" value="${escapeHtml(receivable.id)}" ${parseNumber(receivable.balance) > 0 ? 'checked' : ''}>
        <span>
          <strong>${escapeHtml(receivable.courseName)}</strong>
          應收 ${formatMoney(receivable.amount)}，已收 ${formatMoney(receivable.paidAmount)}，未收 ${formatMoney(receivable.balance)}
        </span>
      </label>
    `).join('')
    : '<p class="empty">這位學生目前沒有科目應收。</p>';
  renderBatchPaymentPreview();
}

function renderBatchPaymentPreview() {
  if (!elements.batchPaymentPreview) return;
  const plan = batchPaymentPlan();
  if (!plan.rows.length) {
    elements.batchPaymentPreview.innerHTML = '<div class="notice-line">請先選學生與本次收款科目。</div>';
    return;
  }
  const netTotal = plan.rows.reduce((sum, row) => sum + row.netAmount, 0);
  const alreadyPaidTotal = plan.rows.reduce((sum, row) => sum + row.alreadyPaid, 0);
  const remainingTotal = plan.rows.reduce((sum, row) => sum + row.remaining, 0);
  const paymentTotal = plan.rows.reduce((sum, row) => sum + row.paymentAmount, 0);
  elements.batchPaymentPreview.innerHTML = `
    <div class="notice-line">
      淨應收 ${formatMoney(netTotal)}，已收 ${formatMoney(alreadyPaidTotal)}，剩餘未收 ${formatMoney(remainingTotal)}；本次分攤收款 ${formatMoney(paymentTotal)}${paymentTotal < remainingTotal ? '，會保留未收餘額作分期/尾款。' : '。'}${plan.unappliedAmount ? ` 本次實收超過未收 ${formatMoney(plan.unappliedAmount)}，不會分配到科目。` : ''}
    </div>
    <div class="mini-list">
      ${plan.rows.map((row) => `
        <div class="mini-row">
          <strong>${escapeHtml(row.receivable.courseName)}</strong>
          <span>優惠 ${formatMoney(row.discount)}，科目淨額 ${formatMoney(row.netAmount)}</span>
          <span>本次收 ${formatMoney(row.paymentAmount)}</span>
        </div>
      `).join('')}
    </div>
    ${(plan.packageDiscount || plan.voucherAmount) ? '<p class="muted compact-note">合報優惠與抵用券採 Numbers 口徑，平均分到本次勾選的每一科。</p>' : ''}
  `;
}

function refundPlan() {
  const data = Object.fromEntries(new FormData(elements.withdrawalRefundForm).entries());
  const receivable = receivableById(data.receivableId);
  if (!receivable) return null;
  const totalSessions = Math.max(1, Math.round(parseNumber(data.totalSessions)) || 24);
  const withdrawSessionNo = Math.round(parseNumber(data.withdrawSessionNo));
  const sessionsTaken = Math.max(0, Math.round(parseNumber(data.sessionsTaken)) || Math.max(0, withdrawSessionNo - 1));
  const listPricePerSession = Math.max(0, parseNumber(data.listPricePerSession)) || Math.round(parseNumber(receivable.originalAmount || receivable.amount) / totalSessions);
  const earnedAmount = Math.min(parseNumber(receivable.originalAmount || receivable.amount), sessionsTaken * listPricePerSession);
  const computedRefund = Math.max(0, parseNumber(receivable.paidAmount) - earnedAmount);
  const refundAmount = Math.round(parseNumber(data.refundAmount) || computedRefund);
  return {
    receivable,
    date: data.date || todayIso(),
    method: data.method || '轉帳退費',
    withdrawSessionNo,
    sessionsTaken,
    totalSessions,
    listPricePerSession,
    earnedAmount,
    refundAmount,
    note: String(data.note || '').trim()
  };
}

function renderRefundPreview() {
  if (!elements.refundPreview) return;
  const plan = refundPlan();
  if (!plan) {
    elements.refundPreview.innerHTML = '<div class="notice-line">請先選可退費科目。</div>';
    return;
  }
  elements.refundPreview.innerHTML = `
    <div class="notice-line">
      ${escapeHtml(plan.receivable.studentName)}｜${escapeHtml(plan.receivable.courseName)}：已收 ${formatMoney(plan.receivable.paidAmount)}，已上 ${formatMoney(plan.sessionsTaken)} 堂，每堂原價 ${formatMoney(plan.listPricePerSession)}，應留收入 ${formatMoney(plan.earnedAmount)}，預計退 ${formatMoney(plan.refundAmount)}。
    </div>
  `;
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
  renderCleanStudentLedger();
  renderCleanTeacherLedger();
  renderCleanMovementLedger();
  renderCleanPayrollLedger();
  renderAllocationPreview();
  renderEvents();
  renderPayroll();
  renderPayrollPreview();
  renderPayrollSettlement();
  renderPayrollSettlementArchive();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  renderMonthlyWorkflow();
  renderAccounting();
  renderRecords();
  renderManualCourses();
  renderMasterCourses();
  renderMasterTeachers();
  renderMasterImportPreview();
  renderManualImportCompare();
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

elements.monthlyWorkflowMonth.addEventListener('change', () => {
  syncPayrollMonthFields(elements.monthlyWorkflowMonth.value || currentMonthIso());
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  renderCleanPayrollLedger();
  renderMonthlyWorkflow();
});

elements.monthlyWorkflowBuildSettlement.addEventListener('click', () => {
  syncPayrollMonthFields(selectedMonthlyWorkflowMonth());
  payrollSettlement = buildPayrollSettlementData();
  renderPayrollSettlement();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  renderCleanPayrollLedger();
  renderMonthlyWorkflow();
});

elements.monthlyWorkflowBuildFromImport.addEventListener('click', () => {
  syncPayrollMonthFields(selectedMonthlyWorkflowMonth());
  payrollSettlement = buildPayrollSettlementFromImportedPayroll();
  if (payrollSettlement.teachers.length) {
    setCloudStatus(`已從 Numbers 薪資表建立 ${payrollSettlement.month} 月結`);
  } else {
    setCloudStatus('匯入快照中找不到這個月份的 Numbers 薪資表');
  }
  renderPayrollSettlement();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  renderCleanPayrollLedger();
  renderMonthlyWorkflow();
});

elements.monthlyWorkflowPrintSettlement.addEventListener('click', () => {
  syncPayrollMonthFields(selectedMonthlyWorkflowMonth());
  elements.printPayrollSettlement.click();
});

elements.monthlyWorkflowSaveSettlement.addEventListener('click', () => {
  syncPayrollMonthFields(selectedMonthlyWorkflowMonth());
  elements.savePayrollSettlement.click();
});

elements.monthlyWorkflowOpenPayroll.addEventListener('click', () => {
  syncPayrollMonthFields(selectedMonthlyWorkflowMonth());
  setActiveTab('payroll');
  document.querySelector('[data-panel="payroll"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

elements.monthlyWorkflowOpenMovement.addEventListener('click', () => {
  setActiveTab('movement-ledger');
});

elements.monthlyWorkflowCourseRows.addEventListener('click', (event) => {
  const target = event.target.closest('[data-monthly-open-payroll-block]');
  if (!target) return;
  syncPayrollMonthFields(selectedMonthlyWorkflowMonth());
  setActiveTab('payroll');
  openPayrollRosterBlock(target.dataset.monthlyOpenPayrollBlock);
});

[
  elements.cleanStudentGradeFilter,
  elements.cleanStudentSearch
].forEach((element) => {
  const refreshStudents = () => {
    selectedCleanStudentId = '';
    cleanStudentSelectionTouched = false;
    if (elements.cleanStudentTermFilter) elements.cleanStudentTermFilter.value = '';
    if (elements.cleanStudentCourseFilter) elements.cleanStudentCourseFilter.value = '';
    renderCleanStudentLedger();
  };
  element?.addEventListener('input', refreshStudents);
  element?.addEventListener('change', refreshStudents);
});

[
  elements.cleanStudentTermFilter
].forEach((element) => {
  const refreshCourses = () => {
    if (elements.cleanStudentCourseFilter) elements.cleanStudentCourseFilter.value = '';
    renderCleanStudentLedger();
  };
  element?.addEventListener('input', refreshCourses);
  element?.addEventListener('change', refreshCourses);
});

elements.cleanStudentCourseFilter?.addEventListener('input', renderCleanStudentLedger);
elements.cleanStudentCourseFilter?.addEventListener('change', renderCleanStudentLedger);

elements.cleanStudentSelect?.addEventListener('change', () => {
  selectedCleanStudentId = elements.cleanStudentSelect.value;
  cleanStudentSelectionTouched = true;
  renderCleanStudentLedger();
});

elements.cleanStudentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const record = cleanStudentRecordFromForm();
  if (!studentName(record)) return;
  const before = getAllStudents().find((student) => student.id === record.id) || null;
  mergeByIdIntoState('manualStudents', [record]);
  selectedCleanStudentId = record.id;
  renderAll();
  await recordAudit('student', record.id, before ? 'update' : 'create', before, record, '學生資料表儲存學生');
  try {
    await saveCloudRecord('manualStudents', record);
  } catch (error) {
    setCloudStatus(`學生雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.cleanStudentNew?.addEventListener('click', () => {
  selectedCleanStudentId = '';
  elements.cleanStudentForm?.reset();
  syncCleanStudentForm(null);
});

elements.cleanStudentArchive?.addEventListener('click', async () => {
  const id = elements.cleanStudentForm?.elements.id.value || selectedCleanStudentId;
  const existing = id ? getAllStudents().find((student) => student.id === id) : null;
  if (!existing) return;
  const before = { ...existing, profile: { ...(existing.profile || {}) } };
  const record = {
    ...existing,
    archived: true,
    updatedAt: new Date().toISOString()
  };
  mergeByIdIntoState('manualStudents', [record]);
  selectedCleanStudentId = '';
  renderAll();
  await recordAudit('student', record.id, 'archive', before, record, '學生資料表封存學生');
  try {
    await saveCloudRecord('manualStudents', record);
  } catch (error) {
    setCloudStatus(`學生封存雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.cleanStudentDetail?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-clean-fill-student]');
  if (!button) return;
  selectedCleanStudentId = button.dataset.cleanFillStudent;
  renderCleanMovementLedger();
  setActiveTab('movement-ledger');
});

[
  elements.cleanTeacherTermFilter,
  elements.cleanTeacherSearch
].forEach((element) => {
  element?.addEventListener('input', renderCleanTeacherLedger);
  element?.addEventListener('change', renderCleanTeacherLedger);
});

elements.cleanTeacherSelect?.addEventListener('change', () => {
  selectedMasterTeacherId = elements.cleanTeacherSelect.value;
  selectedCleanTeacherCourseId = '';
  renderCleanTeacherLedger();
});

elements.cleanTeacherForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const record = cleanTeacherRecordFromForm();
  if (!record.name) return;
  const before = cleanTeacherById(record.id);
  mergeByIdIntoState('manualTeachers', [record]);
  selectedMasterTeacherId = record.id;
  renderAll();
  await recordAudit('teacher', record.id, before ? 'update' : 'create', before, record, '老師課程表儲存老師');
  try {
    await saveCloudRecord('manualTeachers', record);
  } catch (error) {
    setCloudStatus(`老師雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.cleanTeacherNew?.addEventListener('click', () => {
  selectedMasterTeacherId = '';
  selectedCleanTeacherCourseId = '';
  elements.cleanTeacherForm?.reset();
  syncCleanTeacherForm(null);
});

elements.cleanTeacherArchive?.addEventListener('click', async () => {
  const form = elements.cleanTeacherForm;
  const id = form?.elements.id.value || selectedMasterTeacherId;
  const existing = id ? cleanTeacherById(id) : null;
  if (!existing?.name) return;
  const before = { ...existing };
  const record = {
    ...existing,
    id: String(existing.id || '').startsWith('manual_teacher') ? existing.id : stableMasterId('manual_teacher', [existing.name]),
    archived: true,
    updatedAt: new Date().toISOString()
  };
  mergeByIdIntoState('manualTeachers', [record]);
  selectedMasterTeacherId = '';
  selectedCleanTeacherCourseId = '';
  renderAll();
  await recordAudit('teacher', record.id, 'archive', before, record, '老師課程表封存老師');
  try {
    await saveCloudRecord('manualTeachers', record);
  } catch (error) {
    setCloudStatus(`老師封存雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.cleanTeacherCourseRows?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-clean-view-teacher-course]');
  if (!button) return;
  selectedCleanTeacherCourseId = button.dataset.cleanViewTeacherCourse;
  renderCleanTeacherLedger();
});

elements.cleanMovementStudent?.addEventListener('change', renderCleanMovementLedger);

elements.cleanMovementForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.cleanMovementForm).entries());
  const student = buildStudentIndexes().studentsById.get(data.studentId);
  if (!student || !data.courseId || !data.date) return;
  await addMembershipEvent({
    courseName: data.courseId,
    month: String(data.date).slice(0, 7),
    date: data.date,
    sessionNo: String(data.sessionNo || ''),
    studentName: studentName(student),
    studentId: student.id,
    action: data.action || '加入',
    note: [data.eventType, data.note].filter(Boolean).join('；')
  });
  selectedCleanStudentId = student.id;
  elements.cleanMovementForm.reset();
  renderAll();
});

document.querySelector('#openLegacyAccounting')?.addEventListener('click', () => {
  setActiveTab('accounting');
});

document.querySelector('#openLegacyPayroll')?.addEventListener('click', () => {
  setActiveTab('payroll');
});

[
  elements.cleanPayrollMonth,
  elements.cleanPayrollTeacher
].forEach((element) => {
  const refreshCleanPayroll = () => {
    if (element === elements.cleanPayrollMonth) syncPayrollMonthFields(elements.cleanPayrollMonth.value || currentMonthIso());
    renderCleanPayrollLedger();
    renderMonthlyWorkflow();
  };
  element?.addEventListener('input', refreshCleanPayroll);
  element?.addEventListener('change', refreshCleanPayroll);
});

elements.tuitionForm?.addEventListener('input', renderAllocationPreview);
elements.tuitionForm?.addEventListener('change', renderAllocationPreview);

function fillStudentIntoForms(studentId) {
  const student = buildStudentIndexes().studentsById.get(studentId);
  if (!student) return;
  const name = studentName(student);
  const school = studentSchool(student);
  const cohort = inferCohort(student);
  const courseIds = new Set(inferCourseIds(student));
  if (elements.tuitionStudentId) elements.tuitionStudentId.value = student.id;
  elements.eventStudentId.value = student.id;
  elements.eventForm.elements.studentName.value = name;
  if (elements.tuitionForm) {
    elements.tuitionForm.elements.studentName.value = name;
    elements.tuitionForm.elements.school.value = school;
    if (cohort) elements.tuitionForm.elements.cohort.value = cohort;
    elements.tuitionForm.querySelectorAll('input[name="courses"]').forEach((input) => {
      input.checked = courseIds.has(input.value);
    });
  }
  renderAllocationPreview();
}

elements.tuitionStudentId?.addEventListener('change', () => {
  if (elements.tuitionStudentId.value) fillStudentIntoForms(elements.tuitionStudentId.value);
});

elements.eventStudentId.addEventListener('change', () => {
  if (elements.eventStudentId.value) fillStudentIntoForms(elements.eventStudentId.value);
});

elements.tuitionForm?.addEventListener('submit', async (event) => {
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

document.querySelector('#clearTuitionForm')?.addEventListener('click', () => {
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
  const name = String(data.name || '').trim();
  const cohort = String(data.cohort || '').trim();
  const existingIndex = (state.manualStudents || []).findIndex((student) => (
    normalizedCompareText(studentName(student)) === normalizedCompareText(name) &&
    normalizedCompareText(student.sheet) === normalizedCompareText(cohort)
  ));
  const record = {
    id: existingIndex >= 0 ? state.manualStudents[existingIndex].id : nowId('manual_student'),
    source: 'manual',
    createdAt: existingIndex >= 0 ? state.manualStudents[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sheet: cohort,
    row: existingIndex >= 0 ? state.manualStudents[existingIndex].row : '網頁新增',
    selectedCourses: existingIndex >= 0 ? (state.manualStudents[existingIndex].selectedCourses || []) : [],
    profile: {
      ...(existingIndex >= 0 ? state.manualStudents[existingIndex].profile || {} : {}),
      name,
      highSchool: String(data.highSchool || '').trim(),
      juniorHigh: String(data.juniorHigh || '').trim(),
      grade: String(data.grade || '').trim(),
      motherPhone: String(data.motherPhone || '').trim(),
      fatherPhone: String(data.fatherPhone || '').trim(),
      note: String(data.note || '').trim()
    }
  };
  if (!record.profile.name) return;
  if (existingIndex >= 0) {
    state.manualStudents[existingIndex] = record;
  } else {
    state.manualStudents.push(record);
  }
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
  const cohort = String(data.cohort || '').trim();
  const term = String(data.term || '').trim();
  const courseName = String(data.courseName || '').trim();
  const existingIndex = (state.manualCourses || []).findIndex((course) => (
    normalizedCompareText(course.cohort) === normalizedCompareText(cohort) &&
    normalizedCompareText(course.term) === normalizedCompareText(term) &&
    normalizedCompareText(course.courseName) === normalizedCompareText(courseName)
  ));
  const record = {
    id: existingIndex >= 0 ? state.manualCourses[existingIndex].id : nowId('manual_course'),
    createdAt: existingIndex >= 0 ? state.manualCourses[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cohort,
    term,
    courseName,
    teacherName: String(data.teacherName || '').trim(),
    defaultTuition: Math.round(parseNumber(data.defaultTuition)),
    refundUnitPrice: Math.round(parseNumber(data.refundUnitPrice)) || 1000,
    sessionCount: Math.round(parseNumber(data.sessionCount)),
    note: String(data.note || '').trim()
  };
  if (!record.courseName) return;
  if (existingIndex >= 0) {
    state.manualCourses[existingIndex] = record;
  } else {
    state.manualCourses.push(record);
  }
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

function openPayrollRosterBlock(rosterKey) {
  if (!rosterKey) return;
  const month = elements.payrollSettlementMonth.value || elements.payrollCalcMonth.value || currentMonthIso();
  elements.payrollCalcMonth.value = month;
  elements.payrollRosterBlock.value = rosterKey;
  const block = selectedPayrollRosterBlock();
  if (block && !elements.payrollCalcTeacher.value.trim()) {
    elements.payrollCalcTeacher.value = block.teacherSheet || '';
  }
  if (block?.source === 'manualCourse') {
    elements.payrollCalcShare.value = block.defaultShare || '50';
    elements.payrollCalcFixedRate.value = block.defaultFixedRate || '';
  }
  syncPayrollSessionPlanEditor();
  updatePayrollSessionSummary();
  renderPayrollQuickEvents();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  document.querySelector('.payroll-builder')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

elements.payrollCloseRows.addEventListener('click', (event) => {
  const target = event.target.closest('[data-open-payroll-block]');
  if (!target) return;
  openPayrollRosterBlock(target.dataset.openPayrollBlock);
});

elements.payrollSessionDates.addEventListener('input', () => {
  updatePayrollSessionSummary();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
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
  if (payrollSettlement) {
    payrollSettlement = buildPayrollSettlementData();
    renderPayrollSettlement();
  }
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
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
  if (payrollSettlement) {
    payrollSettlement = buildPayrollSettlementData();
    renderPayrollSettlement();
  }
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
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
    renderPayrollCloseCheck();
    renderPayrollWorkflow();
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

elements.buildPayrollSettlement.addEventListener('click', () => {
  payrollSettlement = buildPayrollSettlementData();
  renderPayrollSettlement();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  renderMonthlyWorkflow();
});

elements.buildPayrollSettlementFromImport.addEventListener('click', () => {
  payrollSettlement = buildPayrollSettlementFromImportedPayroll();
  if (payrollSettlement.teachers.length) {
    setCloudStatus(`已從 Numbers 薪資表建立 ${payrollSettlement.month} 月結`);
  } else {
    setCloudStatus('匯入快照中找不到這個月份的 Numbers 薪資表');
  }
  renderPayrollSettlement();
  renderPayrollCloseCheck();
  renderPayrollWorkflow();
  renderMonthlyWorkflow();
});

elements.printPayrollSettlement.addEventListener('click', () => {
  if (!payrollSettlement) return;
  const popup = window.open('', '_blank');
  const html = buildPayrollSettlementPrintHtml(payrollSettlement);
  if (!popup) {
    downloadFile('bearhigh-payroll-settlement.html', html, 'text/html;charset=utf-8');
    setCloudStatus('瀏覽器封鎖列印視窗，已改下載 HTML，可開啟後列印成 PDF');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 350);
});

elements.payrollSettlementTeacherRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-print-payroll-teacher]');
  if (!button || !payrollSettlement) return;
  openPayrollSettlementTeacherPrint(payrollSettlement, button.dataset.printPayrollTeacher);
});

elements.savePayrollSettlement.addEventListener('click', async () => {
  if (!payrollSettlement || !payrollSettlement.teachers.length) return;
  const record = JSON.parse(JSON.stringify({
    ...payrollSettlement,
    id: nowId('payroll_settlement'),
    savedAt: new Date().toISOString(),
    savedBy: currentUser?.email || 'local',
    status: 'locked_snapshot'
  }));
  state.payrollSettlements.push(record);
  renderAll();
  setCloudStatus('月結快照已儲存於本機');
  try {
    await saveCloudRecord('payrollSettlements', record);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.payrollSettlementArchiveRows.addEventListener('click', (event) => {
  const button = event.target.closest('[data-print-payroll-settlement]');
  if (!button) return;
  const record = (state.payrollSettlements || []).find((row) => row.id === button.dataset.printPayrollSettlement);
  if (!record) return;
  const popup = window.open('', '_blank');
  const html = buildPayrollSettlementPrintHtml(record);
  if (!popup) {
    downloadFile(`bearhigh-payroll-settlement-${filenameSafe(record.month)}.html`, html, 'text/html;charset=utf-8');
    setCloudStatus('瀏覽器封鎖列印視窗，已改下載 HTML，可開啟後列印成 PDF');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 350);
});

[
  elements.payrollSettlementHeadRate,
  elements.payrollSettlementHourlyRate,
  elements.payrollSettlementHours,
  elements.payrollSettlementMinBase,
  elements.payrollSettlementMinBonus,
  elements.payrollSettlementMinThreshold,
  elements.payrollSettlementMonth,
  elements.payrollSettlementScienceRate,
  elements.payrollSettlementShare
].forEach((element) => {
  element.addEventListener('change', () => {
    if (element === elements.payrollSettlementMonth) syncPayrollMonthFields(elements.payrollSettlementMonth.value || currentMonthIso());
    renderPayrollCloseCheck();
    renderPayrollWorkflow();
    if (payrollSettlement) {
      payrollSettlement = buildPayrollSettlementData();
      renderPayrollSettlement();
    }
    renderCleanPayrollLedger();
    renderMonthlyWorkflow();
  });
});

elements.batchPaymentStudent.addEventListener('change', renderBatchPaymentChoices);
elements.batchPaymentReceivables.addEventListener('change', renderBatchPaymentPreview);
elements.batchPaymentForm.addEventListener('input', renderBatchPaymentPreview);
elements.batchPaymentForm.addEventListener('change', renderBatchPaymentPreview);
elements.batchPaymentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const plan = batchPaymentPlan();
  if (!plan.rows.length || plan.paidAmount <= 0) return;
  const changedReceivables = [];
  const payments = [];
  for (const row of plan.rows) {
    const receivable = row.receivable;
    const before = { ...receivable };
    receivable.originalAmount = row.originalAmount;
    receivable.discountAmount = row.discount;
    if (plan.discountInputTotal) {
      receivable.packageDiscountAmount = Math.round(row.discount * (plan.packageDiscount / Math.max(1, plan.discountInputTotal)));
      receivable.voucherAmount = row.discount - receivable.packageDiscountAmount;
    } else {
      receivable.packageDiscountAmount = parseNumber(receivable.packageDiscountAmount);
      receivable.voucherAmount = parseNumber(receivable.voucherAmount);
    }
    receivable.amount = row.netAmount;
    receivable.note = appendUniqueNotes(
      receivable.note,
      plan.packageDiscount ? `合報優惠分攤 ${formatMoney(receivable.packageDiscountAmount)}` : '',
      plan.voucherAmount ? `抵用券分攤 ${formatMoney(receivable.voucherAmount)}` : '',
      plan.installmentNote
    );
    if (row.paymentAmount > 0) {
      const payment = {
        id: nowId('payment'),
        receivableId: receivable.id,
        studentId: receivable.studentId,
        studentName: receivable.studentName,
        courseName: receivable.courseName,
        date: plan.date,
        amount: row.paymentAmount,
        method: plan.method,
        assetAccountId: plan.assetAccountId,
        incomeAccountId: receivable.incomeAccountId || 'income_tuition',
        note: [
          '學生多科收款',
          plan.installmentNote,
          plan.packageDiscount ? `合報優惠總額 ${formatMoney(plan.packageDiscount)}` : '',
          plan.voucherAmount ? `抵用券總額 ${formatMoney(plan.voucherAmount)}` : ''
        ].filter(Boolean).join('；'),
        status: 'posted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.paymentLedger.push(payment);
      payments.push(payment);
    }
    recomputeReceivable(receivable);
    changedReceivables.push({ before, after: receivable });
  }
  elements.batchPaymentForm.reset();
  renderAll();
  for (const payment of payments) {
    await recordAudit('payment', payment.id, 'create', null, payment, '學生多科收款');
  }
  for (const row of changedReceivables) {
    await recordAudit('receivable', row.after.id, 'update', row.before, row.after, '合報/抵用券/分期收款後更新');
  }
  renderAll();
  try {
    await Promise.all([
      ...payments.map((payment) => savePaymentRecord(payment)),
      ...changedReceivables.map((row) => saveReceivable(row.after))
    ]);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

[
  elements.withdrawalRefundForm,
  elements.refundReceivable
].forEach((element) => {
  element.addEventListener('input', renderRefundPreview);
  element.addEventListener('change', renderRefundPreview);
});

elements.withdrawalRefundForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const plan = refundPlan();
  if (!plan || plan.refundAmount <= 0) return;
  const receivableBefore = { ...plan.receivable };
  plan.receivable.amount = plan.earnedAmount;
  plan.receivable.withdrawal = {
    date: plan.date,
    withdrawSessionNo: plan.withdrawSessionNo,
    sessionsTaken: plan.sessionsTaken,
    totalSessions: plan.totalSessions,
    listPricePerSession: plan.listPricePerSession,
    refundAmount: plan.refundAmount,
    note: plan.note
  };
  const refund = {
    id: nowId('refund'),
    receivableId: plan.receivable.id,
    studentId: plan.receivable.studentId,
    studentName: plan.receivable.studentName,
    courseName: plan.receivable.courseName,
    date: plan.date,
    amount: -Math.abs(plan.refundAmount),
    method: plan.method,
    assetAccountId: plan.method === '現金退費' ? 'cash_on_hand' : 'bank_main',
    incomeAccountId: plan.receivable.incomeAccountId || 'income_tuition',
    note: [
      `退班第 ${plan.withdrawSessionNo || ''} 堂`,
      `已上 ${plan.sessionsTaken} 堂`,
      plan.note
    ].filter(Boolean).join('；'),
    status: 'posted',
    source: 'withdrawalRefund',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.paymentLedger.push(refund);
  recomputeReceivable(plan.receivable);
  await addMembershipEvent({
    courseName: plan.receivable.courseName,
    month: plan.date.slice(0, 7),
    date: plan.date,
    sessionNo: String(plan.withdrawSessionNo || ''),
    studentName: plan.receivable.studentName,
    studentId: plan.receivable.studentId,
    action: '退出',
    note: `退費 ${formatMoney(plan.refundAmount)}；已上 ${formatMoney(plan.sessionsTaken)} 堂`
  });
  elements.withdrawalRefundForm.reset();
  renderAll();
  await recordAudit('payment', refund.id, 'create', null, refund, '退班退費');
  await recordAudit('receivable', plan.receivable.id, 'update', receivableBefore, plan.receivable, '退班退費後更新應收');
  renderAll();
  try {
    await savePaymentRecord(refund);
    await saveReceivable(plan.receivable);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
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

document.querySelector('#exportTuitionCsv')?.addEventListener('click', () => {
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
    setActiveTab('events');
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

[
  elements.masterCourseKeyword,
  elements.masterCourseTermFilter,
  elements.masterCourseTeacherFilter,
  elements.masterCourseArchivedOnly
].forEach((element) => {
  element?.addEventListener('input', renderMasterCourses);
  element?.addEventListener('change', renderMasterCourses);
});

[
  elements.masterTeacherKeyword,
  elements.masterTeacherTermFilter,
  elements.masterTeacherArchivedOnly
].forEach((element) => {
  element?.addEventListener('input', renderMasterTeachers);
  element?.addEventListener('change', renderMasterTeachers);
});

elements.masterCourseRows?.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view-master-course]');
  if (viewButton) {
    selectedMasterCourseId = viewButton.dataset.viewMasterCourse;
    renderMasterCourses();
    return;
  }
  const archiveButton = event.target.closest('[data-archive-master-course]');
  if (!archiveButton) return;
  const course = (state.manualCourses || []).find((row) => row.id === archiveButton.dataset.archiveMasterCourse);
  if (!course) return;
  const before = { ...course };
  course.archived = !course.archived;
  course.updatedAt = new Date().toISOString();
  renderAll();
  await recordAudit('course', course.id, course.archived ? 'archive' : 'restore', before, course, '課程主檔封存狀態更新');
  try {
    await saveCloudRecord('manualCourses', course);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.masterCourseDetail?.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view-master-course]');
  if (!viewButton) return;
  selectedMasterCourseId = viewButton.dataset.viewMasterCourse;
  setActiveTab('courses');
  renderMasterCourses();
});

elements.masterTeacherRows?.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view-master-teacher]');
  if (viewButton) {
    selectedMasterTeacherId = viewButton.dataset.viewMasterTeacher;
    renderMasterTeachers();
    return;
  }
  const archiveButton = event.target.closest('[data-archive-master-teacher]');
  if (!archiveButton) return;
  const teacher = (state.manualTeachers || []).find((row) => row.id === archiveButton.dataset.archiveMasterTeacher);
  if (!teacher) return;
  const before = { ...teacher };
  teacher.archived = !teacher.archived;
  teacher.updatedAt = new Date().toISOString();
  renderAll();
  await recordAudit('teacher', teacher.id, teacher.archived ? 'archive' : 'restore', before, teacher, '老師主檔封存狀態更新');
  try {
    await saveCloudRecord('manualTeachers', teacher);
  } catch (error) {
    setCloudStatus(`雲端寫入失敗：${error.code || error.message}`);
  }
});

elements.masterTeacherDetail?.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view-master-course]');
  if (!viewButton) return;
  selectedMasterCourseId = viewButton.dataset.viewMasterCourse;
  setActiveTab('courses');
  renderMasterCourses();
});

elements.previewMasterImport?.addEventListener('click', () => {
  masterImportPreview = buildMasterImportPlan();
  renderMasterImportPreview();
  const stats = masterImportPreview.stats;
  setCloudStatus(`Dry-run 完成：學生 ${formatMoney(stats.students.added)} 新增、課程 ${formatMoney(stats.courses.added)} 新增、選課 ${formatMoney(stats.enrollments.added)} 新增`);
});

elements.applyMasterImport?.addEventListener('click', async () => {
  const plan = masterImportPreview || buildMasterImportPlan();
  if (!state.importSnapshot?.students?.length) {
    setCloudStatus('請先載入匯入快照');
    return;
  }
  const existingReceivables = new Set((state.receivables || []).map((receivable) => receivable.id));
  const newReceivables = plan.receivables.filter((receivable) => parseNumber(receivable.amount) > 0 && !existingReceivables.has(receivable.id));
  mergeByIdIntoState('manualStudents', plan.students);
  mergeByIdIntoState('manualTerms', plan.terms);
  mergeByIdIntoState('manualTeachers', plan.teachers);
  mergeByIdIntoState('manualCourses', plan.courses);
  mergeByIdIntoState('manualCourseEnrollments', plan.enrollments);
  mergeByIdIntoState('receivables', newReceivables);
  recomputeAllReceivables();
  masterImportPreview = buildMasterImportPlan();
  renderAll();
  setCloudStatus('主檔已寫入本機，開始同步雲端');
  try {
    await saveCloudRecordsBatch({
      manualStudents: plan.students,
      manualTerms: plan.terms,
      manualTeachers: plan.teachers,
      manualCourses: plan.courses,
      manualCourseEnrollments: plan.enrollments,
      receivables: newReceivables
    });
    setCloudStatus('主檔已同步雲端');
  } catch (error) {
    setCloudStatus(`主檔同步中斷：${error.code || error.message}`);
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
  state.payrollSettlements.splice(0);
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
    loadCloudImportSnapshot({ afterLoadTab: 'monthly-workflow' }).catch((error) => {
      setCloudStatus(`雲端讀取失敗：${error.code || error.message}`);
    });
  }
});

const initialMonth = currentMonthIso();
if (!elements.payrollCalcMonth.value) elements.payrollCalcMonth.value = initialMonth;
if (!elements.payrollSettlementMonth.value) elements.payrollSettlementMonth.value = elements.payrollCalcMonth.value || initialMonth;
if (elements.cleanPayrollMonth && !elements.cleanPayrollMonth.value) elements.cleanPayrollMonth.value = elements.payrollSettlementMonth.value || initialMonth;
if (elements.monthlyWorkflowMonth && !elements.monthlyWorkflowMonth.value) elements.monthlyWorkflowMonth.value = elements.payrollSettlementMonth.value || initialMonth;

renderOptions();
renderAll();

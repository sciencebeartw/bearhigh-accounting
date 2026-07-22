export const COURSE_CATALOG = [
  { id: 'math_mingxuan', name: '明軒數學', subject: '數學' },
  { id: 'math_huanghao', name: '黃浩數學', subject: '數學' },
  { id: 'physics', name: '物理', subject: '物理' },
  { id: 'chemistry', name: '化學', subject: '化學' },
  { id: 'biology', name: '生物', subject: '生物' },
  { id: 'earth_science', name: '地科', subject: '地科' },
  { id: 'english', name: '英文', subject: '英文' },
  { id: 'chinese', name: '國文', subject: '國文' },
  { id: 'social', name: '社會', subject: '社會' }
];

export const PRICING_RULES = {
  versions: {
    legacy_16800_24: {
      label: '舊制 24 堂',
      single: 16800,
      packages: { 1: 16800, 2: 32600, 3: 47400, 4: 62200 }
    },
    current_21600_24: {
      label: '今年度調漲 24 堂',
      single: 21600,
      packages: { 1: 21600, 2: 42200, 3: 61800, 4: 81400 }
    }
  },
  specialPackages: {
    none: {
      label: '一般合報'
    },
    biology_earth_12000: {
      label: '生地合報',
      total: 12000,
      allocations: {
        biology: 5140,
        earth_science: 6860
      }
    },
    nature_52000: {
      label: '自然全科合報',
      total: 52000,
      allocations: {
        physics: 20130,
        chemistry: 20130,
        biology: 5030,
        earth_science: 6710
      }
    },
    mingxuan_nature_77000: {
      label: '明軒數自全報',
      total: 77000,
      allocations: {
        math_mingxuan: 26210,
        physics: 19660,
        chemistry: 19660,
        biology: 4910,
        earth_science: 6560
      }
    },
    huanghao_nature_77000: {
      label: '黃浩數自全報',
      total: 77000,
      allocations: {
        math_huanghao: 26210,
        physics: 19660,
        chemistry: 19660,
        biology: 4910,
        earth_science: 6560
      }
    }
  }
};

const courseById = new Map(COURSE_CATALOG.map((course) => [course.id, course]));
const courseSortOrder = new Map(COURSE_CATALOG.map((course, index) => [course.id, index]));

export function getCourseName(courseId) {
  return courseById.get(courseId)?.name || courseId;
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(/,/g, '').trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

export function parseMoneyStrict(value, fieldName = '金額') {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { amount: 0, error: null, provided: false };
  }

  const normalized = String(value).replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { amount: 0, error: `${fieldName} 必須是 0 或正數。`, provided: true };
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return { amount: 0, error: `${fieldName} 不是有效數字。`, provided: true };
  }

  return { amount: Math.round(amount), error: null, provided: true };
}

function distributeByWeights(total, weights) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const weightTotal = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!entries.length || weightTotal <= 0) return {};

  const raw = entries.map(([id, weight]) => {
    const exact = (total * weight) / weightTotal;
    return { id, floor: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });

  let remainder = total - raw.reduce((sum, item) => sum + item.floor, 0);
  raw.sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));

  for (const item of raw) {
    if (remainder <= 0) break;
    item.floor += 1;
    remainder -= 1;
  }

  return Object.fromEntries(raw.map((item) => [item.id, item.floor]));
}

function buildGeneralWeights(courses, pricingVersion) {
  const rule = PRICING_RULES.versions[pricingVersion];
  if (!rule) {
    throw new Error(`Unknown pricing version: ${pricingVersion}`);
  }

  const count = courses.length;
  const packageTotal = rule.packages[count];
  const listPriceTotal = rule.single * count;
  const baseTotal = packageTotal || listPriceTotal;
  const listByCourse = Object.fromEntries(courses.map((id) => [id, rule.single]));
  const builtInPackageDiscount = Math.max(0, listPriceTotal - baseTotal);
  const builtInPackageDiscountByCourse = distributeByWeights(builtInPackageDiscount, listByCourse);
  const perCourse = Object.fromEntries(
    courses.map((id) => [id, rule.single - (builtInPackageDiscountByCourse[id] || 0)])
  );

  return {
    listPriceTotal,
    expectedBaseTotal: baseTotal,
    builtInPackageDiscount,
    listByCourse,
    baseByCourse: perCourse,
    warnings: packageTotal
      ? []
      : [`${count} 科一般合報尚未確認正式級距，暫用單科加總。`]
  };
}

function buildSpecialWeights(packageId) {
  const special = PRICING_RULES.specialPackages[packageId];
  if (!special || !special.allocations) {
    return null;
  }

  return {
    listPriceTotal: special.total,
    expectedBaseTotal: special.total,
    builtInPackageDiscount: 0,
    listByCourse: { ...special.allocations },
    baseByCourse: { ...special.allocations },
    warnings: []
  };
}

export function calculateTuitionAllocation(input) {
  const courses = Array.from(new Set(input.courses || [])).filter(Boolean);
  const errors = [];
  if (!courses.length) {
    return {
      rows: [],
      totals: {
        listPrice: 0,
        base: 0,
        builtInPackageDiscount: 0,
        packageDiscount: 0,
        voucher: 0,
        manualDiscount: 0,
        expectedRevenue: 0,
        paid: 0
      },
      warnings: [],
      errors: ['請至少選擇一門課。']
    };
  }

  const packageId = input.packageId || 'none';
  const pricingVersion = input.pricingVersion || 'current_21600_24';
  const special = packageId === 'none' ? null : buildSpecialWeights(packageId);
  const basis = special || buildGeneralWeights(courses, pricingVersion);
  const basisCourseIds = Object.keys(basis.baseByCourse);
  const moneyFields = [
    ['packageDiscount', '額外合報優惠'],
    ['voucher', '學費抵用券'],
    ['manualDiscount', '手動折扣'],
    ['paidAmount', '實收金額']
  ];
  const parsedMoney = Object.fromEntries(
    moneyFields.map(([key, label]) => {
      const parsed = parseMoneyStrict(input[key], label);
      if (parsed.error) errors.push(parsed.error);
      return [key, parsed];
    })
  );
  const packageDiscount = parsedMoney.packageDiscount.amount;
  const voucher = parsedMoney.voucher.amount;
  const manualDiscount = parsedMoney.manualDiscount.amount;
  const paidInput = parsedMoney.paidAmount.amount;
  const paidProvided = parsedMoney.paidAmount.provided;
  const discountTotal = packageDiscount + voucher + manualDiscount;
  const expectedRevenue = Math.max(0, basis.expectedBaseTotal - discountTotal);
  const paid = paidProvided ? paidInput : expectedRevenue;
  const revenueByCourse = distributeByWeights(paid, basis.baseByCourse);
  const builtInPackageDiscountByCourse = distributeByWeights(basis.builtInPackageDiscount, basis.listByCourse);
  const packageDiscountByCourse = distributeByWeights(packageDiscount, basis.baseByCourse);
  const voucherByCourse = distributeByWeights(voucher, basis.baseByCourse);
  const manualDiscountByCourse = distributeByWeights(manualDiscount, basis.baseByCourse);
  const warnings = [...basis.warnings];

  const missingCourses = courses.filter((id) => !basisCourseIds.includes(id));
  if (special && missingCourses.length) {
    errors.push(`特殊套餐未包含：${missingCourses.map(getCourseName).join('、')}。`);
  }

  const packageOnlyCourses = basisCourseIds.filter((id) => !courses.includes(id));
  if (special && packageOnlyCourses.length) {
    errors.push(`特殊套餐需要勾選：${packageOnlyCourses.map(getCourseName).join('、')}。`);
  }

  if (paidProvided && !parsedMoney.paidAmount.error && paidInput !== expectedRevenue) {
    warnings.push(`實收 ${paidInput} 與規則推算 ${expectedRevenue} 不同，已依實收比例分攤。`);
  }

  if (discountTotal > basis.expectedBaseTotal) {
    errors.push('優惠與抵用券總額不可大於套餐後金額。');
  }

  const rows = basisCourseIds
    .map((courseId) => ({
      courseId,
      courseName: getCourseName(courseId),
      listPrice: basis.listByCourse[courseId] || 0,
      baseAmount: basis.baseByCourse[courseId] || 0,
      builtInPackageDiscount: builtInPackageDiscountByCourse[courseId] || 0,
      packageDiscount: packageDiscountByCourse[courseId] || 0,
      voucher: voucherByCourse[courseId] || 0,
      manualDiscount: manualDiscountByCourse[courseId] || 0,
      revenueAmount: revenueByCourse[courseId] || 0
    }))
    .sort((a, b) => (courseSortOrder.get(a.courseId) ?? 999) - (courseSortOrder.get(b.courseId) ?? 999));

  return {
    rows,
    totals: {
      listPrice: basis.listPriceTotal,
      base: basis.expectedBaseTotal,
      builtInPackageDiscount: basis.builtInPackageDiscount,
      packageDiscount,
      voucher,
      manualDiscount,
      expectedRevenue,
      paid
    },
    warnings,
    errors
  };
}

export function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('zh-TW');
}

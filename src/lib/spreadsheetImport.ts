import * as XLSX from "xlsx";
import type { CostHeadConfig } from "@/lib/profitEngine";

export type ImportedRequisitionRow = {
  sl: number;
  costHead: string;
  costTag: "BILLABLE" | "IMS_INVESTMENT";
  forMonth: string;
  lastMonthAmount: number;
  particulars: string;
  purpose: string;
  qty: string;
  unitPrice: string;
};

export type SpreadsheetImportResult = {
  items: ImportedRequisitionRow[];
  sourceLabel: string;
  matchedMonthLabel?: string;
  warnings: string[];
};

const MONTH_ABBRS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function getPreviousYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function parseNumericCell(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/,/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse header text like "Nov'26", "May '26", "Nov-'26", "Nov'2026", "2026-11" into "YYYY-MM".
 */
export function parseMonthHeaderToYYYYMM(rawHeader: unknown): string | null {
  const s = String(rawHeader ?? "").trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const cleaned = s.toLowerCase().replace(/[\s'’\-_]+/g, " ").trim();
  for (let i = 0; i < MONTH_ABBRS.length; i++) {
    const abbr = MONTH_ABBRS[i];
    const re = new RegExp(`^${abbr}[a-z]*\\s*(\\d{2,4})$`, "i");
    const m = cleaned.match(re);
    if (m) {
      const yearNum = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
      return `${yearNum}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

function isDerivedOrSubtotalLabel(label: string): boolean {
  const lower = label.toLowerCase().trim();
  if (!lower) return true;

  // Section-letter totals like "A. Total IMS Investment", "J.Total IMS HR Cost", "H.Total Billable Cost"
  if (/^[a-n]\.\s*total\b/i.test(lower)) return true;

  const skipPrefixes = [
    "total ",
    "sub total",
    "subtotal",
    "service charge",
    "2% ait",
    "ait ",
    "(-) ",
    "add: ",
    "billing amount",
    "received by ims",
    "additional ait",
    "net earning",
    "net profit",
    "net inflow",
    "net outflow",
    "profit after tax",
    "profit from others",
    "others earning",
    "others expense",
    "investment on asset",
    "ff number",
    "festivals bonus status",
    "monthly cost of",
    "req wc",
    "yearly profit",
    "monthly avg",
    "roi@",
    "ld (aprox)",
    "total earning",
    "other cost",
    "bonus ",
    "part 1 bill",
    "part 2 bill",
  ];
  if (skipPrefixes.some((p) => lower.startsWith(p))) return true;
  if (lower === "total" || lower === "bonus") return true;
  return false;
}

function isSectionBannerLabel(label: string): boolean {
  const lower = label.toLowerCase().trim();
  const banners = new Set([
    "current month",
    "previous month",
    "previous months",
    "ims investment",
    "ims investment (sme+enterprise)",
    "client cost",
    "fixed investment cost (only sme)",
    "eid bonus",
    "operations cost",
    "hr fixed cost",
    "hr variable cost",
    "hr incentive cost",
    "ims hr cost (non-billable)",
    "salary",
    "claim bill",
    "others",
  ]);
  return banners.has(lower);
}

function matchActiveCostHead(
  rawLabel: string,
  activeCostHeads: CostHeadConfig[],
  forceTag?: "BILLABLE" | "IMS_INVESTMENT",
  sectionHint?: "fixed" | "variable" | ""
): CostHeadConfig | undefined {
  const clean = rawLabel.toLowerCase().trim();
  if (!clean || activeCostHeads.length === 0) return undefined;

  const pool = forceTag
    ? activeCostHeads.filter((ch) => ch.tag === forceTag)
    : activeCostHeads;
  const searchPool = pool.length > 0 ? pool : activeCostHeads;

  const exact = searchPool.find(
    (ch) =>
      ch.name.toLowerCase() === clean ||
      (ch.aliases || []).some((a) => a.toLowerCase().trim() === clean)
  );
  if (exact) return exact;

  // Strip trailing month/headcount notes like "Dec'24 (189)" or "(SME Based on approval)"
  const stripped = clean
    .replace(/\((?:[^)]*)\)/g, " ")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*['’\- ]*\d{2,4}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const strippedTokens = stripped.split(/\s+/).filter((t) => t.length >= 3);
  const augmented = sectionHint ? `${clean} ${sectionHint}` : clean;

  const keywordRules: Array<{ test: RegExp; prefer: RegExp }> = [
    { test: /field force.*variable/i, prefer: /field force.*variable|variable salary/i },
    { test: /back office.*variable/i, prefer: /back office.*variable/i },
    { test: /field force.*fixed|sme field force fixed/i, prefer: /field force.*fixed|fixed salary/i },
    { test: /back office.*fixed/i, prefer: /back office.*fixed/i },
    { test: /mobile bill/i, prefer: /mobile bill|tracking|laptop/i },
    { test: /tracking/i, prefer: /tracking|festival|campaign|mobile/i },
    { test: /festival|eid bonus/i, prefer: /festival|eid bonus/i },
    { test: /gratuity|additional amount adjustment|\bin gr\b/i, prefer: /gratuity|adjustment|gr/i },
    { test: /house rent|utilities|stationary|stationery|refreshment|photocopy|peon|visiting card|monthly meeting|office expenditure|office maintenance/i, prefer: /house rent|office expenditure|operations/i },
    { test: /laptop|printer|furniture|scanner|fan|electronic|internet/i, prefer: /laptop|fixed investment|mobile/i },
    { test: /project manager|kam\+oe|kam salary|key account manager/i, prefer: /project manager|kam/i },
    { test: /project executive/i, prefer: /project executive|kam/i },
    { test: /convayence|conveyance|id card|courier/i, prefer: /conveyance|id card|courier|kam/i },
    { test: /sales officer.*salary/i, prefer: /sales officer.*salary/i },
  ];

  for (const rule of keywordRules) {
    if (rule.test.test(augmented)) {
      const hit = searchPool.find((ch) => rule.prefer.test(ch.name));
      if (hit) return hit;
    }
  }

  let best: CostHeadConfig | undefined;
  let bestScore = 0;
  for (const ch of searchPool) {
    const chText = [ch.name, ...(ch.aliases || [])].join(" ").toLowerCase();
    let score = 0;
    for (const tok of strippedTokens) {
      if (chText.includes(tok)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = ch;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function normalizeTextCol(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function buildRowItem(params: {
  sl: number;
  label: string;
  amount: number;
  tag: "BILLABLE" | "IMS_INVESTMENT";
  isSalary: boolean;
  forMonth: string;
  lag: number;
  activeCostHeads: CostHeadConfig[];
  sectionHint?: "fixed" | "variable" | "";
}): ImportedRequisitionRow {
  const { sl, label, amount, tag, isSalary, forMonth, lag, activeCostHeads, sectionHint } = params;
  const matched = matchActiveCostHead(label, activeCostHeads, tag, sectionHint);
  const resolvedTag: "BILLABLE" | "IMS_INVESTMENT" = tag || matched?.tag || "BILLABLE";
  const resolvedSalary = isSalary || Boolean(matched?.isSalary);
  const rowMonth =
    resolvedSalary && lag === 1 ? getPreviousYearMonth(forMonth) : forMonth;

  return {
    sl,
    costHead: matched?.name || label,
    costTag: resolvedTag,
    forMonth: rowMonth,
    lastMonthAmount: matched?.defaultAmount || 0,
    particulars: label,
    purpose: matched && matched.name.toLowerCase() !== label.toLowerCase() ? label : "",
    qty: "1",
    unitPrice: String(Number(amount.toFixed(2))),
  };
}

/**
 * Parse a "Profit Calculation" / "Profitability -2026" horizontal monthly table for `targetMonth` ("YYYY-MM").
 */
function tryParseProjectionMatrixSheet(
  rows: unknown[][],
  sheetName: string,
  targetMonth: string,
  lag: number,
  activeCostHeads: CostHeadConfig[]
): SpreadsheetImportResult | null {
  let headerRowIdx = -1;
  let labelColIdx = -1;
  const monthCols: Array<{ colIdx: number; ym: string; rawLabel: string }> = [];

  for (let r = 0; r < Math.min(500, rows.length); r++) {
    const row = rows[r] || [];
    const foundMonths: Array<{ colIdx: number; ym: string; rawLabel: string }> = [];
    let foundLabelCol = -1;

    for (let c = 0; c < row.length; c++) {
      const cellStr = normalizeTextCol(row[c]);
      if (
        foundLabelCol === -1 &&
        /^cost\s*head/i.test(cellStr)
      ) {
        foundLabelCol = c;
      }
      const ym = parseMonthHeaderToYYYYMM(cellStr);
      if (ym) {
        foundMonths.push({ colIdx: c, ym, rawLabel: cellStr });
      }
    }

    // Standard Projection sheet has >= 3 monthly columns in row r (or previous row had month headers above "Total Amount")
    if (foundMonths.length >= 3) {
      headerRowIdx = r;
      monthCols.push(...foundMonths);
      labelColIdx = foundLabelCol;
      if (labelColIdx === -1 && r + 1 < rows.length) {
        const nextRow = rows[r + 1] || [];
        for (let c = 0; c < Math.min(5, nextRow.length); c++) {
          if (/cost\s*head/i.test(normalizeTextCol(nextRow[c]))) {
            labelColIdx = c;
            headerRowIdx = r + 1;
            break;
          }
        }
      }
      break;
    }
  }

  if (headerRowIdx === -1 || monthCols.length < 3) return null;
  if (labelColIdx === -1) labelColIdx = 1;

  const targetCol = monthCols.find((m) => m.ym === targetMonth);
  if (!targetCol) {
    return {
      items: [],
      sourceLabel: sheetName,
      warnings: [
        `Sheet "${sheetName}" has months ${monthCols[0].rawLabel}..${monthCols[monthCols.length - 1].rawLabel}, but not ${targetMonth}.`,
      ],
    };
  }

  const items: ImportedRequisitionRow[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const label = normalizeTextCol(row[labelColIdx]);
    if (!label) continue;

    // Stop when reaching summary/headcount/KPI footer tables below Net Profit
    if (
      /^particulars$/i.test(label) ||
      /^designation$/i.test(label) ||
      /^robi sme$/i.test(label) ||
      /^total ff$/i.test(label)
    ) {
      break;
    }

    if (isSectionBannerLabel(label) || isDerivedOrSubtotalLabel(label)) continue;

    const amount = parseNumericCell(row[targetCol.colIdx]);
    if (amount <= 0) continue;

    const lower = label.toLowerCase();
    const isImsInv =
      lower.includes("ims hr investment") ||
      lower.includes("ims investment") ||
      lower.includes("non-billable") ||
      lower.includes("non billable") ||
      lower.includes("ims cost");
    const isSalary =
      lower.includes("salary") ||
      lower.includes("kam") ||
      lower.includes("ims hr");

    items.push(
      buildRowItem({
        sl: items.length + 1,
        label,
        amount,
        tag: isImsInv ? "IMS_INVESTMENT" : "BILLABLE",
        isSalary,
        forMonth: targetMonth,
        lag,
        activeCostHeads,
      })
    );
  }

  return {
    items,
    sourceLabel: sheetName,
    matchedMonthLabel: targetCol.rawLabel,
    warnings: [],
  };
}

/**
 * Parse a Daily Expenditure sheet (`Cost Head, <day1>..<day31>, Total`).
 */
function tryParseDailyExpenditureSheet(
  rows: unknown[][],
  sheetName: string,
  targetMonth: string,
  lag: number,
  activeCostHeads: CostHeadConfig[]
): SpreadsheetImportResult | null {
  // Detect daily sheet by finding at least one header row with "Cost Head" + ("Total" OR Excel serial >= 40000)
  let detected = false;
  for (let r = 0; r < Math.min(500, rows.length); r++) {
    const row = rows[r] || [];
    const hasCostHead = row.some((c) => /^cost\s*head/i.test(normalizeTextCol(c)));
    const hasDateSerial = row.some((c) => {
      const n = Number(c);
      return Number.isFinite(n) && n >= 40000 && n <= 60000;
    });
    const hasTotalCol = row.some((c) => /^total$/i.test(normalizeTextCol(c)));
    if (hasCostHead && (hasDateSerial || hasTotalCol)) {
      detected = true;
      break;
    }
  }
  if (!detected) return null;

  const items: ImportedRequisitionRow[] = [];
  let labelCol = 0;
  let totalCol = -1;
  let dateStartCol = 1;
  let dateEndCol = -1;
  let currentTag: "BILLABLE" | "IMS_INVESTMENT" = "BILLABLE";
  let currentIsSalary = false;
  let currentSectionHint: "fixed" | "variable" | "" = "";

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some((c) => c !== undefined && c !== null && String(c).trim() !== "")) {
      continue;
    }

    // Check if this row is a header row ("Cost Head ...")
    const chIdx = row.findIndex((c) => /^cost\s*head/i.test(normalizeTextCol(c)));
    if (chIdx !== -1) {
      labelCol = chIdx;
      const totIdx = row.findIndex((c, idx) => idx > chIdx && /^total$/i.test(normalizeTextCol(c)));
      totalCol = totIdx;
      dateStartCol = chIdx + 1;
      dateEndCol = totIdx > chIdx ? totIdx - 1 : row.length - 1;
      currentTag = "BILLABLE";
      currentIsSalary = false;
      currentSectionHint = "";
      continue;
    }

    const label = normalizeTextCol(row[labelCol]);
    if (!label) continue;

    // Stop if concatenated CSV enters another report block (Bill tracking / Bonus / House rent)
    if (
      /^(project name|bonus report|month\s*$|head\s*$)/i.test(label) ||
      /^sbm approved/i.test(label)
    ) {
      break;
    }

    const lower = label.toLowerCase();

    // Update section context from banner headings
    if (isSectionBannerLabel(label)) {
      if (
        lower.includes("ims investment") ||
        lower.includes("ims hr") ||
        lower.includes("non-billable") ||
        lower.includes("non billable")
      ) {
        currentTag = "IMS_INVESTMENT";
      } else {
        currentTag = "BILLABLE";
      }
      currentIsSalary =
        lower.includes("hr fixed") ||
        lower.includes("hr variable") ||
        lower.includes("ims hr") ||
        lower === "salary";
      currentSectionHint = lower.includes("hr variable")
        ? "variable"
        : lower.includes("hr fixed")
        ? "fixed"
        : "";
      continue;
    }

    if (isDerivedOrSubtotalLabel(label)) continue;

    // Amount = Total column if present and non-zero, otherwise sum across day columns
    let amount = totalCol >= 0 ? parseNumericCell(row[totalCol]) : 0;
    if (amount === 0 && dateEndCol >= dateStartCol) {
      let sum = 0;
      for (let c = dateStartCol; c <= Math.min(dateEndCol, row.length - 1); c++) {
        sum += parseNumericCell(row[c]);
      }
      amount = sum;
    }

    if (amount <= 0) continue;

    const lineIsIms =
      currentTag === "IMS_INVESTMENT" ||
      lower.includes("ims hr") ||
      lower.includes("non-billable");
    const lineIsSalary =
      currentIsSalary ||
      lower.includes("salary") ||
      lower.includes("project manager cost") ||
      lower.includes("project executive cost");

    items.push(
      buildRowItem({
        sl: items.length + 1,
        label,
        amount,
        tag: lineIsIms ? "IMS_INVESTMENT" : "BILLABLE",
        isSalary: lineIsSalary,
        forMonth: targetMonth,
        lag,
        activeCostHeads,
        sectionHint: currentSectionHint,
      })
    );
  }

  return {
    items,
    sourceLabel: sheetName,
    matchedMonthLabel: targetMonth,
    warnings: [],
  };
}

/**
 * Fallback parser for standard IMS Requisition CSV / Excel templates (5-column, 6-column legacy, or COMPANY 4-column).
 */
function parseStandardTabularSheet(
  rows: unknown[][],
  sheetName: string,
  requisitionMode: "COMPANY" | "PROJECT" | "EVENT",
  targetMonth: string,
  lag: number,
  activeCostHeads: CostHeadConfig[]
): SpreadsheetImportResult {
  const nonEmptyRows = rows.filter((r) =>
    r.some((c) => c !== undefined && c !== null && String(c).trim() !== "")
  );
  if (nonEmptyRows.length <= 1) {
    return { items: [], sourceLabel: sheetName, warnings: ["File appears empty or has no data rows."] };
  }

  const prevMonth = getPreviousYearMonth(targetMonth);
  const parsedRows: ImportedRequisitionRow[] = [];

  for (let idx = 1; idx < nonEmptyRows.length; idx++) {
    const cols = nonEmptyRows[idx].map((c) => normalizeTextCol(c));
    if (cols.length < 2) continue;

    if (requisitionMode === "COMPANY") {
      const particulars = cols[0] || "";
      const purpose = cols[1] || "";
      const qty = String(parseNumericCell(cols[2]) || 1);
      const unitPrice = String(parseNumericCell(cols[3]) || 0);
      if (!particulars && parseNumericCell(unitPrice) <= 0) continue;
      parsedRows.push({
        sl: parsedRows.length + 1,
        costHead: "",
        costTag: "BILLABLE",
        forMonth: targetMonth,
        lastMonthAmount: 0,
        particulars: particulars || "Expense Item",
        purpose,
        qty,
        unitPrice,
      });
    } else {
      let costHeadName = cols[0] || "";
      let rawTag = (cols[1] || "").toUpperCase();
      let particulars = cols[2] || costHeadName;
      let qty = String(parseNumericCell(cols[3]) || 1);
      let unitPrice = String(parseNumericCell(cols[4]) || 0);

      if (/^\d{4}-\d{2}$/.test(cols[0] || "") && cols.length >= 3) {
        costHeadName = cols[1] || "";
        unitPrice = String(parseNumericCell(cols[2]) || 0);
        rawTag = (cols[3] || "").toUpperCase();
        particulars = cols[5] ? `${costHeadName} — ${cols[5]}` : costHeadName;
        qty = "1";
      }

      const matchedHead =
        activeCostHeads.find((ch) => ch.name.toLowerCase() === costHeadName.toLowerCase()) ||
        matchActiveCostHead(costHeadName, activeCostHeads);
      const costTag: "BILLABLE" | "IMS_INVESTMENT" = rawTag.includes("IMS")
        ? "IMS_INVESTMENT"
        : matchedHead?.tag || "BILLABLE";
      const isSal = matchedHead?.isSalary ?? false;
      const rowMonth =
        requisitionMode === "PROJECT" && isSal && lag === 1 ? prevMonth : targetMonth;

      if (!costHeadName && !particulars && parseNumericCell(unitPrice) <= 0) continue;

      parsedRows.push({
        sl: parsedRows.length + 1,
        costHead: matchedHead?.name || costHeadName || activeCostHeads[0]?.name || "General",
        costTag,
        forMonth: rowMonth,
        lastMonthAmount: matchedHead?.defaultAmount || 0,
        particulars: particulars || matchedHead?.name || costHeadName || "Expense Item",
        purpose: "",
        qty,
        unitPrice,
      });
    }
  }

  return {
    items: parsedRows,
    sourceLabel: sheetName,
    warnings: [],
  };
}

/**
 * Unified importer for `.xlsx`, `.xls`, and `.csv` files uploaded on New Requisition.
 */
export function parseSpreadsheetToRequisitionItems(params: {
  data: ArrayBuffer | string;
  fileName: string;
  requisitionMode: "COMPANY" | "PROJECT" | "EVENT";
  forMonth: string;
  salaryMonthLag: number;
  activeCostHeads: CostHeadConfig[];
}): SpreadsheetImportResult {
  const { data, fileName, requisitionMode, forMonth, salaryMonthLag, activeCostHeads } = params;
  const workbook =
    typeof data === "string"
      ? XLSX.read(data, { type: "string" })
      : XLSX.read(new Uint8Array(data), { type: "array" });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { items: [], sourceLabel: fileName, warnings: ["No sheets found in file."] };
  }

  const sheetToGrid = (name: string): unknown[][] =>
    XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
    }) as unknown[][];

  // For single-sheet CSV/Excel or concatenated multi-section CSV:
  if (workbook.SheetNames.length === 1) {
    const onlyName = workbook.SheetNames[0];
    const grid = sheetToGrid(onlyName);

    // First look for Projection Matrix matching targetMonth if present anywhere in the sheet
    const projResult = tryParseProjectionMatrixSheet(
      grid,
      onlyName,
      forMonth,
      salaryMonthLag,
      activeCostHeads
    );
    if (projResult && projResult.items.length > 0) return projResult;

    const dailyResult = tryParseDailyExpenditureSheet(
      grid,
      onlyName,
      forMonth,
      salaryMonthLag,
      activeCostHeads
    );
    if (dailyResult && dailyResult.items.length > 0) return dailyResult;

    return parseStandardTabularSheet(
      grid,
      onlyName,
      requisitionMode,
      forMonth,
      salaryMonthLag,
      activeCostHeads
    );
  }

  // Multi-sheet Excel workbook (.xls / .xlsx):
  // 1. Prefer an exact daily tab matching `forMonth` (e.g. "Nov'26", "Oct'26") IF it has non-zero lines
  const monthTab = workbook.SheetNames.find(
    (s) => parseMonthHeaderToYYYYMM(s) === forMonth
  );
  if (monthTab) {
    const monthGrid = sheetToGrid(monthTab);
    const dailyRes = tryParseDailyExpenditureSheet(
      monthGrid,
      monthTab,
      forMonth,
      salaryMonthLag,
      activeCostHeads
    );
    if (dailyRes && dailyRes.items.length > 0) {
      return dailyRes;
    }
  }

  // 2. Otherwise inspect Summary / Profit Calculation / Profitability sheets for `forMonth` column
  const orderedSheets = [...workbook.SheetNames].sort((a, b) => {
    const score = (n: string) =>
      /profit/i.test(n) ? 0 : /summary/i.test(n) ? 1 : 2;
    return score(a) - score(b);
  });

  const collectedWarnings: string[] = [];
  for (const name of orderedSheets) {
    const grid = sheetToGrid(name);
    const projRes = tryParseProjectionMatrixSheet(
      grid,
      name,
      forMonth,
      salaryMonthLag,
      activeCostHeads
    );
    if (projRes) {
      if (projRes.items.length > 0) return projRes;
      collectedWarnings.push(...projRes.warnings);
    }
  }

  // 3. Fallback to first non-empty daily/standard sheet
  const fallbackSheet = monthTab || workbook.SheetNames[0];
  const fallbackGrid = sheetToGrid(fallbackSheet);
  const dailyFallback = tryParseDailyExpenditureSheet(
    fallbackGrid,
    fallbackSheet,
    forMonth,
    salaryMonthLag,
    activeCostHeads
  );
  if (dailyFallback && dailyFallback.items.length > 0) return dailyFallback;

  const stdFallback = parseStandardTabularSheet(
    fallbackGrid,
    fallbackSheet,
    requisitionMode,
    forMonth,
    salaryMonthLag,
    activeCostHeads
  );
  return {
    ...stdFallback,
    warnings: [...collectedWarnings, ...stdFallback.warnings],
  };
}

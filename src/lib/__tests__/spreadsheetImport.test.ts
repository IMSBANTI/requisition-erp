import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseMonthHeaderToYYYYMM,
  parseSpreadsheetToRequisitionItems,
} from "../spreadsheetImport";
import {
  ROBI_SME_COST_HEADS,
  DBH_SALES_OFFICER_COST_HEADS,
  calculateProfitSummary,
} from "../profitEngine";

describe("spreadsheetImport — Excel & CSV Requisition Importer", () => {
  it("parses month header variations into YYYY-MM", () => {
    expect(parseMonthHeaderToYYYYMM("Nov'26")).toBe("2026-11");
    expect(parseMonthHeaderToYYYYMM("May '26")).toBe("2026-05");
    expect(parseMonthHeaderToYYYYMM("Feb-'26")).toBe("2026-02");
    expect(parseMonthHeaderToYYYYMM("Sep'2026")).toBe("2026-09");
    expect(parseMonthHeaderToYYYYMM("2026-11")).toBe("2026-11");
    expect(parseMonthHeaderToYYYYMM("Cost Head")).toBeNull();
  });

  it("imports standard 5-column CSV template", () => {
    const csv = [
      "Cost Head,Cost Type (BILLABLE/IMS_INVESTMENT),Particulars,Qty,Unit Price",
      '"House Rent",BILLABLE,"Zone Rent",1,396500',
      '"KAM / Project Manager Salary (Non-Billable)",IMS_INVESTMENT,"PM Cost",1,38000',
    ].join("\n");

    const res = parseSpreadsheetToRequisitionItems({
      data: csv,
      fileName: "template.csv",
      requisitionMode: "PROJECT",
      forMonth: "2026-11",
      salaryMonthLag: 1,
      activeCostHeads: ROBI_SME_COST_HEADS,
    });

    expect(res.items).toHaveLength(2);
    expect(res.items[0].costTag).toBe("BILLABLE");
    expect(res.items[0].forMonth).toBe("2026-11");
    expect(res.items[1].costTag).toBe("IMS_INVESTMENT");
    expect(res.items[1].forMonth).toBe("2026-10");
  });

  it("imports Robi SME multi-sheet .xlsx falling back from empty Nov'26 tab to Profit Calculation and verifies Nov'26 P&L", () => {
    const wb = XLSX.utils.book_new();
    // Empty Nov'26 daily tab (matching Robi workbook template for future months)
    const novDaily = [
      ["Cost Head", 46327, 46328, "Total"],
      ["Current Month"],
      ["IMS Investment (SME+Enterprise)"],
      ["ID card Back Office", "", "", 0],
      ["N. Total Billable cost (L-M)", 0, 0, 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(novDaily), "Nov'26");

    // Profit Calculation projection tab
    const profitCalc = [
      ["", "", "", "Projection"],
      ["SBM approved", "Cost Head", "Oct'26", "Nov'26", "Dec'26"],
      ["FF", "FF Number", 239, 239, 239],
      ["", "(i) Field Force Fixed Salary (SME)", 2559753.48, 2318421.798, 2318421.798],
      ["", "(ii) Back Office Fixed Salary (Back Office+ EBS+SSE)", 307241, 312880.59, 312880.59],
      ["", "Total Fixed Salary (HR Salary)", 2866994.48, 2631302.388, 2631302.388],
      ["", "(i) Field Force Variable Salary (SME Based on approval)", 1651993.64, 1177597.8797, 1177597.8797],
      ["", "(ii) Back Office Variable Salary (Back Office+EBS+SSE- Based on approval)", 210629, 216194.55, 216194.55],
      ["", "Total Variable Salary", 1862622.64, 1393792.4297, 1393792.4297],
      ["", "Office Expenditure", 738575, 720561.6, 720561.6],
      ["", "Laptop / Mobile bill / Furniture Cost", 251408, 211194.72, 211194.72],
      ["", "Total Operation Cost", 989983, 931756.32, 931756.32],
      ["", "Tracking / Campaign / Festivals Bonus Received from Client", 15300, 13498.65, 13498.65],
      ["", "Additional Amount in GR", 0, 0, 0],
      ["", "Total Cost (Total Fixed Payment+Total Variable Salary+Operation Cost+Other Cost)", 5734900.12, 4970349.7877, 4970349.7877],
      ["", "Service Charge-4.5%", 258070.51, 223665.74, 223665.74],
      ["", "2% AIT on Cost-Inflow", 119859.41, 103880.31, 103880.31],
      ["", "Sub Total(Total Cost+Net Earning)", 6112830.04, 5297895.84, 5297895.84],
      ["", "Monthly IMS HR Investment(KAM+OE)", 38000, 38000, 38000],
      ["", "Net Profit After TAX", 278801.62, 236567.09, 236567.09],
      ["", "Billing Amount", 7029754.54, 6092580.21, 6092580.21],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(profitCalc), "Profit Calculation");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const res = parseSpreadsheetToRequisitionItems({
      data: buf,
      fileName: "robi_sme.xlsx",
      requisitionMode: "PROJECT",
      forMonth: "2026-11",
      salaryMonthLag: 1,
      activeCostHeads: ROBI_SME_COST_HEADS,
    });

    expect(res.sourceLabel).toBe("Profit Calculation");
    expect(res.matchedMonthLabel).toBe("Nov'26");

    const billableTotal = res.items
      .filter((i) => i.costTag === "BILLABLE")
      .reduce((s, i) => s + Number(i.unitPrice), 0);
    const imsTotal = res.items
      .filter((i) => i.costTag === "IMS_INVESTMENT")
      .reduce((s, i) => s + Number(i.unitPrice), 0);

    expect(billableTotal).toBeCloseTo(4970349.79, 2);
    expect(imsTotal).toBeCloseTo(38000, 2);

    const calc = calculateProfitSummary({
      terms: {
        billingProfile: "COST_PLUS_GROSSUP",
        feeRate: 0.045,
        aitRate: 0.01,
        aitGrossupRate: 0.02,
        vatRate: 0.15,
      },
      billableCost: billableTotal,
      imsInvestment: imsTotal,
    });

    expect(calc.feeAmount).toBeCloseTo(223665.74, 2);
    expect(calc.aitGrossupAmount).toBeCloseTo(103880.31, 2);
    expect(calc.billExVat).toBeCloseTo(5297895.84, 2);
    expect(calc.aitDeducted).toBeCloseTo(52978.96, 2);
    expect(calc.netProfit).toBeCloseTo(236567.09, 2);
  });

  it("imports Daily Expenditure sheet skipping A..N subtotals and preserving IMS vs Billable tags", () => {
    const dailyCsv = [
      "Cost Head,46266,46267,Total",
      "Current Month,,,",
      "IMS Investment (SME+Enterprise),,,",
      "Project Manager Convayence (Inter Dhaka),1500,,1500",
      "A. Total IMS Investment (SME+Enterprise),1500,0,1500",
      "Operations Cost,,,",
      "House Rent,,396500,396500",
      "D. Total Operation Cost ,0,396500,396500",
      "IMS HR Cost (Non-billable),,,",
      "Project Manager Cost Oct'24 (1),38000,,38000",
      "J.Total IMS HR Cost (Non Billable),38000,0,38000",
      "N. Total Billable cost (L-M),0,396500,396500",
    ].join("\n");

    const res = parseSpreadsheetToRequisitionItems({
      data: dailyCsv,
      fileName: "Sep26.csv",
      requisitionMode: "PROJECT",
      forMonth: "2026-09",
      salaryMonthLag: 1,
      activeCostHeads: ROBI_SME_COST_HEADS,
    });

    expect(res.items).toHaveLength(3);
    expect(res.items[0].costTag).toBe("IMS_INVESTMENT");
    expect(res.items[0].unitPrice).toBe("1500");
    expect(res.items[1].costTag).toBe("BILLABLE");
    expect(res.items[1].unitPrice).toBe("396500");
    expect(res.items[2].costTag).toBe("IMS_INVESTMENT");
    expect(res.items[2].unitPrice).toBe("38000");
    expect(res.items[2].forMonth).toBe("2026-08");
  });

  it("imports DBH Sales Officer Profitability -2026 format where month headers sit one row above Cost Head", () => {
    const wb = XLSX.utils.book_new();
    const sheet = [
      [null, null, "Aug'2026", "Sep'2026", "Oct'2026"],
      ["Sl.", "Cost Head", "Total Amount", "Total Amount", "Total Amount"],
      ["A", "Claim Bill", "", "", ""],
      [1, "Sales Officer Gross Salary", 60537, 84646, 109042],
      [3, "Key Account  Manager Salary", 5101.93, 5101.93, 5101.93],
      [null, "Total", 65638.93, 89747.93, 114143.93],
      [null, "Service Charge (Agency Com.7% )", 4594.73, 6282.36, 7990.08],
      [null, "NET INFLOW", 68828.98, 94109.68, 119691.32],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), "Profitability -2026");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const res = parseSpreadsheetToRequisitionItems({
      data: buf,
      fileName: "dbh_so.xlsx",
      requisitionMode: "PROJECT",
      forMonth: "2026-09",
      salaryMonthLag: 0,
      activeCostHeads: DBH_SALES_OFFICER_COST_HEADS,
    });

    expect(res.items).toHaveLength(2);
    expect(res.items[0].unitPrice).toBe("84646");
    expect(res.items[1].unitPrice).toBe("5101.93");
  });
});

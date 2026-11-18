import { prisma } from "@/lib/db";
import {
  DBH_OFFICE_COST_HEADS,
  DBH_SALES_OFFICER_COST_HEADS,
  DEFAULT_PROJECT_COST_HEADS,
  ROBI_SME_COST_HEADS,
  extractProjectMeta,
  getDefaultProjectTermsByCode,
  packCostHeadsWithMeta,
  resolveCostHeadsForKind,
} from "@/lib/profitEngine";

export const UPLOADED_KIT_PROJECTS = [
  {
    code: "PROJ-ROBI",
    name: "Project Robi SME",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1074", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-UBL-CM",
    name: "UBL CM (Unilever Customer Marketing)",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1078", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-UBL-PS",
    name: "UBL PS (Unilever Perfect Store)",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1078", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-UBL-DDT",
    name: "UBL DDT (Unilever Direct Distribution)",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1078", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-UBL-DFF",
    name: "UBL DFF (Unilever Dedicated Field Force)",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1078", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-UBL-MDO",
    name: "UBL MDO (Unilever Market Development)",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1078", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-PUREIT",
    name: "Project Unilever Pureit",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1079", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-BL-RSO",
    name: "BL RSO, MDO, Rollout, BP",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1070", "1071", "1072"],
  },
  {
    code: "PROJ-DBH",
    name: "DBH Office Set-up",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1074", "1070", "1071", "1072"],
  },
  {
    code: "PROJ-NAGAD",
    name: "Project Nagad",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1070", "1071", "1072"],
  },
  {
    code: "PROJ-ROCKET",
    name: "Project Rocket",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1070", "1071", "1072"],
  },
  {
    code: "PROJ-MARICO",
    name: "Project Marico",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1070", "1071", "1072"],
  },
  {
    code: "PROJ-XIAOMI-BP",
    name: "Project Xiaomi BP",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1070", "1071", "1072"],
  },
  {
    code: "PROJ-SALES-OFFICER",
    name: "Project Sales Officer",
    headEmpId: "1070",
    checkerEmpId: "1071",
    directorEmpId: "1004",
    memberEmpIds: ["1074", "1070", "1071", "1072"],
  },
];

export const LEGACY_PROJECTS_TO_REMOVE = [
  "PROJ-UPY",
  "PROJ-GP",
  "PROJ-SINGER",
  "PROJ-BAT-CE",
  "PROJ-UNILEVER",
  "PROJ-MT",
  "PROJ-BHN",
];

let syncedInProcess = false;

export async function ensureUploadedKitProjectsSynced(): Promise<void> {
  if (syncedInProcess) return;
  try {
    const [existingDbh, legacyCount, existingRobiList, existingSalesOfficer] = await Promise.all([
      prisma.project.findUnique({
        where: { code: "PROJ-DBH" },
        select: { id: true, costHeads: true },
      }),
      prisma.project.count({
        where: { code: { in: LEGACY_PROJECTS_TO_REMOVE } },
      }),
      prisma.project.findMany({
        where: { code: { in: ["PROJ-ROBI", "PROJ-ROBI-SME"] } },
        select: {
          id: true,
          code: true,
          name: true,
          billingProfile: true,
          feeRate: true,
          aitRate: true,
          costHeads: true,
        },
      }),
      prisma.project.findUnique({
        where: { code: "PROJ-SALES-OFFICER" },
        select: { id: true, costHeads: true },
      }),
    ]);

    const robiNeedsUpgrade = existingRobiList.some((rp) => {
      const meta = extractProjectMeta(rp.costHeads);
      return (
        meta.robiSyncedV2 !== true ||
        rp.name === "Project Robi" ||
        (rp.billingProfile === "COST_PLUS_GROSSUP" &&
          meta.aitGrossupRate === undefined)
      );
    });
    const dbhNeedsUpgrade =
      existingDbh && extractProjectMeta(existingDbh.costHeads).dbhSyncedV2 !== true;
    const soNeedsUpgrade =
      existingSalesOfficer &&
      extractProjectMeta(existingSalesOfficer.costHeads).dbhSyncedV2 !== true;

    if (
      existingDbh &&
      legacyCount === 0 &&
      !robiNeedsUpgrade &&
      !dbhNeedsUpgrade &&
      !soNeedsUpgrade
    ) {
      syncedInProcess = true;
      return;
    }

    const imsCo = await prisma.company.findFirst({ where: { code: "IMS" } });
    if (!imsCo) return;

    const [empUsers, auditLogs] = await Promise.all([
      prisma.user.findMany({
        where: {
          employeeId: {
            in: ["1004", "1070", "1071", "1072", "1074", "1078", "1079"],
          },
        },
        select: { id: true, employeeId: true },
      }),
      prisma.auditLog.findMany({
        where: {
          action: { in: ["PROJECT_DELETED", "PROJECT_ARCHIVED", "PROJECT_CREATED"] },
        },
        orderBy: { createdAt: "asc" },
        select: { action: true, details: true },
      }),
    ]);

    const userByEmpId: Record<string, string> = {};
    for (const u of empUsers) {
      if (u.employeeId) userByEmpId[u.employeeId] = u.id;
    }

    const deletedCodes = new Set<string>();
    for (const log of auditLogs) {
      const match = log.details?.match(/\(([^()]+)\)\s+(?:deleted|archived|created)/i);
      if (match && match[1]) {
        const c = match[1].trim().toUpperCase();
        if (log.action === "PROJECT_DELETED" || log.action === "PROJECT_ARCHIVED") {
          deletedCodes.add(c);
        } else if (log.action === "PROJECT_CREATED") {
          deletedCodes.delete(c);
        }
      }
    }

    // 1. Ensure all 14 uploaded projects exist & upgrade existing kit records
    for (const p of UPLOADED_KIT_PROJECTS) {
      const existing = await prisma.project.findFirst({
        where:
          p.code === "PROJ-ROBI"
            ? { code: { in: ["PROJ-ROBI", "PROJ-ROBI-SME"] } }
            : { code: p.code },
      });

      if (!existing) {
        if (deletedCodes.has(p.code.toUpperCase())) continue;
        if (p.code === "PROJ-ROBI" && deletedCodes.has("PROJ-ROBI-SME")) continue;
        const defaultTerms = getDefaultProjectTermsByCode(p.code, "PERMANENT");
        const memberIds = p.memberEmpIds
          .map((eid) => userByEmpId[eid])
          .filter(Boolean);

        await prisma.project.create({
          data: {
            code: p.code,
            name: p.name,
            companyId: imsCo.id,
            kind: "PERMANENT",
            category: "OUTSOURCING",
            headId: userByEmpId[p.headEmpId] || null,
            checkerId: userByEmpId[p.checkerEmpId] || null,
            directorId: userByEmpId[p.directorEmpId] || null,
            mdApprovalMode: "MONTHLY",
            requisitionTypes: ["BPO", "ADMIN", "CASH"],
            billingProfile: String(defaultTerms.billingProfile || "COST_PLUS"),
            feeRate: Number(defaultTerms.feeRate ?? 0.08),
            aitRate: Number(defaultTerms.aitRate ?? 0.012),
            vatRate: Number(defaultTerms.vatRate ?? 0.15),
            billCycleDays: Number(defaultTerms.billCycleDays ?? 30),
            funding: String(defaultTerms.funding || "POSTPAID"),
            salaryMonthLag: Number(defaultTerms.salaryMonthLag ?? 1),
            fixedMonthlyBill: defaultTerms.fixedMonthlyBill
              ? Number(defaultTerms.fixedMonthlyBill)
              : null,
            maintenanceBudget: defaultTerms.maintenanceBudget
              ? Number(defaultTerms.maintenanceBudget)
              : 0,
            monthlyAmortization: defaultTerms.monthlyAmortization
              ? Number(defaultTerms.monthlyAmortization)
              : 0,
            costHeads:
              p.code === "PROJ-ROBI"
                ? (packCostHeadsWithMeta(ROBI_SME_COST_HEADS, {
                    aitGrossupRate: Number(defaultTerms.aitGrossupRate ?? 0.02),
                    robiSyncedV2: true,
                  }) as any)
                : p.code === "PROJ-DBH"
                ? (packCostHeadsWithMeta(DBH_OFFICE_COST_HEADS, {
                    dbhSyncedV2: true,
                  }) as any)
                : p.code === "PROJ-SALES-OFFICER"
                ? (packCostHeadsWithMeta(DBH_SALES_OFFICER_COST_HEADS, {
                    reimbursementTaxDivisor: Number(
                      defaultTerms.reimbursementTaxDivisor ?? 0.98
                    ),
                    fixedKamRecovery: Number(
                      defaultTerms.fixedKamRecovery ?? 5101.93
                    ),
                    dbhSyncedV2: true,
                  }) as any)
                : (DEFAULT_PROJECT_COST_HEADS as any),
            members: { connect: memberIds.map((id) => ({ id })) },
          },
        });
      } else if (p.code === "PROJ-ROBI") {
        const robiRows =
          existingRobiList.length > 0
            ? existingRobiList
            : existing
            ? [existing]
            : [];
        for (const rp of robiRows) {
          const robiMeta = extractProjectMeta(rp.costHeads);
          const needsNameFix = rp.name === "Project Robi";
          const isLegacyCostPlus =
            rp.billingProfile === "COST_PLUS" &&
            (Number(rp.feeRate) === 0.08 || rp.code === "PROJ-ROBI-SME");
          const needsRobiV2 = robiMeta.robiSyncedV2 !== true;

          if (needsNameFix || isLegacyCostPlus || needsRobiV2) {
            await prisma.project.update({
              where: { id: rp.id },
              data: {
                ...(needsNameFix ? { name: "Project Robi SME" } : {}),
                ...(isLegacyCostPlus
                  ? {
                      billingProfile: "COST_PLUS_GROSSUP",
                      feeRate: 0.045,
                      aitRate: 0.01,
                    }
                  : Number(rp.aitRate) === 0.02
                  ? { aitRate: 0.01 }
                  : {}),
                costHeads: packCostHeadsWithMeta(
                  resolveCostHeadsForKind(rp.costHeads, false, rp.code),
                  {
                    ...robiMeta,
                    aitGrossupRate: robiMeta.aitGrossupRate ?? 0.02,
                    robiSyncedV2: true,
                  }
                ) as any,
              },
            });
          }
        }
      } else if (p.code === "PROJ-DBH" && existing) {
        const dbhMeta = extractProjectMeta(existing.costHeads);
        if (dbhMeta.dbhSyncedV2 !== true) {
          const ruhanId = userByEmpId["1074"];
          await prisma.project.update({
            where: { code: "PROJ-DBH" },
            data: {
              aitRate:
                Number(existing.aitRate) === 0.015
                  ? 0.01
                  : Number(existing.aitRate),
              monthlyAmortization:
                Number(existing.monthlyAmortization) === 43514.8
                  ? 43514.84
                  : Number(existing.monthlyAmortization || 43514.84),
              costHeads: packCostHeadsWithMeta(
                resolveCostHeadsForKind(existing.costHeads, false, "PROJ-DBH"),
                { ...dbhMeta, dbhSyncedV2: true }
              ) as any,
              ...(ruhanId ? { members: { connect: [{ id: ruhanId }] } } : {}),
            },
          });
        }
      } else if (p.code === "PROJ-SALES-OFFICER" && existing) {
        const soMeta = extractProjectMeta(existing.costHeads);
        if (soMeta.dbhSyncedV2 !== true) {
          const ruhanId = userByEmpId["1074"];
          const isUnmodifiedDefault = Number(existing.feeRate) === 0.08;
          await prisma.project.update({
            where: { code: "PROJ-SALES-OFFICER" },
            data: {
              ...(isUnmodifiedDefault
                ? {
                    feeRate: 0.07,
                    aitRate: 0.01,
                    billCycleDays: 1,
                    funding: "PREPAID",
                    salaryMonthLag: 0,
                  }
                : {}),
              costHeads: packCostHeadsWithMeta(
                resolveCostHeadsForKind(
                  existing.costHeads,
                  false,
                  "PROJ-SALES-OFFICER"
                ),
                {
                  ...soMeta,
                  reimbursementTaxDivisor:
                    soMeta.reimbursementTaxDivisor ?? 0.98,
                  fixedKamRecovery: soMeta.fixedKamRecovery ?? 5101.93,
                  dbhSyncedV2: true,
                }
              ) as any,
              ...(ruhanId ? { members: { connect: [{ id: ruhanId }] } } : {}),
            },
          });
        }
      }
    }

    // 2. Delete all other non-kit legacy projects (PROJ-UPY, PROJ-GP, PROJ-SINGER, PROJ-BAT-CE, PROJ-UNILEVER, PROJ-MT, PROJ-BHN)
    const legacyProjects = await prisma.project.findMany({
      where: { code: { in: LEGACY_PROJECTS_TO_REMOVE } },
      select: { id: true, code: true },
    });

    if (legacyProjects.length > 0) {
      const [robiProj, ublPsProj] = await Promise.all([
        prisma.project.findFirst({
          where: { code: { in: ["PROJ-ROBI", "PROJ-ROBI-SME"] } },
          select: { id: true },
        }),
        prisma.project.findUnique({ where: { code: "PROJ-UBL-PS" }, select: { id: true } }),
      ]);

      for (const lp of legacyProjects) {
        const reqCount = await prisma.requisition.count({ where: { projectId: lp.id } });
        if (reqCount > 0) {
          const fallbackId =
            lp.code === "PROJ-UNILEVER"
              ? ublPsProj?.id || robiProj?.id
              : robiProj?.id || ublPsProj?.id;
          if (fallbackId) {
            await prisma.requisition.updateMany({
              where: { projectId: lp.id },
              data: { projectId: fallbackId },
            });
          }
        }
        await prisma.project.update({
          where: { id: lp.id },
          data: { members: { set: [] } },
        });
        await prisma.project.delete({ where: { id: lp.id } });
      }
    }

    syncedInProcess = true;
  } catch (err) {
    console.error("Failed to sync uploaded kit projects:", err);
  }
}

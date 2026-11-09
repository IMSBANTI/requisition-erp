import { prisma } from "@/lib/db";
import {
  DEFAULT_PROJECT_COST_HEADS,
  getDefaultProjectTermsByCode,
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
    memberEmpIds: ["1070", "1071", "1072"],
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
    memberEmpIds: ["1070", "1071", "1072"],
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
    const [existingDbh, legacyCount] = await Promise.all([
      prisma.project.findUnique({
        where: { code: "PROJ-DBH" },
        select: { id: true },
      }),
      prisma.project.count({
        where: { code: { in: LEGACY_PROJECTS_TO_REMOVE } },
      }),
    ]);

    if (existingDbh && legacyCount === 0) {
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

    // 1. Ensure all 14 uploaded projects exist
    for (const p of UPLOADED_KIT_PROJECTS) {
      if (deletedCodes.has(p.code.toUpperCase())) continue;

      const existing = await prisma.project.findUnique({ where: { code: p.code } });
      if (!existing) {
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
            costHeads: DEFAULT_PROJECT_COST_HEADS as any,
            members: { connect: memberIds.map((id) => ({ id })) },
          },
        });
      } else if (p.code === "PROJ-ROBI" && existing.name === "Project Robi") {
        await prisma.project.update({
          where: { code: "PROJ-ROBI" },
          data: { name: "Project Robi SME" },
        });
      }
    }

    // 2. Delete all other non-kit legacy projects (PROJ-UPY, PROJ-GP, PROJ-SINGER, PROJ-BAT-CE, PROJ-UNILEVER, PROJ-MT, PROJ-BHN)
    const legacyProjects = await prisma.project.findMany({
      where: { code: { in: LEGACY_PROJECTS_TO_REMOVE } },
      select: { id: true, code: true },
    });

    if (legacyProjects.length > 0) {
      const [robiProj, ublPsProj] = await Promise.all([
        prisma.project.findUnique({ where: { code: "PROJ-ROBI" }, select: { id: true } }),
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

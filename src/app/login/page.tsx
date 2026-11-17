import { prisma } from "@/lib/db";
import { syncDesignationWithLevel } from "@/lib/userDisplay";
import LoginClient, { DemoAccountItem } from "./LoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_DEMO_ACCOUNTS: DemoAccountItem[] = [
  { label: "Super Admin — Abir Abedin (1001)", email: "admin@ims.com.bd", role: "Priority 5 • Sr. Manager, Information & Transformation" },
  { label: "Director — Iftekhar Hussein (1004)", email: "nahiyan@ims.com.bd", role: "Priority 4 • BD / Outsourcing / Events" },
  { label: "Director — Nazmus Sakib Rahman (1005)", email: "nazmus@ims.com.bd", role: "Priority 4 • BD Red Team / Studio" },
  { label: "Director — Mahabub Hasan Shible (1026)", email: "shible@ims.com.bd", role: "Priority 4 • Operations & Events" },
  { label: "Managing Director — Sami Hasan (1015)", email: "sami.hasan@ims.com.bd", role: "Priority 4 • MD (IMS Group)" },
  { label: "Managing Director — Syed Sarwar Morshed (1025)", email: "sarwarmorshed@ims.com.bd", role: "Priority 4 • MD (IMS Group)" },
  { label: "Accounts Manager — Harun Ur-Rashid (1050)", email: "harun@ims.com.bd", role: "Priority 4 • Accounts Check & Forward" },
  { label: "Outsourcing/TP Mgr — Murshalin Polok (1070)", email: "polok@ims.com.bd", role: "Priority 4 • Outsourcing / TradePulse" },
  { label: "CLAN Manager — Abrar Jawad (1016)", email: "abrar@ims.com.bd", role: "Priority 3 • CLAN Manager" },
  { label: "Events Manager — Naimur Rahman Ringku (1092)", email: "ringku@ims.com.bd", role: "Priority 3 • Operation & Events" },
  { label: "Project Robi & DBH KAM — Ruhan Kabir (1074)", email: "ruhan@ims.com.bd", role: "Priority 3 • KAM, Project Robi & DBH" },
  { label: "Project GP Exec — Salauddin Saju (1077)", email: "saju@ims.com.bd", role: "Priority 3 • Project GP" },
  { label: "CLAN Exec — Saad Ali Shadil (1002)", email: "shadil@clan.com.bd", role: "Priority 2 • CLAN Executive" },
  { label: "Accounts Exec — Israt Jahan Tanni (1051)", email: "tanni@ims.com.bd", role: "Priority 3 • Execution & Disbursement" },
  { label: "HR Manager — Moushumi Tamanna (1014)", email: "moushumi@ims.com.bd", role: "Priority 4 • HR Admin" },
];

export default async function LoginPage() {
  let accounts = DEFAULT_DEMO_ACCOUNTS;

  try {
    const dbUsers = await prisma.user.findMany({
      where: {
        active: true,
        email: { in: DEFAULT_DEMO_ACCOUNTS.map((d) => d.email) },
      },
      select: {
        email: true,
        name: true,
        employeeId: true,
        designation: true,
        levelLabel: true,
        priorityLevel: true,
        role: { select: { name: true } },
      },
    });

    const byEmail = new Map(dbUsers.map((u) => [u.email.toLowerCase(), u]));
    accounts = DEFAULT_DEMO_ACCOUNTS.map((fallback) => {
      const u = byEmail.get(fallback.email.toLowerCase());
      if (!u) return fallback;
      const syncedDesignation = syncDesignationWithLevel(
        u.designation,
        u.levelLabel
      );
      const levelOrRole = u.levelLabel || u.role?.name || "";
      const empSuffix = u.employeeId ? ` (${u.employeeId})` : "";
      return {
        email: u.email,
        label: levelOrRole
          ? `${levelOrRole} — ${u.name}${empSuffix}`
          : `${u.name}${empSuffix}`,
        role: `Priority ${u.priorityLevel ?? 2} • ${syncedDesignation || u.role?.name || ""}`,
      };
    });
  } catch {
    // Keep safe static defaults if DB is unreachable
  }

  return <LoginClient demoAccounts={accounts} />;
}

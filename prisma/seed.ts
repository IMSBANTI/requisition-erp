/**
 * Seed data for IMS GROUP. Safe to run many times (upserts).
 * Named users get placeholder e-mails — change them in Admin → Users.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const P = {
  create: "req.create", viewAll: "req.view.all", viewCompany: "req.view.company", viewProject: "req.view.project",
  viewDept: "req.view.department", approve: "req.approve", approveIt: "req.approve.it", accounts: "req.accounts.check",
  director: "req.director", md: "req.md", forward: "req.forward", execute: "req.execute", manual: "req.manual",
  project: "project.manage", report: "report.view", download: "report.download", admin: "admin.users",
  adminRo: "admin.readonly", grant: "grant.view", audit: "audit.view",
};

const MANAGER = [P.create, P.approve, P.viewCompany, P.viewProject, P.viewDept, P.project, P.report, P.download];

const ROLES = [
  { key: "executive", name: "Executive", isManager: false, permissions: [P.create], description: "Posts requisitions, sees only own" },
  { key: "manager", name: "Manager", isManager: true, permissions: MANAGER, description: "Company / project / department manager" },
  { key: "sr_manager", name: "Senior Manager", isManager: true, permissions: MANAGER, description: "Senior manager with monthly/yearly analysis" },
  {
    key: "super_admin", name: "Sr. Manager IT & Transformation (Super Admin)", isManager: true,
    permissions: [P.create, P.approve, P.approveIt, P.viewAll, P.project, P.report, P.download, P.admin, P.audit, P.manual],
    description: "Approves AI/IT requisitions, full admin rights",
  },
  { key: "hr", name: "HR (Read-only Admin)", isManager: false, permissions: [P.adminRo, P.report, P.download, P.audit], description: "Read-only admin" },
  {
    key: "director", name: "Director", isManager: true,
    permissions: [P.create, P.approve, P.director, P.viewCompany, P.viewProject, P.project, P.report, P.download, P.grant],
    description: "Mandatory approval for own categories",
  },
  {
    key: "accounts_manager", name: "Accounts Manager", isManager: true,
    permissions: [P.create, P.accounts, P.forward, P.manual, P.report, P.download],
    description: "Checked by Accounts; forwards approved requisitions to executives",
  },
  { key: "accounts_executive", name: "Accounts Executive", isManager: false, permissions: [P.execute], description: "Executes / disburses" },
  {
    key: "md", name: "Managing Director", isManager: true,
    permissions: [P.create, P.md, P.viewAll, P.project, P.report, P.download, P.grant, P.audit],
    description: "Final approval (instant or weekly/monthly batch); sees all data",
  },
];

const IMS_ADDRESS = "House 13, Road 04, Block F, Chairman Bari, Banani, Dhaka-1213";
const COMPANIES = [
  { code: "IMS", name: "IMS", legalName: "INTEGRATED MARKETING SERVICE Ltd.", address: IMS_ADDRESS, phone: "+880 2 9847475", email: "info@ims.com.bd", website: "www.ims.com.bd", logo: "/logos/ims.png", accentColor: "#E42528", paperTint: "#FFFFFF" },
  { code: "CLAN", name: "CLAN", legalName: "Country's Largest Audience Network", address: "House 09, Road 4, Block F, Banani, Dhaka-1213, Bangladesh", phone: "+880 2 9847475", email: "info@clan.com.bd", website: "www.clan.com.bd", logo: "/logos/clan.png", accentColor: "#F5A623", paperTint: "#FFF4C2" },
  { code: "SCL", name: "SCL", legalName: "SALES CONNECT LIMITED", address: IMS_ADDRESS, phone: "+880 2 9847475", email: "info@scl.net.bd", website: null, logo: "/logos/scl.png", accentColor: "#414042", paperTint: "#FFFFFF" },
  { code: "TP", name: "TradePULSE", legalName: "TRADE PULSE LTD.", address: IMS_ADDRESS, phone: "+880 2 9847475", email: "info@tradepulsebd.com", website: null, logo: "/logos/tradepulse.png", accentColor: "#004541", paperTint: "#FFFFFF" },
];

const DEPARTMENTS = [
  "Project", "Operations", "Business Development", "Studio", "Outsourcing", "Admin",
  "Accounts", "HR", "IT & Transformation", "Management",
];

async function main() {
  const pw = await bcrypt.hash(process.env.SEED_DEFAULT_PASSWORD || "Ims@12345", 10);

  const roles: Record<string, string> = {};
  for (const r of ROLES) {
    const row = await prisma.role.upsert({ where: { key: r.key }, update: {}, create: r });
    roles[r.key] = row.id;
  }

  const co: Record<string, string> = {};
  for (const c of COMPANIES) {
    const row = await prisma.company.upsert({ where: { code: c.code }, update: c, create: c });
    co[c.code] = row.id;
  }

  const dept: Record<string, string> = {};
  for (const name of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name, companyId: null } });
    const row = existing ?? (await prisma.department.create({ data: { name } }));
    dept[name] = row.id;
  }

  type U = { email: string; name: string; designation: string; role: string; company: string; dept: string; scopes?: string[]; dirCats?: string[] };
  const USERS: U[] = [
    { email: "abir@ims.com.bd", name: "Abir Abedin", designation: "Sr. Manager, Information & Transformation", role: "super_admin", company: "IMS", dept: "IT & Transformation", scopes: ["IMS", "CLAN", "SCL", "TP"] },
    { email: "moushumi@ims.com.bd", name: "Moushumi Tamanna", designation: "HR", role: "hr", company: "IMS", dept: "HR", scopes: ["IMS", "CLAN", "SCL", "TP"] },
    { email: "iftekhar@ims.com.bd", name: "Iftekhar Hussein", designation: "Director", role: "director", company: "IMS", dept: "Management", scopes: ["IMS"], dirCats: ["IMS_OUTSOURCING_STUDIO", "AI_IT", "GENERAL"] },
    { email: "nazmus@ims.com.bd", name: "Nazmus Sakib", designation: "Director, Business Development", role: "director", company: "IMS", dept: "Business Development", scopes: ["IMS", "CLAN", "SCL", "TP"], dirCats: ["BUSINESS_DEVELOPMENT"] },
    { email: "shible@ims.com.bd", name: "Shible", designation: "Director, Operations & Events", role: "director", company: "IMS", dept: "Operations", scopes: ["IMS", "CLAN", "SCL", "TP"], dirCats: ["OPERATIONS_EVENT"] },
    { email: "harun@ims.com.bd", name: "Harun", designation: "Accounts Manager", role: "accounts_manager", company: "IMS", dept: "Accounts" },
    { email: "sumon@ims.com.bd", name: "Sumon", designation: "Accounts Executive", role: "accounts_executive", company: "IMS", dept: "Accounts" },
    { email: "tanni@ims.com.bd", name: "Tanni", designation: "Accounts Executive", role: "accounts_executive", company: "IMS", dept: "Accounts" },
    { email: "md@ims.com.bd", name: "Managing Director", designation: "Managing Director", role: "md", company: "IMS", dept: "Management" },
    { email: "ims.manager@ims.com.bd", name: "IMS Manager", designation: "Manager, IMS", role: "manager", company: "IMS", dept: "Admin", scopes: ["IMS"] },
    { email: "outsourcing.manager@ims.com.bd", name: "Outsourcing Manager", designation: "Manager, Outsourcing", role: "manager", company: "IMS", dept: "Outsourcing", scopes: ["IMS"] },
    { email: "sr.outsourcing@ims.com.bd", name: "Sr. Manager Outsourcing", designation: "Sr. Manager, Outsourcing", role: "sr_manager", company: "IMS", dept: "Outsourcing", scopes: ["IMS"] },
    { email: "clan.manager@clan.com.bd", name: "CLAN Manager", designation: "Manager, CLAN", role: "manager", company: "CLAN", dept: "Admin", scopes: ["CLAN"] },
    { email: "scl.manager@scl.net.bd", name: "SCL Manager", designation: "Manager, SCL", role: "manager", company: "SCL", dept: "Admin", scopes: ["SCL"] },
    { email: "ims.exec@ims.com.bd", name: "IMS Executive", designation: "Executive", role: "executive", company: "IMS", dept: "Admin" },
    { email: "clan.exec@clan.com.bd", name: "CLAN Executive", designation: "Executive", role: "executive", company: "CLAN", dept: "Admin" },
    { email: "tp.exec@tradepulsebd.com", name: "TradePULSE Executive", designation: "Executive", role: "executive", company: "TP", dept: "Operations" },
    { email: "project.exec@ims.com.bd", name: "Project Executive", designation: "Project Executive", role: "executive", company: "IMS", dept: "Project" },
  ];

  const u: Record<string, string> = {};
  for (const x of USERS) {
    const data = {
      name: x.name, designation: x.designation, roleId: roles[x.role], companyId: co[x.company], departmentId: dept[x.dept],
      directorCategories: x.dirCats ?? [],
      companyScopes: { set: (x.scopes ?? []).map((c) => ({ id: co[c] })) },
    };
    const row = await prisma.user.upsert({
      where: { email: x.email },
      update: data,
      create: { ...data, email: x.email, passwordHash: pw, companyScopes: { connect: (x.scopes ?? []).map((c) => ({ id: co[c] })) } },
    });
    u[x.email] = row.id;
  }

  // Department heads
  const heads: Record<string, string> = {
    Admin: "ims.manager@ims.com.bd", Outsourcing: "outsourcing.manager@ims.com.bd", Accounts: "harun@ims.com.bd",
    "IT & Transformation": "abir@ims.com.bd", "Business Development": "nazmus@ims.com.bd", Operations: "shible@ims.com.bd",
    Project: "outsourcing.manager@ims.com.bd", Studio: "ims.manager@ims.com.bd",
  };
  for (const [d, email] of Object.entries(heads)) await prisma.department.update({ where: { id: dept[d] }, data: { headId: u[email] } });

  type Pr = { code: string; name: string; company: string; category: string; head?: string; director?: string; md?: string; types?: string[]; members: string[] };
  const PROJECTS: Pr[] = [
    { code: "IMS-HO", name: "IMS Head Office", company: "IMS", category: "GENERAL", head: "ims.manager@ims.com.bd", types: ["ADMIN", "CASH", "BPO"], members: ["ims.exec@ims.com.bd", "ims.manager@ims.com.bd"] },
    { code: "IMS-STUDIO", name: "IMS Studio", company: "IMS", category: "IMS_OUTSOURCING_STUDIO", head: "ims.manager@ims.com.bd", types: ["STUDIO", "CASH"], members: ["ims.manager@ims.com.bd"] },
    { code: "IMS-IT", name: "AI & IT Transformation", company: "IMS", category: "AI_IT", head: "abir@ims.com.bd", types: ["IT", "CASH"], members: ["abir@ims.com.bd", "ims.exec@ims.com.bd"] },
    { code: "CLAN-ADMIN", name: "CLAN Admin", company: "CLAN", category: "OPERATIONS_EVENT", head: "clan.manager@clan.com.bd", types: ["ADMIN", "CASH"], members: ["clan.exec@clan.com.bd", "clan.manager@clan.com.bd"] },
    { code: "SCL-SALES", name: "SCL Sales", company: "SCL", category: "BUSINESS_DEVELOPMENT", head: "scl.manager@scl.net.bd", types: ["ADMIN", "CASH"], members: ["scl.manager@scl.net.bd"] },
    { code: "TP-OPS", name: "TradePULSE Operations", company: "TP", category: "OPERATIONS_EVENT", head: "shible@ims.com.bd", types: ["ADMIN", "CASH"], members: ["tp.exec@tradepulsebd.com"] },
  ];
  for (let i = 1; i <= 24; i++) {
    const n = String(i).padStart(2, "0");
    PROJECTS.push({
      code: `OUT-${n}`, name: `Outsourcing Project ${n}`, company: "IMS", category: "IMS_OUTSOURCING_STUDIO",
      head: "outsourcing.manager@ims.com.bd", director: "iftekhar@ims.com.bd", md: i <= 12 ? "MONTHLY" : "INSTANT",
      types: ["BPO", "ADMIN", "CASH"],
      members: ["outsourcing.manager@ims.com.bd", "sr.outsourcing@ims.com.bd", ...(i <= 3 ? ["project.exec@ims.com.bd"] : []), ...(i === 1 ? ["ims.exec@ims.com.bd"] : [])],
    });
  }
  for (const p of PROJECTS) {
    const data = {
      name: p.name, companyId: co[p.company], category: p.category,
      headId: p.head ? u[p.head] : null, directorId: p.director ? u[p.director] : null,
      mdApprovalMode: p.md ?? "INSTANT", requisitionTypes: p.types ?? ["BPO", "ADMIN", "CASH"],
      members: { set: p.members.map((e) => ({ id: u[e] })) },
    };
    await prisma.project.upsert({
      where: { code: p.code },
      update: data,
      create: { ...data, code: p.code, members: { connect: p.members.map((e) => ({ id: u[e] })) } },
    });
  }

  console.log(`Seeded ${ROLES.length} roles, ${COMPANIES.length} companies, ${DEPARTMENTS.length} departments, ${USERS.length} users, ${PROJECTS.length} projects.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

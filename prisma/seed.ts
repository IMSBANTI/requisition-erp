/**
 * Seed data for IMS GROUP — Full Employee Roster (54 users from Excel) & Projects/Events.
 * Safe to run many times (upserts).
 * Default login password for each user = their email address (case-insensitive).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const P = {
  create: "req.create",
  viewAll: "req.view.all",
  viewCompany: "req.view.company",
  viewProject: "req.view.project",
  viewDept: "req.view.department",
  approve: "req.approve",
  approveIt: "req.approve.it",
  accounts: "req.accounts.check",
  director: "req.director",
  md: "req.md",
  forward: "req.forward",
  execute: "req.execute",
  manual: "req.manual",
  project: "project.manage",
  report: "report.view",
  download: "report.download",
  admin: "admin.users",
  adminRo: "admin.readonly",
  grant: "grant.view",
  audit: "audit.view",
};

const MANAGER = [
  P.create,
  P.approve,
  P.viewProject,
  P.viewDept,
  P.report,
  P.download,
];

const SR_MANAGER = [
  ...MANAGER,
  P.project,
];

const ROLES = [
  {
    key: "executive",
    name: "Executive",
    isManager: false,
    permissions: [P.create],
    description: "Posts requisitions, sees only own requisitions",
  },
  {
    key: "manager",
    name: "Manager",
    isManager: true,
    permissions: MANAGER,
    description: "Sees & approves only own department / assigned project requisitions",
  },
  {
    key: "sr_manager",
    name: "Senior Manager / Head",
    isManager: true,
    permissions: SR_MANAGER,
    description: "Sees & approves only own division / assigned project requisitions",
  },
  {
    key: "super_admin",
    name: "Sr. Manager, Information & Transformation (Super Admin)",
    isManager: true,
    permissions: [
      P.create,
      P.approve,
      P.approveIt,
      P.viewAll,
      P.project,
      P.report,
      P.download,
      P.admin,
      P.audit,
      P.manual,
    ],
    description: "Approves AI/IT requisitions, full admin rights",
  },
  {
    key: "hr",
    name: "HR & Office Manager (IMS GROUP)",
    isManager: true,
    permissions: [P.create, P.approve, P.adminRo, P.viewAll, P.viewDept, P.project, P.report, P.download, P.audit],
    description: "IMS GROUP HR & Office Head; handles IMS, CLAN, SCL, TradePULSE & project requisitions",
  },
  {
    key: "director",
    name: "Director",
    isManager: true,
    permissions: [
      P.create,
      P.approve,
      P.director,
      P.viewProject,
      P.viewDept,
      P.project,
      P.report,
      P.download,
      P.grant,
    ],
    description: "Mandatory approval for own assigned projects & departments only",
  },
  {
    key: "accounts_manager",
    name: "Accounts Manager",
    isManager: true,
    permissions: [P.create, P.approve, P.accounts, P.forward, P.manual, P.viewAll, P.report, P.download],
    description: "Sees all requisitions; Checked by Accounts & forwards to executives",
  },
  {
    key: "accounts_executive",
    name: "Accounts Executive",
    isManager: false,
    permissions: [P.create, P.execute, P.viewAll, P.report, P.download],
    description: "Sees all requisitions; executes / disburses payments",
  },
  {
    key: "md",
    name: "Managing Director",
    isManager: true,
    permissions: [
      P.create,
      P.approve,
      P.md,
      P.viewAll,
      P.project,
      P.report,
      P.download,
      P.grant,
      P.audit,
    ],
    description: "Final approval (instant or batch); sees all requisitions (approved, pending, rejected)",
  },
];

const IMS_ADDRESS = "House 13, Road 04, Block F, Chairman Bari, Banani, Dhaka-1213";
const COMPANIES = [
  {
    code: "IMS",
    name: "IMS",
    legalName: "INTEGRATED MARKETING SERVICE Ltd.",
    address: IMS_ADDRESS,
    phone: "+880 2 9847475",
    email: "info@ims.com.bd",
    website: "www.ims.com.bd",
    logo: "/logos/ims.png",
    accentColor: "#E42528",
    paperTint: "#FFFFFF",
  },
  {
    code: "CLAN",
    name: "CLAN",
    legalName: "Country's Largest Audience Network",
    address: "House 09, Road 4, Block F, Banani, Dhaka-1213, Bangladesh",
    phone: "+880 2 9847475",
    email: "info@clan.com.bd",
    website: "www.clan.com.bd",
    logo: "/logos/clan.png",
    accentColor: "#F5A623",
    paperTint: "#FFF4C2",
  },
  {
    code: "SCL",
    name: "SCL",
    legalName: "SALES CONNECT LIMITED",
    address: IMS_ADDRESS,
    phone: "+880 2 9847475",
    email: "info@scl.net.bd",
    website: null,
    logo: "/logos/scl.png",
    accentColor: "#414042",
    paperTint: "#FFFFFF",
  },
  {
    code: "TP",
    name: "TradePULSE",
    legalName: "TRADE PULSE LTD.",
    address: IMS_ADDRESS,
    phone: "+880 2 9847475",
    email: "info@tradepulsebd.com",
    website: null,
    logo: "/logos/tradepulse.png",
    accentColor: "#004541",
    paperTint: "#FFFFFF",
  },
];

const DEPARTMENTS = [
  "IT",
  "CLAN",
  "Business Development",
  "Business Development Blue team",
  "Business Development Red team",
  "Studio",
  "Office",
  "HR",
  "IMS GROUP",
  "Operations Projects",
  "Operation",
  "Accounts",
  "Outsourcing",
  "Project Singer",
  "Project Robi",
  "Project BAT CE",
  "Project GP",
  "Project Unilever",
  "Project Unilever Pureit",
  "Project UPY",
  "SCL Accounts",
];

type SeedUser = {
  empId: string;
  name: string;
  email: string;
  dept: string;
  secondaryDepts?: string[];
  priority: number;
  level: "Executive" | "Manager" | "Director" | "MD";
  role: string;
  company: "IMS" | "CLAN" | "SCL" | "TP" | null;
  scopes: ("IMS" | "CLAN" | "SCL" | "TP")[];
  supervisorEmpId?: string;
  notes?: string;
  dirCats?: string[];
};

const EXCEL_USERS: SeedUser[] = [
  { empId: "1001", name: "Abir Abedin", email: "admin@ims.com.bd", dept: "IT", secondaryDepts: ["IMS GROUP"], priority: 5, level: "Manager", role: "super_admin", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], notes: "IMS GROUP — Admin For All, handles IMS, CLAN, SCL, TradePULSE & projects" },
  { empId: "1002", name: "Saad Ali Shadil", email: "shadil@clan.com.bd", dept: "CLAN", priority: 2, level: "Executive", role: "executive", company: "CLAN", scopes: ["CLAN"], supervisorEmpId: "1016", notes: "Approval from 1016" },
  { empId: "1004", name: "Iftekhar Hussein", email: "nahiyan@ims.com.bd", dept: "Business Development", secondaryDepts: ["IMS GROUP", "Outsourcing/TradePulse", "Event projects"], priority: 4, level: "Director", role: "director", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], supervisorEmpId: "1025", notes: "IMS GROUP Director — Approval from 1025 or 1015", dirCats: ["IMS", "OUTSOURCING", "BUSINESS_DEVELOPMENT", "OPERATIONS_EVENT", "AI_IT", "GENERAL"] },
  { empId: "1005", name: "Nazmus Sakib Rahman", email: "nazmus@ims.com.bd", dept: "Business Development Red team", secondaryDepts: ["IMS GROUP", "Studio Project base"], priority: 4, level: "Director", role: "director", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], supervisorEmpId: "1025", notes: "IMS GROUP Director — Approval from 1025 or 1015", dirCats: ["STUDIO", "BUSINESS_DEVELOPMENT"] },
  { empId: "1006", name: "Shahidul Islam", email: "shahidul@clan.com.bd", dept: "CLAN", priority: 3, level: "Manager", role: "manager", company: "CLAN", scopes: ["CLAN"], supervisorEmpId: "1016", notes: "Approval from 1016" },
  { empId: "1007", name: "Tasfir Rabbi", email: "tasfir@ims.com.bd", dept: "Studio", priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Approval from 1004 or 1005" },
  { empId: "1008", name: "Sohag Mia", email: "sohag@ims.com.bd", dept: "Studio", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1009", notes: "Studio Head 1009 or 1007" },
  { empId: "1009", name: "Sohel Uddin", email: "sohel@ims.com.bd", dept: "Studio", priority: 4, level: "Manager", role: "sr_manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Studio Head" },
  { empId: "1010", name: "Mahmudul Hasan", email: "mahmud@ims.com.bd", dept: "Studio", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1009", notes: "Studio Head 1009 or 1007" },
  { empId: "1011", name: "Md Lipon", email: "officestuff@ims.net.bd", dept: "Office", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1014", notes: "Office Head 1014" },
  { empId: "1012", name: "Partha Baidya", email: "partha@clan.com.bd", dept: "CLAN", priority: 2, level: "Executive", role: "executive", company: "CLAN", scopes: ["CLAN"], supervisorEmpId: "1016", notes: "Approval from 1016" },
  { empId: "1014", name: "Moushumi Tamanna", email: "moushumi@ims.com.bd", dept: "HR", secondaryDepts: ["IMS GROUP", "Office"], priority: 4, level: "Manager", role: "hr", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], supervisorEmpId: "1004", notes: "IMS GROUP — HR & Office Head (IMS, CLAN, SCL, TradePULSE)" },
  { empId: "1015", name: "Sami Hasan", email: "sami.hasan@ims.com.bd", dept: "IMS GROUP", priority: 4, level: "MD", role: "md", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], notes: "IMS GROUP Managing Director (IMS, CLAN, SCL, TradePULSE)" },
  { empId: "1016", name: "Abrar Jawad", email: "abrar@ims.com.bd", dept: "CLAN", priority: 3, level: "Manager", role: "manager", company: "CLAN", scopes: ["CLAN", "IMS"], supervisorEmpId: "1004", notes: "Approval from 1004" },
  { empId: "1018", name: "Nazmus Sakib", email: "nazmus.sakib@ims.com.bd", dept: "Business Development Blue team", priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Approval from 1004" },
  { empId: "1019", name: "Mahmud Al Fahad Rakib", email: "farhad@ims.com.bd", dept: "Business Development Red team", priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1005", notes: "Approval from 1005" },
  { empId: "1020", name: "Abul Wazed Chowdhury", email: "wazed@ims.com.bd", dept: "Business Development Blue team", priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Approval from 1004" },
  { empId: "1021", name: "Al Zami", email: "zami@ims.com.bd", dept: "Business Development Blue team", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1020", notes: "1020 or 1018 or Direct 1004" },
  { empId: "1022", name: "Adib Ahnaf", email: "aroz@ims.com.bd", dept: "Business Development Red team", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1019", notes: "1019 or Direct 1005" },
  { empId: "1024", name: "Naima Sultana", email: "naima@ims.com.bd", dept: "Business Development Red team", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1019", notes: "1019 or Direct 1005" },
  { empId: "1025", name: "Syed Sarwar Morshed Azam", email: "sarwarmorshed@ims.com.bd", dept: "IMS GROUP", priority: 4, level: "MD", role: "md", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], notes: "IMS GROUP Managing Director (IMS, CLAN, SCL, TradePULSE)" },
  { empId: "1026", name: "Mahabub Hasan Shible", email: "shible@ims.com.bd", dept: "Operations Projects", secondaryDepts: ["IMS GROUP", "Event projects"], priority: 4, level: "Director", role: "director", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], supervisorEmpId: "1025", notes: "IMS GROUP Director — Operations & Events", dirCats: ["OPERATIONS_EVENT", "GENERAL"] },
  { empId: "1027", name: "Shati", email: "shati.officestuff@ims.net.bd", dept: "Office", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1014", notes: "Office Head 1014 (Password: officestuff@ims.net.bd)" },
  { empId: "1028", name: "MD Tanvir", email: "tanvir.hossen@ims.com.bd", dept: "Studio", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1009", notes: "Studio Head 1009 or 1007" },
  { empId: "1030", name: "Tapash Chandra", email: "tapash@clan.com.bd", dept: "CLAN", priority: 2, level: "Executive", role: "executive", company: "CLAN", scopes: ["CLAN"], supervisorEmpId: "1016", notes: "Approval from 1016" },
  { empId: "1031", name: "Masum Ali", email: "masum@ims.com.bd", dept: "Studio", priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Approval from 1004 or 1005" },
  { empId: "1033", name: "Begum Rehana", email: "rehana.officestuff@ims.net.bd", dept: "Office", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1014", notes: "Office Head 1014 (Password: officestuff@ims.net.bd)" },
  { empId: "1034", name: "Khalid Hasan", email: "khalid@ims.com.bd", dept: "Studio", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1007", notes: "Studio Head 1007 or 1031" },
  { empId: "1035", name: "Habibur Rahman", email: "sujan@ims.com.bd", dept: "Studio", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1007", notes: "Studio Head 1007 or 1031" },
  { empId: "1036", name: "Fahim Muntasir", email: "fahim@ims.com.bd", dept: "Business Development", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Approval from 1004" },
  { empId: "1037", name: "Mukarram Hoque Faisal", email: "mukarram@ims.com.bd", dept: "Business Development", priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1004", notes: "Approval from 1004" },
  { empId: "1050", name: "Md. Harun Ur-Rashid", email: "harun@ims.com.bd", dept: "Accounts", secondaryDepts: ["IMS GROUP"], priority: 4, level: "Manager", role: "accounts_manager", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], notes: "IMS GROUP Accounts Manager — Approve all Requisitions then Goes to 1004 / 1005 / 1026 or MD" },
  { empId: "1051", name: "Israt Jahan", email: "tanni@ims.com.bd", dept: "Accounts", secondaryDepts: ["IMS GROUP"], priority: 3, level: "Executive", role: "accounts_executive", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], notes: "IMS GROUP Accounts — Handles IMS, CLAN, SCL, TradePULSE & project requisitions" },
  { empId: "1052", name: "Sumon", email: "sumon@ims.com.bd", dept: "Accounts", secondaryDepts: ["IMS GROUP"], priority: 2, level: "Executive", role: "accounts_executive", company: null, scopes: ["IMS", "CLAN", "SCL", "TP"], notes: "IMS GROUP Accounts — Handles IMS, CLAN, SCL, TradePULSE & project requisitions" },
  { empId: "1070", name: "Murshalin Mahmud Polok", email: "polok@ims.com.bd", dept: "Outsourcing", secondaryDepts: ["TradePulse", "Events projects"], priority: 4, level: "Manager", role: "sr_manager", company: "IMS", scopes: ["IMS", "TP", "SCL"], supervisorEmpId: "1004", notes: "Head of Outsourcing & TradePulse" },
  { empId: "1071", name: "Rakib Hasan", email: "rakib@ims.com.bd", dept: "Outsourcing", secondaryDepts: ["TradePulse", "Events projects"], priority: 4, level: "Manager", role: "sr_manager", company: "IMS", scopes: ["IMS", "TP", "SCL"], supervisorEmpId: "1004", notes: "Manager Outsourcing & TradePulse" },
  { empId: "1072", name: "Nawshad Ur Rahman", email: "nawshad@ims.com.bd", dept: "Outsourcing", secondaryDepts: ["TradePulse", "Events projects"], priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS", "TP"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1073", name: "Nasir Hazra", email: "nasir.hazra@ims.com.bd", dept: "Project Singer", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1074", name: "Munir Kabir", email: "ruhan@ims.com.bd", dept: "Project Robi", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1075", name: "Monirul Islam", email: "monirul@ims.com.bd", dept: "Project BAT CE", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1076", name: "Mohammad Suruz", email: "suruz@ims.com.bd", dept: "Project BAT CE", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1077", name: "Salauddin Saju", email: "saju@ims.com.bd", dept: "Project GP", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1078", name: "Kazi Fayeruzzaman", email: "shoumik@ims.com.bd", dept: "Project Unilever", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1079", name: "Golam Moin Uddin", email: "moinuddin@ims.com.bd", dept: "Project Unilever Pureit", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1080", name: "Al Arafat", email: "arafat@ims.com.bd", dept: "Project GP", priority: 3, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1070", notes: "Approver ID 1070 or 1071" },
  { empId: "1090", name: "Sagar Kumar Malo", email: "sagar@ims.com.bd", dept: "Operation", secondaryDepts: ["Events"], priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1092", notes: "Approver 1092 or 1093 or 1094" },
  { empId: "1091", name: "Nizam Uddin", email: "nizam@ims.com.bd", dept: "Operation", secondaryDepts: ["Events"], priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1092", notes: "Approver 1092 or 1093 or 1094" },
  { empId: "1092", name: "Naimur Rahman Khan", email: "ringku@ims.com.bd", dept: "Operation", secondaryDepts: ["Events"], priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1026", notes: "Approver 1026" },
  { empId: "1093", name: "Marufur Rahman", email: "pavel@ims.com.bd", dept: "Operation", secondaryDepts: ["Events"], priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1026", notes: "Approver 1026" },
  { empId: "1094", name: "Ahsanuzzaman Roni", email: "rony@ims.com.bd", dept: "Operation", secondaryDepts: ["Events"], priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1026", notes: "Approver 1026" },
  { empId: "1095", name: "Md Hasanuzzaman", email: "hasanuzzaman@ims.com.bd", dept: "Operation", secondaryDepts: ["Events"], priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1092", notes: "Approver 1092 or 1093 or 1094" },
  { empId: "1096", name: "Mahedy Hasan", email: "hridoy@ims.com.bd", dept: "Operation", secondaryDepts: ["Events", "GP Project Events"], priority: 2, level: "Executive", role: "executive", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1092", notes: "Approver 1092 or 1093 or 1094" },
  { empId: "1097", name: "Ashraful Alam", email: "kauser@ims.com.bd", dept: "Operation", secondaryDepts: ["Events", "BAT Project Events"], priority: 3, level: "Manager", role: "manager", company: "IMS", scopes: ["IMS"], supervisorEmpId: "1026", notes: "Approver 1026" },
  { empId: "1120", name: "Hasan Imam Ovi", email: "ovi@ims.com.bd", dept: "SCL Accounts", priority: 3, level: "Manager", role: "manager", company: "SCL", scopes: ["SCL", "IMS"], supervisorEmpId: "1050", notes: "Accounts Manager (1050)" },
];

async function main() {
  const roles: Record<string, string> = {};
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { key: r.key },
      update: {
        name: r.name,
        isManager: r.isManager,
        permissions: r.permissions,
        description: r.description,
      },
      create: r,
    });
    roles[r.key] = row.id;
  }

  const co: Record<string, string> = {};
  for (const c of COMPANIES) {
    const row = await prisma.company.upsert({
      where: { code: c.code },
      update: c,
      create: c,
    });
    co[c.code] = row.id;
  }

  const dept: Record<string, string> = {};
  for (const name of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name, companyId: null } });
    const row = existing ?? (await prisma.department.create({ data: { name } }));
    dept[name] = row.id;
  }

  // Upsert all 54 employees with password = email
  const userByEmpId: Record<string, string> = {};
  const userByEmail: Record<string, string> = {};

  for (const x of EXCEL_USERS) {
    const cleanEmail = x.email.toLowerCase().trim();
    const emailPwHash = await bcrypt.hash(cleanEmail, 10);
    const designation =
      x.empId === "1001"
        ? "Sr. Manager, Information & Transformation"
        : `${x.level}, ${x.dept}`;

    const data = {
      employeeId: x.empId,
      name: x.name,
      designation,
      priorityLevel: x.priority,
      levelLabel: x.level,
      secondaryDepartments: x.secondaryDepts ?? [],
      approvalNotes: x.notes ?? null,
      roleId: roles[x.role],
      companyId: x.company ? co[x.company] : null,
      departmentId: dept[x.dept],
      directorCategories: x.dirCats ?? [],
      companyScopes: { set: x.scopes.map((c) => ({ id: co[c] })) },
    };

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    let row;
    if (!existingUser) {
      row = await prisma.user.create({
        data: {
          ...data,
          email: cleanEmail,
          passwordHash: emailPwHash,
          companyScopes: { connect: x.scopes.map((c) => ({ id: co[c] })) },
        },
      });
    } else if (!existingUser.employeeId) {
      row = await prisma.user.update({
        where: { email: cleanEmail },
        data: { ...data, passwordHash: emailPwHash },
      });
    } else if (x.company === null && existingUser.companyId !== null) {
      // One-time migration: ensure IMS GROUP officers have companyId: null ("IMS GROUP") and all 4 sister-concern scopes
      row = await prisma.user.update({
        where: { email: cleanEmail },
        data: {
          designation: x.empId === "1001" ? "Sr. Manager, Information & Transformation" : existingUser.designation,
          companyId: null,
          secondaryDepartments: x.secondaryDepts ?? existingUser.secondaryDepartments,
          approvalNotes: x.notes ?? existingUser.approvalNotes,
          directorCategories: x.dirCats ?? existingUser.directorCategories,
          companyScopes: { set: x.scopes.map((c) => ({ id: co[c] })) },
        },
      });
    } else {
      row = existingUser;
    }

    userByEmpId[x.empId] = row.id;
    userByEmail[cleanEmail] = row.id;
  }

  // Second pass: link supervisorId by employeeId if not already set
  for (const x of EXCEL_USERS) {
    if (x.supervisorEmpId && userByEmpId[x.supervisorEmpId]) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userByEmpId[x.empId] },
        select: { supervisorId: true },
      });
      if (!targetUser?.supervisorId) {
        await prisma.user.update({
          where: { id: userByEmpId[x.empId] },
          data: { supervisorId: userByEmpId[x.supervisorEmpId] },
        });
      }
    }
  }

  // Department heads
  const deptHeadsByEmpId: Record<string, string> = {
    IT: "1001",
    CLAN: "1016",
    "Business Development": "1004",
    "Business Development Blue team": "1018",
    "Business Development Red team": "1005",
    Studio: "1009",
    Office: "1014",
    HR: "1014",
    "IMS GROUP": "1025",
    "Operations Projects": "1026",
    Operation: "1092",
    Accounts: "1050",
    Outsourcing: "1070",
    "Project Singer": "1070",
    "Project Robi": "1070",
    "Project BAT CE": "1070",
    "Project GP": "1070",
    "Project Unilever": "1070",
    "Project Unilever Pureit": "1070",
    "Project UPY": "1070",
    "SCL Accounts": "1050",
  };

  for (const [dName, empId] of Object.entries(deptHeadsByEmpId)) {
    if (dept[dName] && userByEmpId[empId]) {
      await prisma.department.update({
        where: { id: dept[dName] },
        data: { headId: userByEmpId[empId] },
      });
    }
  }

  // Named Projects & Events
  type SeedProject = {
    code: string;
    name: string;
    company: "IMS" | "CLAN" | "SCL" | "TP";
    kind?: "PERMANENT" | "EVENT";
    category: string;
    headEmpId?: string;
    checkerEmpId?: string;
    directorEmpId?: string;
    md?: string;
    types?: string[];
    memberEmpIds: string[];
  };

  const PROJECTS: SeedProject[] = [
    // Named Projects (Robi, UPY, GP, Singer, BAT CE, Unilever, Unilever Pureit, Modern Trade, BeHereNow)
    {
      code: "PROJ-ROBI",
      name: "Project Robi",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1074", "1070", "1071", "1072"],
    },
    {
      code: "PROJ-UPY",
      name: "Project UPY (Upay)",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1070", "1071", "1072"],
    },
    {
      code: "PROJ-GP",
      name: "Project GP (Grameenphone)",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1077", "1080", "1070", "1071", "1072"],
    },
    {
      code: "PROJ-SINGER",
      name: "Project Singer",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1073", "1070", "1071", "1072"],
    },
    {
      code: "PROJ-BAT-CE",
      name: "Project BAT CE",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1075", "1076", "1070", "1071", "1072"],
    },
    {
      code: "PROJ-UNILEVER",
      name: "Project Unilever",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1078", "1070", "1071", "1072"],
    },
    {
      code: "PROJ-PUREIT",
      name: "Project Unilever Pureit",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      md: "MONTHLY",
      memberEmpIds: ["1079", "1070", "1071", "1072"],
    },
    {
      code: "PROJ-MT",
      name: "Modern Trade (MT)",
      company: "IMS",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      memberEmpIds: ["1070", "1071", "1072"],
    },
    {
      code: "PROJ-BHN",
      name: "BeHereNow (BHN)",
      company: "IMS",
      category: "OPERATIONS_EVENT",
      headEmpId: "1092",
      directorEmpId: "1026",
      memberEmpIds: ["1092", "1093", "1094", "1026"],
    },
    // Events (Banglalink, GP, Bkash, BAT, Events General)
    {
      code: "EVT-BL",
      name: "Event — Banglalink",
      company: "IMS",
      kind: "EVENT",
      category: "OPERATIONS_EVENT",
      headEmpId: "1092",
      directorEmpId: "1026",
      types: ["EVENT", "BPO", "CASH"],
      memberEmpIds: ["1090", "1091", "1092", "1093", "1094", "1095", "1026"],
    },
    {
      code: "EVT-GP",
      name: "Event — GP (GP Project Events)",
      company: "IMS",
      kind: "EVENT",
      category: "OPERATIONS_EVENT",
      headEmpId: "1092",
      directorEmpId: "1026",
      types: ["EVENT", "BPO", "CASH"],
      memberEmpIds: ["1096", "1090", "1091", "1092", "1093", "1094", "1095", "1026"],
    },
    {
      code: "EVT-BKASH",
      name: "Event — Bkash",
      company: "IMS",
      kind: "EVENT",
      category: "OPERATIONS_EVENT",
      headEmpId: "1093",
      directorEmpId: "1026",
      types: ["EVENT", "BPO", "CASH"],
      memberEmpIds: ["1090", "1091", "1092", "1093", "1094", "1095", "1026"],
    },
    {
      code: "EVT-BAT",
      name: "Event — BAT (BAT Project Events)",
      company: "IMS",
      kind: "EVENT",
      category: "OPERATIONS_EVENT",
      headEmpId: "1097",
      directorEmpId: "1026",
      types: ["EVENT", "BPO", "CASH"],
      memberEmpIds: ["1097", "1090", "1091", "1092", "1093", "1094", "1095", "1026"],
    },
    {
      code: "EVT-GEN",
      name: "Events — General & Activations",
      company: "IMS",
      kind: "EVENT",
      category: "OPERATIONS_EVENT",
      headEmpId: "1092",
      directorEmpId: "1026",
      types: ["EVENT", "BPO", "CASH"],
      memberEmpIds: ["1090", "1091", "1092", "1093", "1094", "1095", "1096", "1097", "1070", "1071", "1026"],
    },
    // Divisions & Sister Concerns (IMS Studio, BD Blue/Red, Office, IT, CLAN, TradePULSE, SCL)
    {
      code: "IMS-STUDIO",
      name: "Studio Project Base",
      company: "IMS",
      category: "STUDIO",
      headEmpId: "1009",
      checkerEmpId: "1007",
      directorEmpId: "1005",
      types: ["STUDIO", "BPO", "CASH"],
      memberEmpIds: ["1007", "1008", "1009", "1010", "1028", "1031", "1034", "1035", "1005"],
    },
    {
      code: "IMS-BD-BLUE",
      name: "Business Development (Blue Team)",
      company: "IMS",
      category: "BUSINESS_DEVELOPMENT",
      headEmpId: "1018",
      directorEmpId: "1004",
      memberEmpIds: ["1018", "1020", "1021", "1036", "1037", "1004"],
    },
    {
      code: "IMS-BD-RED",
      name: "Business Development (Red Team)",
      company: "IMS",
      category: "BUSINESS_DEVELOPMENT",
      headEmpId: "1019",
      directorEmpId: "1005",
      memberEmpIds: ["1019", "1022", "1024", "1005"],
    },
    {
      code: "IMS-HO",
      name: "IMS Head Office & General",
      company: "IMS",
      category: "GENERAL",
      headEmpId: "1014",
      directorEmpId: "1004",
      types: ["ADMIN", "CASH", "BPO"],
      memberEmpIds: ["1011", "1014", "1027", "1033", "1050", "1051", "1052", "1001"],
    },
    {
      code: "IMS-IT",
      name: "AI & IT Transformation",
      company: "IMS",
      category: "AI_IT",
      headEmpId: "1001",
      directorEmpId: "1004",
      types: ["IT", "ADMIN", "CASH"],
      memberEmpIds: ["1001"],
    },
    {
      code: "CLAN-MAIN",
      name: "CLAN — Country's Largest Audience Network",
      company: "CLAN",
      category: "OPERATIONS_EVENT",
      headEmpId: "1016",
      checkerEmpId: "1006",
      directorEmpId: "1004",
      types: ["BPO", "ADMIN", "CASH"],
      memberEmpIds: ["1002", "1006", "1012", "1016", "1030", "1004"],
    },
    {
      code: "TP-OPS",
      name: "TradePULSE Operations & Projects",
      company: "TP",
      category: "OUTSOURCING",
      headEmpId: "1070",
      checkerEmpId: "1071",
      directorEmpId: "1004",
      types: ["BPO", "ADMIN", "CASH"],
      memberEmpIds: ["1070", "1071", "1072", "1004"],
    },
    {
      code: "SCL-MAIN",
      name: "SCL — Sales Connect Limited",
      company: "SCL",
      category: "BUSINESS_DEVELOPMENT",
      headEmpId: "1120",
      directorEmpId: "1004",
      types: ["BPO", "ADMIN", "CASH"],
      memberEmpIds: ["1120", "1050", "1004"],
    },
  ];

  // Check AuditLog for any projects deleted or archived by admins so seed NEVER re-creates them
  const projectAuditLogs = await prisma.auditLog.findMany({
    where: { action: { in: ["PROJECT_DELETED", "PROJECT_ARCHIVED", "PROJECT_CREATED"] } },
    orderBy: { createdAt: "asc" },
  });

  const deletedProjectCodes = new Set<string>();
  for (const log of projectAuditLogs) {
    const match = log.details?.match(/\(([^()]+)\)\s+(?:deleted|archived|created)/i);
    if (match && match[1]) {
      const code = match[1].trim().toUpperCase();
      if (log.action === "PROJECT_DELETED" || log.action === "PROJECT_ARCHIVED") {
        deletedProjectCodes.add(code);
      } else if (log.action === "PROJECT_CREATED") {
        deletedProjectCodes.delete(code);
      }
    }
  }

  // If a previous seed run accidentally re-created a project that the admin had deleted, remove it now
  if (deletedProjectCodes.size > 0) {
    const toRemove = await prisma.project.findMany({
      where: { code: { in: Array.from(deletedProjectCodes) } },
    });
    for (const proj of toRemove) {
      const reqCount = await prisma.requisition.count({ where: { projectId: proj.id } });
      if (reqCount === 0) {
        await prisma.project.update({ where: { id: proj.id }, data: { members: { set: [] } } });
        await prisma.project.delete({ where: { id: proj.id } });
      }
    }
  }

  for (const p of PROJECTS) {
    if (deletedProjectCodes.has(p.code.toUpperCase())) {
      continue;
    }

    const memberIds = p.memberEmpIds
      .map((eid) => userByEmpId[eid])
      .filter(Boolean);

    const existingProj = await prisma.project.findUnique({ where: { code: p.code } });
    if (!existingProj) {
      await prisma.project.create({
        data: {
          code: p.code,
          name: p.name,
          companyId: co[p.company],
          kind: p.kind ?? "PERMANENT",
          category: p.category,
          headId: p.headEmpId ? userByEmpId[p.headEmpId] : null,
          checkerId: p.checkerEmpId ? userByEmpId[p.checkerEmpId] : null,
          directorId: p.directorEmpId ? userByEmpId[p.directorEmpId] : null,
          mdApprovalMode: p.md ?? "INSTANT",
          requisitionTypes: p.types ?? ["BPO", "ADMIN", "CASH"],
          members: { connect: memberIds.map((id) => ({ id })) },
        },
      });
    } else if (existingProj.category === "IMS_OUTSOURCING_STUDIO") {
      // One-time migration for legacy combined category only; never overwrite user-configured workflow heads/checkers
      await prisma.project.update({
        where: { code: p.code },
        data: {
          category: p.category,
        },
      });
    }
  }

  // Deactivate legacy placeholder demo emails if they exist from initial seed
  const legacyPlaceholderEmails = [
    "abir@ims.com.bd",
    "iftekhar@ims.com.bd",
    "md@ims.com.bd",
    "ims.manager@ims.com.bd",
    "outsourcing.manager@ims.com.bd",
    "sr.outsourcing@ims.com.bd",
    "clan.manager@clan.com.bd",
    "scl.manager@scl.net.bd",
    "ims.exec@ims.com.bd",
    "clan.exec@clan.com.bd",
    "tp.exec@tradepulsebd.com",
    "project.exec@ims.com.bd",
  ];
  await prisma.user.updateMany({
    where: { email: { in: legacyPlaceholderEmails } },
    data: { active: false },
  });

  console.log(
    `Seeded ${ROLES.length} roles, ${COMPANIES.length} companies, ${DEPARTMENTS.length} departments, ${EXCEL_USERS.length} employees, ${PROJECTS.length} projects & events.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

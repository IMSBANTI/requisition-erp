import { prisma } from "@/lib/db";
import BlankPrintClient from "./BlankPrintClient";

interface Props {
  searchParams: Promise<{ company?: string; type?: string }>;
}

export default async function BlankFormPage({ searchParams }: Props) {
  const { company, type } = await searchParams;

  const companies = await prisma.company.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const selectedCode = company || "IMS";
  const selectedCompany = companies.find((c) => c.code === selectedCode) || companies[0];

  return (
    <BlankPrintClient
      companies={companies}
      selectedCompany={selectedCompany}
      initialType={type || (selectedCompany.code === "CLAN" ? "ADMIN" : "BPO")}
    />
  );
}

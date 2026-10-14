import { prisma } from "./db";

/**
 * Generates an auto-incrementing serial number per company, type, and month.
 * Format: [COMPANY]-[TYPE]-[YYYY]-[MM]-[0001]
 * e.g. IMS-BPO-2026-10-0001
 */
export async function generateRequisitionNumber(companyCode: string, typeTag: string, date: Date = new Date()): Promise<string> {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const cleanType = (typeTag || "GEN").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cleanCo = (companyCode || "IMS").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const key = `${cleanCo}-${cleanType}-${yyyy}-${mm}`;

  const counter = await prisma.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });

  const serial = String(counter.value).padStart(4, "0");
  return `${cleanCo}-${cleanType}-${yyyy}-${mm}-${serial}`;
}

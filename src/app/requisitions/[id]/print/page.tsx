import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import PrintVoucherClient from "./PrintVoucherClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequisitionPrintPage({ params }: Props) {
  const { id } = await params;

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: {
      company: true,
      project: true,
      items: { orderBy: { sl: "asc" } },
      approvals: true,
    },
  });

  if (!req) return notFound();

  // Generate QR Code for online verification
  const verifyUrl = `${process.env.APP_URL || "https://imserp.onrender.com"}/verify/${req.number || req.id}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 70 });

  return (
    <PrintVoucherClient
      req={{
        id: req.id,
        number: req.number,
        date: req.date.toISOString(),
        makerName: req.makerName,
        makerDesignation: req.makerDesignation,
        disburseOn: req.disburseOn ? req.disburseOn.toISOString() : null,
        total: req.total.toString(),
        amountInWords: req.amountInWords,
        comments: req.comments,
        type: req.type,
        company: {
          name: req.company.name,
          legalName: req.company.legalName,
          address: req.company.address,
          phone: req.company.phone,
          email: req.company.email,
          website: req.company.website,
          logo: req.company.logo,
        },
        project: {
          name: req.project.name,
        },
        items: req.items.map((it) => ({
          id: it.id,
          sl: it.sl,
          particulars: it.particulars,
          purpose: it.purpose,
          qty: it.qty.toString(),
          unitPrice: it.unitPrice.toString(),
          amount: it.amount.toString(),
        })),
        approvals: req.approvals.map((a) => ({
          step: a.step,
          action: a.action,
          signerName: a.signerName,
          signature: a.signature,
          createdAt: a.createdAt.toISOString(),
        })),
      }}
      qrDataUrl={qrDataUrl}
    />
  );
}

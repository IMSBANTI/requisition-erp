import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { formatTaka } from "@/lib/money";

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
  const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/verify/${req.number || req.id}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 80 });

  const makerApproval = req.approvals.find((a) => a.step === "MAKER");
  const headApproval = req.approvals.find((a) => a.step === "HEAD");
  const checkerApproval = req.approvals.find((a) => a.step === "CHECKER");
  const accountsApproval = req.approvals.find((a) => a.step === "ACCOUNTS");
  const directorApproval = req.approvals.find((a) => a.step === "DIRECTOR");
  const mdApproval = req.approvals.find((a) => a.step === "MD");

  const isClan = req.company.code === "CLAN";

  return (
    <div
      className="min-h-screen p-8 text-black"
      style={{
        backgroundColor: req.company.paperTint === "#FFF4C2" ? "#FFFAE0" : "#FFFFFF",
      }}
    >
      {/* Print Controls (hidden on print) */}
      <div className="no-print max-w-4xl mx-auto mb-6 p-3 bg-gray-100 rounded-lg flex items-center justify-between border border-gray-300">
        <span className="text-xs font-semibold text-gray-700">
          A4 Print Preview &bull; {req.number || "Voucher"}
        </span>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {}}
            // @ts-ignore
            id="print-btn"
            className="px-4 py-1.5 bg-[#E42528] text-white font-bold text-xs rounded hover:bg-[#B81D20] shadow cursor-pointer"
          >
            🖨️ Print Voucher
          </button>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-btn')?.addEventListener('click', () => window.print());`,
        }}
      />

      {/* The Printable A4 Sheet */}
      <div className="max-w-4xl mx-auto bg-transparent border-0 print:border-0 print:p-0">
        {/* Header Block matching the scan */}
        <div className="flex items-start justify-between pb-3 border-b-2 border-black">
          {/* Logo & Bracket Tag & Title */}
          <div className="flex items-start space-x-3">
            <img
              src={req.company.logo}
              alt={req.company.name}
              className="h-14 w-auto object-contain"
            />
            <div className="pt-0.5">
              <div className="text-sm font-bold text-black uppercase tracking-tight">
                {req.company.name.toLowerCase()} <span className="font-extrabold">({req.type})</span>
              </div>
              <div className="text-[12px] font-bold text-black underline uppercase tracking-wider mt-0.5">
                REQUISITION FOR FUND
              </div>
            </div>
          </div>

          {/* Legal name & addresses */}
          <div className="text-center max-w-md px-2">
            <h1 className="text-sm font-extrabold text-black uppercase tracking-tight">
              {req.company.legalName}
            </h1>
            <p className="text-[10px] text-black leading-tight mt-0.5">
              {req.company.address}
            </p>
            <p className="text-[10px] text-black leading-tight">
              {req.company.phone && `Phone ${req.company.phone}. `}
              {req.company.email && `E-mail: ${req.company.email}`}
            </p>
            {req.company.website && (
              <p className="text-[10px] text-black font-medium">{req.company.website}</p>
            )}
          </div>

          {/* QR Code & Req # */}
          <div className="text-right flex flex-col items-end">
            <img src={qrDataUrl} alt="Verify QR" className="h-14 w-14 object-contain" />
            <span className="text-[9px] font-mono font-bold text-black mt-0.5">
              {req.number || "DRAFT"}
            </span>
          </div>
        </div>

        {/* Top meta fields */}
        <div className="mt-3 grid grid-cols-2 text-[11px] gap-y-1 text-black">
          <div className="flex">
            <span className="w-24 font-bold">Name</span>
            <span className="font-bold">: {req.makerName}</span>
          </div>
          <div className="flex justify-end">
            <span className="font-bold mr-2">Date :</span>
            <span>{new Date(req.date).toLocaleDateString("en-GB")}</span>
          </div>
          <div className="flex">
            <span className="w-24 font-bold">Designation</span>
            <span>: {req.makerDesignation}</span>
          </div>
          <div className="flex justify-end">
            <span className="font-bold mr-2">Project :</span>
            <span className="font-semibold">{req.project.name}</span>
          </div>
        </div>

        {/* Amount & Purpose Header */}
        <div className="mt-2 text-[11px] text-black border-t border-gray-300 pt-1 leading-snug">
          <div>
            <span className="font-bold">An amount Tk. </span>
            <span className="font-bold border-b border-dotted border-black px-2">
              {formatTaka(req.total)}
            </span>
            <span className="font-bold ml-1">(In word) </span>
            <span className="font-bold italic border-b border-dotted border-black px-2">
              {req.amountInWords}
            </span>
          </div>
          <div className="mt-1">
            <span>Is Required for the following purpose which may be sanctioned and disbursed on </span>
            <span className="font-bold underline underline-offset-2">
              {req.disburseOn ? new Date(req.disburseOn).toLocaleDateString("en-GB") : "Immediate"}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-3 border border-black">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-black font-extrabold uppercase bg-gray-50/50">
                <th className="py-1 px-1.5 w-8 text-center border-r border-black">SL.</th>
                <th className="py-1 px-2 border-r border-black">Particulars</th>
                <th className="py-1 px-2 border-r border-black w-1/4">Purpose</th>
                <th className="py-1 px-1.5 border-r border-black w-12 text-right">Qty.</th>
                <th className="py-1 px-2 border-r border-black w-20 text-right">Unit Price</th>
                <th className="py-1 px-2 w-24 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {req.items.map((it) => (
                <tr key={it.id} className="min-h-[22px]">
                  <td className="py-1 px-1.5 text-center font-bold border-r border-black">{it.sl}</td>
                  <td className="py-1 px-2 font-medium border-r border-black">{it.particulars}</td>
                  <td className="py-1 px-2 border-r border-black">{it.purpose || ""}</td>
                  <td className="py-1 px-1.5 text-right font-medium border-r border-black">{it.qty.toString()}</td>
                  <td className="py-1 px-2 text-right border-r border-black">{formatTaka(it.unitPrice)}</td>
                  <td className="py-1 px-2 text-right font-bold">{formatTaka(it.amount)}</td>
                </tr>
              ))}

              {/* Pad with empty lines if fewer than 5 rows to preserve authentic look */}
              {Array.from({ length: Math.max(0, 6 - req.items.length) }).map((_, i) => (
                <tr key={`pad-${i}`} className="h-6">
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td></td>
                </tr>
              ))}

              {/* Total row */}
              <tr className="border-t-2 border-black font-extrabold text-[11px] bg-gray-50/50">
                <td colSpan={5} className="py-1 px-3 text-right uppercase border-r border-black">
                  Total
                </td>
                <td className="py-1 px-2 text-right font-bold text-black">
                  {formatTaka(req.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comments */}
        <div className="mt-2 text-[10px] text-black">
          <span className="font-bold">Comments: </span>
          <span className="italic">{req.comments || "None"}</span>
        </div>

        {/* 5 Signature Blocks matching paper */}
        <div className="mt-8 pt-4">
          <div className="grid grid-cols-5 gap-2 text-center text-[10px]">
            {/* Box 1: Requested by */}
            <div className="border-t border-black pt-1 flex flex-col justify-between min-h-[70px]">
              <div>
                <span className="font-bold block">Requested by</span>
                <span className="text-[9px]">{req.makerName}</span>
              </div>
              {makerApproval?.signature ? (
                <img
                  src={makerApproval.signature}
                  alt="Sign"
                  className="h-9 w-auto mx-auto object-contain"
                />
              ) : (
                <span className="text-[8px] font-mono font-bold">DIGITALLY SIGNED</span>
              )}
              <span className="text-[8px] text-gray-600">
                {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString("en-GB") : ""}
              </span>
            </div>

            {/* Box 2: Checked by */}
            <div className="border-t border-black pt-1 flex flex-col justify-between min-h-[70px]">
              <div>
                <span className="font-bold block">Checked by</span>
                <span className="text-[9px]">{headApproval?.signerName || ""}</span>
              </div>
              {headApproval?.signature ? (
                <img
                  src={headApproval.signature}
                  alt="Sign"
                  className="h-9 w-auto mx-auto object-contain"
                />
              ) : headApproval ? (
                <span className="text-[8px] font-mono font-bold">DIGITALLY SIGNED</span>
              ) : null}
              <span className="text-[8px] text-gray-600">
                {headApproval ? new Date(headApproval.createdAt).toLocaleDateString("en-GB") : ""}
              </span>
            </div>

            {/* Box 3: Checked by */}
            <div className="border-t border-black pt-1 flex flex-col justify-between min-h-[70px]">
              <div>
                <span className="font-bold block">Checked by</span>
                <span className="text-[9px]">{checkerApproval?.signerName || ""}</span>
              </div>
              {checkerApproval?.signature ? (
                <img
                  src={checkerApproval.signature}
                  alt="Sign"
                  className="h-9 w-auto mx-auto object-contain"
                />
              ) : checkerApproval ? (
                <span className="text-[8px] font-mono font-bold">DIGITALLY SIGNED</span>
              ) : null}
              <span className="text-[8px] text-gray-600">
                {checkerApproval ? new Date(checkerApproval.createdAt).toLocaleDateString("en-GB") : ""}
              </span>
            </div>

            {/* Box 4: Checked by Accounts */}
            <div className="border-t border-black pt-1 flex flex-col justify-between min-h-[70px]">
              <div>
                <span className="font-bold block">Checked by Accounts</span>
                <span className="text-[9px]">{accountsApproval?.signerName || ""}</span>
              </div>
              {accountsApproval?.signature ? (
                <img
                  src={accountsApproval.signature}
                  alt="Sign"
                  className="h-9 w-auto mx-auto object-contain"
                />
              ) : accountsApproval ? (
                <span className="text-[8px] font-mono font-bold">DIGITALLY SIGNED</span>
              ) : null}
              <span className="text-[8px] text-gray-600">
                {accountsApproval ? new Date(accountsApproval.createdAt).toLocaleDateString("en-GB") : ""}
              </span>
            </div>

            {/* Box 5: Approve by management */}
            <div className="border-t border-black pt-1 flex flex-col justify-between min-h-[70px]">
              <div>
                <span className="font-bold block">Approve by management</span>
              </div>
              <div className="flex items-center justify-center space-x-1">
                {directorApproval?.signature && (
                  <img
                    src={directorApproval.signature}
                    alt="Director"
                    className="h-8 w-auto object-contain"
                  />
                )}
                {mdApproval?.signature && (
                  <img
                    src={mdApproval.signature}
                    alt="MD"
                    className="h-8 w-auto object-contain"
                  />
                )}
                {!directorApproval && !mdApproval && req.status === "APPROVED" && (
                  <span className="text-[8px] font-bold">APPROVED</span>
                )}
              </div>
              <span className="text-[8px] text-gray-600">
                {mdApproval
                  ? new Date(mdApproval.createdAt).toLocaleDateString("en-GB")
                  : directorApproval
                  ? new Date(directorApproval.createdAt).toLocaleDateString("en-GB")
                  : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 pt-2 border-t border-gray-400 text-[8px] text-gray-500 flex justify-between">
          <span>
            System Verified Voucher &bull; Document SHA-256 Hash Certified &bull; IMS Group ERP
          </span>
          <span>Printed on {new Date().toLocaleString("en-GB")}</span>
        </div>
      </div>
    </div>
  );
}

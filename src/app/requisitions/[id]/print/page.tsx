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
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 60 });

  const makerApproval = req.approvals.find((a) => a.step === "MAKER");
  const headApproval = req.approvals.find((a) => a.step === "HEAD");
  const checkerApproval = req.approvals.find((a) => a.step === "CHECKER");
  const accountsApproval = req.approvals.find((a) => a.step === "ACCOUNTS");
  const directorApproval = req.approvals.find((a) => a.step === "DIRECTOR");
  const mdApproval = req.approvals.find((a) => a.step === "MD");

  const VoucherComponent = () => (
    <div className="half-a4-voucher bg-white text-black border border-black p-3 rounded-none mx-auto box-border text-[9px] leading-tight">
      {/* Header Block matching the scan */}
      <div className="flex items-start justify-between pb-1.5 border-b border-black">
        {/* Logo & Tag & Title */}
        <div className="flex items-start space-x-2">
          <img
            src={req.company.logo}
            alt={req.company.name}
            className="h-10 w-auto object-contain filter grayscale contrast-200"
          />
          <div className="pt-0.5">
            <div className="text-xs font-bold text-black uppercase tracking-tight">
              {req.company.name.toLowerCase()} <span className="font-extrabold">({req.type})</span>
            </div>
            <div className="text-[10px] font-bold text-black underline uppercase tracking-wider">
              REQUISITION FOR FUND
            </div>
          </div>
        </div>

        {/* Legal name & addresses */}
        <div className="text-center max-w-sm px-2">
          <h1 className="text-[11px] font-extrabold text-black uppercase tracking-tight">
            {req.company.legalName}
          </h1>
          <p className="text-[8px] text-black leading-none mt-0.5">
            {req.company.address}
          </p>
          <p className="text-[8px] text-black leading-none mt-0.5">
            {req.company.phone && `Phone: ${req.company.phone}. `}
            {req.company.email && `Email: ${req.company.email}`}
          </p>
          {req.company.website && (
            <p className="text-[8px] text-black font-medium leading-none">{req.company.website}</p>
          )}
        </div>

        {/* QR Code & Req # */}
        <div className="text-right flex flex-col items-end">
          <img src={qrDataUrl} alt="Verify QR" className="h-10 w-10 object-contain filter grayscale contrast-200" />
          <span className="text-[8px] font-mono font-bold text-black mt-0.5">
            {req.number || "DRAFT"}
          </span>
        </div>
      </div>

      {/* Top meta fields */}
      <div className="mt-1.5 grid grid-cols-2 text-[9px] gap-y-0.5 text-black">
        <div className="flex">
          <span className="w-20 font-bold">Name</span>
          <span className="font-bold">: {req.makerName}</span>
        </div>
        <div className="flex justify-end">
          <span className="font-bold mr-1.5">Date :</span>
          <span>{new Date(req.date).toLocaleDateString("en-GB")}</span>
        </div>
        <div className="flex">
          <span className="w-20 font-bold">Designation</span>
          <span>: {req.makerDesignation}</span>
        </div>
        <div className="flex justify-end">
          <span className="font-bold mr-1.5">Project :</span>
          <span className="font-semibold truncate max-w-[150px]">{req.project.name}</span>
        </div>
      </div>

      {/* Amount & Purpose Header */}
      <div className="mt-1 text-[9px] text-black border-t border-black pt-1 leading-snug">
        <div className="flex items-baseline">
          <span className="font-bold whitespace-nowrap">An amount Tk. </span>
          <span className="font-bold border-b border-black px-1.5 mx-1">
            {formatTaka(req.total)}
          </span>
          <span className="font-bold whitespace-nowrap ml-1">(In word) : </span>
          <span className="font-bold italic border-b border-black px-1.5 ml-1 truncate">
            {req.amountInWords}
          </span>
        </div>
        <div className="mt-0.5">
          <span>Is Required for the following purpose which may be sanctioned and disbursed on </span>
          <span className="font-bold underline">
            {req.disburseOn ? new Date(req.disburseOn).toLocaleDateString("en-GB") : "Immediate"}
          </span>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mt-1.5 border border-black">
        <table className="w-full text-left text-[8.5px] border-collapse">
          <thead>
            <tr className="border-b border-black font-extrabold uppercase">
              <th className="py-0.5 px-1 w-6 text-center border-r border-black">SL.</th>
              <th className="py-0.5 px-1.5 border-r border-black">Particulars</th>
              <th className="py-0.5 px-1.5 border-r border-black w-1/4">Purpose</th>
              <th className="py-0.5 px-1 border-r border-black w-10 text-right">Qty.</th>
              <th className="py-0.5 px-1.5 border-r border-black w-16 text-right">Unit Price</th>
              <th className="py-0.5 px-1.5 w-20 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black">
            {req.items.map((it) => (
              <tr key={it.id} className="min-h-[16px]">
                <td className="py-0.5 px-1 text-center font-bold border-r border-black">{it.sl}</td>
                <td className="py-0.5 px-1.5 font-medium border-r border-black">{it.particulars}</td>
                <td className="py-0.5 px-1.5 border-r border-black">{it.purpose || ""}</td>
                <td className="py-0.5 px-1 text-right font-medium border-r border-black">{it.qty.toString()}</td>
                <td className="py-0.5 px-1.5 text-right border-r border-black">{formatTaka(it.unitPrice)}</td>
                <td className="py-0.5 px-1.5 text-right font-bold">{formatTaka(it.amount)}</td>
              </tr>
            ))}

            {/* Pad to 3-4 rows if few items */}
            {Array.from({ length: Math.max(0, 3 - req.items.length) }).map((_, i) => (
              <tr key={`pad-${i}`} className="h-4">
                <td className="border-r border-black"></td>
                <td className="border-r border-black"></td>
                <td className="border-r border-black"></td>
                <td className="border-r border-black"></td>
                <td className="border-r border-black"></td>
                <td></td>
              </tr>
            ))}

            {/* Total row */}
            <tr className="border-t border-black font-extrabold text-[9px]">
              <td colSpan={5} className="py-0.5 px-2 text-right uppercase border-r border-black">
                Total
              </td>
              <td className="py-0.5 px-1.5 text-right font-bold text-black">
                {formatTaka(req.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Comments */}
      <div className="mt-1 text-[8.5px] text-black">
        <span className="font-bold">Comments: </span>
        <span className="italic">{req.comments || "None"}</span>
      </div>

      {/* 5 Signature Blocks matching paper */}
      <div className="mt-2 pt-2 border-t border-black">
        <div className="grid grid-cols-5 gap-1.5 text-center text-[8.5px]">
          {/* Box 1: Requested by */}
          <div className="border-t border-black pt-0.5 flex flex-col justify-between min-h-[44px]">
            <div>
              <span className="font-bold block">Requested by</span>
              <span className="text-[7.5px] truncate">{req.makerName}</span>
            </div>
            {makerApproval?.signature ? (
              <img
                src={makerApproval.signature}
                alt="Sign"
                className="h-6 w-auto mx-auto object-contain filter grayscale contrast-200"
              />
            ) : (
              <span className="text-[7px] font-mono font-bold">DIGITALLY SIGNED</span>
            )}
            <span className="text-[7px] text-black">
              {req.submittedAt ? new Date(req.submittedAt).toLocaleDateString("en-GB") : ""}
            </span>
          </div>

          {/* Box 2: Checked by */}
          <div className="border-t border-black pt-0.5 flex flex-col justify-between min-h-[44px]">
            <div>
              <span className="font-bold block">Checked by</span>
              <span className="text-[7.5px] truncate">{headApproval?.signerName || "Head"}</span>
            </div>
            {headApproval?.signature ? (
              <img
                src={headApproval.signature}
                alt="Sign"
                className="h-6 w-auto mx-auto object-contain filter grayscale contrast-200"
              />
            ) : headApproval ? (
              <span className="text-[7px] font-mono font-bold">DIGITALLY SIGNED</span>
            ) : null}
            <span className="text-[7px] text-black">
              {headApproval ? new Date(headApproval.createdAt).toLocaleDateString("en-GB") : ""}
            </span>
          </div>

          {/* Box 3: Checked by */}
          <div className="border-t border-black pt-0.5 flex flex-col justify-between min-h-[44px]">
            <div>
              <span className="font-bold block">Checked by</span>
              <span className="text-[7.5px] truncate">{checkerApproval?.signerName || "Checker"}</span>
            </div>
            {checkerApproval?.signature ? (
              <img
                src={checkerApproval.signature}
                alt="Sign"
                className="h-6 w-auto mx-auto object-contain filter grayscale contrast-200"
              />
            ) : checkerApproval ? (
              <span className="text-[7px] font-mono font-bold">DIGITALLY SIGNED</span>
            ) : null}
            <span className="text-[7px] text-black">
              {checkerApproval ? new Date(checkerApproval.createdAt).toLocaleDateString("en-GB") : ""}
            </span>
          </div>

          {/* Box 4: Checked by Accounts */}
          <div className="border-t border-black pt-0.5 flex flex-col justify-between min-h-[44px]">
            <div>
              <span className="font-bold block">Checked by Accounts</span>
              <span className="text-[7.5px] truncate">{accountsApproval?.signerName || "Accounts"}</span>
            </div>
            {accountsApproval?.signature ? (
              <img
                src={accountsApproval.signature}
                alt="Sign"
                className="h-6 w-auto mx-auto object-contain filter grayscale contrast-200"
              />
            ) : accountsApproval ? (
              <span className="text-[7px] font-mono font-bold">DIGITALLY SIGNED</span>
            ) : null}
            <span className="text-[7px] text-black">
              {accountsApproval ? new Date(accountsApproval.createdAt).toLocaleDateString("en-GB") : ""}
            </span>
          </div>

          {/* Box 5: Approve by management */}
          <div className="border-t border-black pt-0.5 flex flex-col justify-between min-h-[44px]">
            <div>
              <span className="font-bold block">Approve by management</span>
            </div>
            <div className="flex items-center justify-center space-x-1">
              {directorApproval?.signature && (
                <img
                  src={directorApproval.signature}
                  alt="Director"
                  className="h-5 w-auto object-contain filter grayscale contrast-200"
                />
              )}
              {mdApproval?.signature && (
                <img
                  src={mdApproval.signature}
                  alt="MD"
                  className="h-5 w-auto object-contain filter grayscale contrast-200"
                />
              )}
              {!directorApproval && !mdApproval && req.status === "APPROVED" && (
                <span className="text-[7px] font-bold">APPROVED</span>
              )}
            </div>
            <span className="text-[7px] text-black">
              {mdApproval
                ? new Date(mdApproval.createdAt).toLocaleDateString("en-GB")
                : directorApproval
                ? new Date(directorApproval.createdAt).toLocaleDateString("en-GB")
                : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Micro Footer */}
      <div className="mt-1 pt-1 border-t border-black text-[7px] text-black flex justify-between">
        <span>IMS GROUP Official Verified Voucher &bull; SHA-256 Certified</span>
        <span>Printed: {new Date().toLocaleString("en-GB")}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-gray-100 print:bg-white print:p-0 text-black">
      {/* Controls Bar (hidden on print) */}
      <div className="no-print max-w-2xl mx-auto mb-4 p-3 bg-white rounded-lg shadow-sm border border-gray-300 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-gray-800 block">
            Half-Page A4 Voucher &bull; Black & White Mode
          </span>
          <span className="text-[10px] text-gray-500">
            Engineered to fit precisely on 1/2 of an A4 page (A5 size)
          </span>
        </div>
        <button
          onClick={() => {}}
          // @ts-ignore
          id="print-btn"
          className="px-4 py-1.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded shadow cursor-pointer"
        >
          🖨️ Print Voucher
        </button>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-btn')?.addEventListener('click', () => window.print());`,
        }}
      />

      {/* The Voucher Form Container */}
      <div className="max-w-[195mm] mx-auto print:m-0">
        <VoucherComponent />

        {/* Half-A4 Cut Guide (visible in print) */}
        <div className="hidden print:flex items-center justify-center my-3 text-[8px] font-mono text-black border-b border-dashed border-black">
          <span className="bg-white px-2">✂ ------------------- Cut Here (Half of A4 Page) -------------------</span>
        </div>
      </div>
    </div>
  );
}

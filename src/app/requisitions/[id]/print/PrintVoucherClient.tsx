"use client";

import { useState } from "react";
import Link from "next/link";
import { formatTaka } from "@/lib/money";

interface Props {
  req: {
    id: string;
    number: string | null;
    date: string;
    makerName: string;
    makerDesignation: string;
    disburseOn: string | null;
    total: string;
    amountInWords: string;
    comments: string | null;
    type: string;
    company: {
      name: string;
      legalName: string;
      address: string;
      phone: string | null;
      email: string | null;
      website: string | null;
      logo: string;
    };
    project: {
      name: string;
    };
    items: {
      id: string;
      sl: number;
      particulars: string;
      purpose: string | null;
      qty: string;
      unitPrice: string;
      amount: string;
    }[];
    approvals: {
      step: string;
      action: string;
      signerName: string;
      signature: string | null;
      createdAt: string;
    }[];
  };
  qrDataUrl: string;
}

export default function PrintVoucherClient({ req, qrDataUrl }: Props) {
  const [twoPerPage, setTwoPerPage] = useState(true);

  const makerApproval = req.approvals.find((a) => a.step === "MAKER");
  const headApproval = req.approvals.find((a) => a.step === "HEAD");
  const checkerApproval = req.approvals.find((a) => a.step === "CHECKER");
  const accountsApproval = req.approvals.find((a) => a.step === "ACCOUNTS");
  const directorApproval = req.approvals.find((a) => a.step === "DIRECTOR");
  const mdApproval = req.approvals.find((a) => a.step === "MD");

  const VoucherBox = ({ copyLabel }: { copyLabel?: string }) => (
    <div className="half-a4-voucher bg-white text-black border border-black p-3 rounded-none mx-auto box-border text-[10px] leading-tight flex flex-col justify-between">
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between pb-1.5 border-b border-black">
          {/* Logo & Type Tag & Title */}
          <div className="flex items-start space-x-2.5">
            <img
              src={req.company.logo}
              alt={req.company.name}
              className="h-11 w-auto object-contain filter grayscale contrast-200"
            />
            <div className="pt-0.5">
              <div className="text-xs font-bold text-black uppercase tracking-tight">
                {req.company.name.toLowerCase()} <span className="font-extrabold">({req.type})</span>
              </div>
              <div className="text-[11px] font-extrabold text-black underline uppercase tracking-wider mt-0.5">
                REQUISITION FOR FUND
              </div>
            </div>
          </div>

          {/* Legal name & addresses */}
          <div className="text-center max-w-sm px-2">
            <h1 className="text-xs font-black text-black uppercase tracking-tight">
              {req.company.legalName}
            </h1>
            <p className="text-[8.5px] text-black leading-tight mt-0.5">
              {req.company.address}
            </p>
            <p className="text-[8.5px] text-black leading-tight">
              {req.company.phone && `Phone: ${req.company.phone}. `}
              {req.company.email && `Email: ${req.company.email}`}
            </p>
            {req.company.website && (
              <p className="text-[8.5px] text-black font-semibold leading-tight">{req.company.website}</p>
            )}
          </div>

          {/* QR Code & Req # */}
          <div className="text-right flex flex-col items-end">
            <img src={qrDataUrl} alt="Verify QR" className="h-11 w-11 object-contain filter grayscale contrast-200" />
            <span className="text-[9px] font-mono font-bold text-black mt-0.5">
              {req.number || "DRAFT"}
            </span>
            {copyLabel && (
              <span className="text-[8px] font-extrabold uppercase tracking-wider border border-black px-1 rounded-none mt-0.5">
                {copyLabel}
              </span>
            )}
          </div>
        </div>

        {/* Top meta fields */}
        <div className="mt-1.5 grid grid-cols-2 text-[10px] gap-y-0.5 text-black">
          <div className="flex">
            <span className="w-24 font-bold">Name</span>
            <span className="font-bold">: {req.makerName}</span>
          </div>
          <div className="flex justify-end">
            <span className="font-bold mr-1.5">Date :</span>
            <span className="font-semibold">{new Date(req.date).toLocaleDateString("en-GB")}</span>
          </div>
          <div className="flex">
            <span className="w-24 font-bold">Designation</span>
            <span>: {req.makerDesignation}</span>
          </div>
          <div className="flex justify-end">
            <span className="font-bold mr-1.5">Project :</span>
            <span className="font-bold truncate max-w-[170px]">{req.project.name}</span>
          </div>
        </div>

        {/* Amount & Purpose Header */}
        <div className="mt-1 text-[10px] text-black border-t border-black pt-1 leading-snug">
          <div className="flex items-baseline flex-wrap">
            <span className="font-bold whitespace-nowrap">An amount Tk. </span>
            <span className="font-extrabold border-b border-black px-2 mx-1">
              {formatTaka(req.total)}
            </span>
            <span className="font-bold whitespace-nowrap ml-1">(In word) : </span>
            <span className="font-bold italic border-b border-black px-1.5 ml-1 truncate">
              {req.amountInWords}
            </span>
          </div>
          <div className="mt-0.5">
            <span>Is Required for the following purpose which may be sanctioned and disbursed on </span>
            <span className="font-bold underline underline-offset-2">
              {req.disburseOn ? new Date(req.disburseOn).toLocaleDateString("en-GB") : "Immediate"}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-1.5 border border-black">
          <table className="w-full text-left text-[9.5px] border-collapse">
            <thead>
              <tr className="border-b border-black font-extrabold uppercase bg-gray-50/50">
                <th className="py-0.5 px-1.5 w-7 text-center border-r border-black">SL.</th>
                <th className="py-0.5 px-2 border-r border-black">Particulars</th>
                <th className="py-0.5 px-2 border-r border-black w-1/4">Purpose</th>
                <th className="py-0.5 px-1.5 border-r border-black w-12 text-right">Qty.</th>
                <th className="py-0.5 px-2 border-r border-black w-20 text-right">Unit Price</th>
                <th className="py-0.5 px-2 w-24 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {req.items.map((it) => (
                <tr key={it.id} className="h-6">
                  <td className="py-0.5 px-1.5 text-center font-bold border-r border-black">{it.sl}</td>
                  <td className="py-0.5 px-2 font-medium border-r border-black">{it.particulars}</td>
                  <td className="py-0.5 px-2 border-r border-black">{it.purpose || "—"}</td>
                  <td className="py-0.5 px-1.5 text-right font-medium border-r border-black">{it.qty}</td>
                  <td className="py-0.5 px-2 text-right border-r border-black">{formatTaka(it.unitPrice)}</td>
                  <td className="py-0.5 px-2 text-right font-bold">{formatTaka(it.amount)}</td>
                </tr>
              ))}

              {/* Pad with empty lines up to 8 rows to fill vertical space */}
              {Array.from({ length: Math.max(0, 8 - req.items.length) }).map((_, i) => (
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
              <tr className="border-t border-black font-extrabold text-[10px] h-6">
                <td colSpan={5} className="py-0.5 px-3 text-right uppercase border-r border-black">
                  Total
                </td>
                <td className="py-0.5 px-2 text-right font-black text-black">
                  {formatTaka(req.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comments - One single line */}
        <div className="mt-1.5 text-[9.5px] text-black flex items-baseline">
          <span className="font-bold mr-1.5 whitespace-nowrap">Comments:</span>
          <span className="italic flex-1 border-b border-dotted border-black pb-0.5 truncate">
            {req.comments || ""}
          </span>
        </div>
      </div>

      {/* 5 Bottom Signature Blocks with clean signing space */}
      <div>
        <div className="mt-2">
          <div className="grid grid-cols-5 gap-2 text-center text-[9px]">
            {/* Box 1: Requested by */}
            <div className="flex flex-col justify-end">
              <div className="h-12 flex flex-col items-center justify-end pb-1">
                {makerApproval?.signature ? (
                  <img
                    src={makerApproval.signature}
                    alt="Sign"
                    className="h-8 w-auto max-w-full object-contain filter grayscale contrast-200"
                  />
                ) : (
                  <span className="text-[7.5px] font-mono font-bold">DIGITALLY SIGNED</span>
                )}
              </div>
              <div className="border-t border-black pt-1">
                <span className="font-bold block leading-tight text-[9.5px]">Requested by</span>
                <span className="text-[8px] text-black block truncate mt-0.5">{req.makerName}</span>
                <span className="text-[7.5px] text-black block leading-none mt-0.5">
                  {new Date(req.date).toLocaleDateString("en-GB")}
                </span>
              </div>
            </div>

            {/* Box 2: Checked by */}
            <div className="flex flex-col justify-end">
              <div className="h-12 flex flex-col items-center justify-end pb-1">
                {headApproval?.signature ? (
                  <img
                    src={headApproval.signature}
                    alt="Sign"
                    className="h-8 w-auto max-w-full object-contain filter grayscale contrast-200"
                  />
                ) : headApproval ? (
                  <span className="text-[7.5px] font-mono font-bold">DIGITALLY SIGNED</span>
                ) : null}
              </div>
              <div className="border-t border-black pt-1">
                <span className="font-bold block leading-tight text-[9.5px]">Checked by</span>
                <span className="text-[8px] text-black block truncate mt-0.5">{headApproval?.signerName || "Head"}</span>
                <span className="text-[7.5px] text-black block leading-none mt-0.5">
                  {headApproval ? new Date(headApproval.createdAt).toLocaleDateString("en-GB") : ""}
                </span>
              </div>
            </div>

            {/* Box 3: Checked by */}
            <div className="flex flex-col justify-end">
              <div className="h-12 flex flex-col items-center justify-end pb-1">
                {checkerApproval?.signature ? (
                  <img
                    src={checkerApproval.signature}
                    alt="Sign"
                    className="h-8 w-auto max-w-full object-contain filter grayscale contrast-200"
                  />
                ) : checkerApproval ? (
                  <span className="text-[7.5px] font-mono font-bold">DIGITALLY SIGNED</span>
                ) : null}
              </div>
              <div className="border-t border-black pt-1">
                <span className="font-bold block leading-tight text-[9.5px]">Checked by</span>
                <span className="text-[8px] text-black block truncate mt-0.5">{checkerApproval?.signerName || "Checker"}</span>
                <span className="text-[7.5px] text-black block leading-none mt-0.5">
                  {checkerApproval ? new Date(checkerApproval.createdAt).toLocaleDateString("en-GB") : ""}
                </span>
              </div>
            </div>

            {/* Box 4: Checked by Accounts */}
            <div className="flex flex-col justify-end">
              <div className="h-12 flex flex-col items-center justify-end pb-1">
                {accountsApproval?.signature ? (
                  <img
                    src={accountsApproval.signature}
                    alt="Sign"
                    className="h-8 w-auto max-w-full object-contain filter grayscale contrast-200"
                  />
                ) : accountsApproval ? (
                  <span className="text-[7.5px] font-mono font-bold">DIGITALLY SIGNED</span>
                ) : null}
              </div>
              <div className="border-t border-black pt-1">
                <span className="font-bold block leading-tight text-[9.5px]">Checked by Accounts</span>
                <span className="text-[8px] text-black block truncate mt-0.5">{accountsApproval?.signerName || "Accounts"}</span>
                <span className="text-[7.5px] text-black block leading-none mt-0.5">
                  {accountsApproval ? new Date(accountsApproval.createdAt).toLocaleDateString("en-GB") : ""}
                </span>
              </div>
            </div>

            {/* Box 5: Approve by management */}
            <div className="flex flex-col justify-end">
              <div className="h-12 flex items-center justify-center space-x-1 pb-1">
                {directorApproval?.signature && (
                  <img
                    src={directorApproval.signature}
                    alt="Director"
                    className="h-8 w-auto object-contain filter grayscale contrast-200"
                  />
                )}
                {mdApproval?.signature && (
                  <img
                    src={mdApproval.signature}
                    alt="MD"
                    className="h-8 w-auto object-contain filter grayscale contrast-200"
                  />
                )}
                {!directorApproval && !mdApproval && (
                  <span className="text-[7.5px] font-bold">APPROVED</span>
                )}
              </div>
              <div className="border-t border-black pt-1">
                <span className="font-bold block leading-tight text-[9.5px]">Approve by management</span>
                <span className="text-[8px] text-black block truncate mt-0.5">Director & MD</span>
                <span className="text-[7.5px] text-black block leading-none mt-0.5">
                  {mdApproval
                    ? new Date(mdApproval.createdAt).toLocaleDateString("en-GB")
                    : directorApproval
                    ? new Date(directorApproval.createdAt).toLocaleDateString("en-GB")
                    : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Micro Footer */}
        <div className="mt-1 pt-0.5 border-t border-black text-[7.5px] text-black flex justify-between">
          <span>IMS GROUP Official Voucher &bull; Certified SHA-256 Digital Approval</span>
          <span>Printed: {new Date().toLocaleString("en-GB")}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-gray-100 print:bg-white print:p-0 text-black">
      {/* Controls Bar (hidden on print) */}
      <div className="no-print max-w-3xl mx-auto mb-4 p-3 bg-white rounded-lg shadow-sm border border-gray-300 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Link href={`/requisitions/${req.id}`} className="text-xs text-gray-500 hover:text-black font-semibold">
            &larr; Back
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-xs font-bold text-gray-800">
            A4 Voucher Print Settings &bull; Pure Black & White
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-1.5 text-xs font-semibold text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={twoPerPage}
              onChange={(e) => setTwoPerPage(e.target.checked)}
              className="rounded text-black focus:ring-black"
            />
            <span>Print 2 Copies on 1 A4 Page (Duplicate)</span>
          </label>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded shadow cursor-pointer"
          >
            🖨️ Print Now
          </button>
        </div>
      </div>

      {/* The Printable Page */}
      <div className="max-w-[195mm] mx-auto print:m-0">
        {twoPerPage ? (
          <div className="two-per-a4-page">
            {/* Top Half: Accounts / Office Copy */}
            <VoucherBox copyLabel="OFFICE / ACCOUNTS COPY" />

            {/* Dotted Cut Guide */}
            <div className="flex items-center justify-center my-1 text-[8px] font-mono text-black border-b border-dashed border-black">
              <span className="bg-white px-2">✂ ------------------------------------- Cut Here (Half of A4 Page) -------------------------------------</span>
            </div>

            {/* Bottom Half: Department / Maker Copy */}
            <VoucherBox copyLabel="MAKER / DEPARTMENT COPY" />
          </div>
        ) : (
          <div>
            <VoucherBox />
            {/* Cut Line */}
            <div className="flex items-center justify-center my-3 text-[8px] font-mono text-black border-b border-dashed border-black">
              <span className="bg-white px-2">✂ ------------------------------------- Cut Here (Half of A4 Page) -------------------------------------</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

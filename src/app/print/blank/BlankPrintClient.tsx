"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  companies: any[];
  selectedCompany: any;
  initialType: string;
}

export default function BlankPrintClient({ companies, selectedCompany, initialType }: Props) {
  const [currentCo, setCurrentCo] = useState(selectedCompany);
  const [tag, setTag] = useState(initialType);
  const [twoPerPage, setTwoPerPage] = useState(true);

  function handleCompanySelect(code: string) {
    const found = companies.find((c) => c.code === code);
    if (found) {
      setCurrentCo(found);
      setTag(found.code === "CLAN" ? "ADMIN" : "BPO");
    }
  }

  const BlankVoucher = ({ copyLabel }: { copyLabel?: string }) => (
    <div className="half-a4-voucher bg-white text-black border border-black p-3 rounded-none mx-auto box-border text-[10px] leading-tight flex flex-col justify-between">
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between pb-1.5 border-b border-black">
          {/* Logo & Tag & Title */}
          <div className="flex items-start space-x-2.5">
            <img
              src={currentCo.logo}
              alt={currentCo.name}
              className="h-11 w-auto object-contain filter grayscale contrast-200"
            />
            <div className="pt-0.5">
              <div className="text-xs font-bold text-black uppercase tracking-tight">
                {currentCo.name.toLowerCase()} <span className="font-extrabold">({tag})</span>
              </div>
              <div className="text-[11px] font-extrabold text-black underline uppercase tracking-wider mt-0.5">
                REQUISITION FOR FUND
              </div>
            </div>
          </div>

          {/* Legal name & addresses */}
          <div className="text-center max-w-sm px-2">
            <h1 className="text-xs font-black text-black uppercase tracking-tight">
              {currentCo.legalName}
            </h1>
            <p className="text-[8.5px] text-black leading-tight mt-0.5">
              {currentCo.address}
            </p>
            <p className="text-[8.5px] text-black leading-tight">
              {currentCo.phone && `Phone: ${currentCo.phone}. `}
              {currentCo.email && `Email: ${currentCo.email}`}
            </p>
            {currentCo.website && (
              <p className="text-[8.5px] text-black font-semibold leading-tight">{currentCo.website}</p>
            )}
          </div>

          {/* Empty Space for Manual Serial */}
          <div className="text-right flex flex-col items-end justify-center min-w-[70px]">
            <span className="text-[8.5px] font-bold text-black uppercase">Manual Serial #</span>
            <span className="block border-b border-black w-24 h-4 mt-0.5"></span>
            {copyLabel && (
              <span className="text-[7.5px] font-extrabold uppercase tracking-wider border border-black px-1 rounded-none mt-1">
                {copyLabel}
              </span>
            )}
          </div>
        </div>

        {/* Top meta fields with dotted lines */}
        <div className="mt-1.5 grid grid-cols-2 text-[10px] gap-y-1 text-black">
          <div className="flex items-baseline">
            <span className="w-24 font-bold">Name</span>
            <span className="mr-1">:</span>
            <span className="flex-1 border-b border-dotted border-black"></span>
          </div>
          <div className="flex items-baseline justify-end">
            <span className="font-bold mr-1.5">Date :</span>
            <span className="w-32 border-b border-dotted border-black"></span>
          </div>
          <div className="flex items-baseline">
            <span className="w-24 font-bold">Designation</span>
            <span className="mr-1">:</span>
            <span className="flex-1 border-b border-dotted border-black"></span>
          </div>
          <div className="flex items-baseline justify-end">
            <span className="font-bold mr-1.5">Project :</span>
            <span className="w-32 border-b border-dotted border-black"></span>
          </div>
        </div>

        {/* Amount & Purpose Header with dotted lines */}
        <div className="mt-1 text-[10px] text-black border-t border-black pt-1 leading-snug">
          <div className="flex items-baseline">
            <span className="font-bold whitespace-nowrap">An amount Tk. </span>
            <span className="w-28 border-b border-dotted border-black mx-1"></span>
            <span className="font-bold whitespace-nowrap ml-1">(In word) </span>
            <span className="flex-1 border-b border-dotted border-black ml-1"></span>
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="whitespace-nowrap">
              Is Required for the following purpose which may be sanctioned and disbursed on
            </span>
            <span className="flex-1 border-b border-dotted border-black ml-1.5"></span>
          </div>
        </div>

        {/* Line Items Table (Blank for Manual handwriting) */}
        <div className="mt-1.5 border border-black">
          <table className="w-full text-left text-[9px] border-collapse">
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
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="h-5">
                  <td className="py-0.5 px-1 text-center font-bold border-r border-black">{i + 1}.</td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td></td>
                </tr>
              ))}

              {/* Total row */}
              <tr className="border-t border-black font-extrabold text-[10px] h-5">
                <td colSpan={5} className="py-0.5 px-3 text-right uppercase border-r border-black">
                  Total
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comments with dotted lines */}
        <div className="mt-1 text-[9px] text-black">
          <span className="font-bold">Comments:</span>
          <div className="border-b border-dotted border-black h-3.5 mt-0.5"></div>
        </div>
      </div>

      {/* 5 Bottom Signature Boxes */}
      <div>
        <div className="mt-1.5 pt-1.5 border-t border-black">
          <div className="grid grid-cols-5 gap-1.5 text-center text-[9px]">
            <div className="border-t border-black pt-0.5 min-h-[44px] flex flex-col justify-between">
              <span className="font-bold block">Requested by</span>
              <span className="text-[8px] text-black">Maker</span>
            </div>
            <div className="border-t border-black pt-0.5 min-h-[44px] flex flex-col justify-between">
              <span className="font-bold block">Checked by</span>
              <span className="text-[8px] text-black">Head</span>
            </div>
            <div className="border-t border-black pt-0.5 min-h-[44px] flex flex-col justify-between">
              <span className="font-bold block">Checked by</span>
              <span className="text-[8px] text-black">Checker</span>
            </div>
            <div className="border-t border-black pt-0.5 min-h-[44px] flex flex-col justify-between">
              <span className="font-bold block">Checked by Accounts</span>
              <span className="text-[8px] text-black">Accounts</span>
            </div>
            <div className="border-t border-black pt-0.5 min-h-[44px] flex flex-col justify-between">
              <span className="font-bold block">Approve by management</span>
              <span className="text-[8px] text-black">Director & MD</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-1 pt-0.5 border-t border-black text-[7.5px] text-black flex justify-between">
          <span>IMS GROUP Official Blank Voucher &bull; Standard Official Format</span>
          <span>Version: B&W-2-PER-A4</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-gray-100 print:bg-white print:p-0 text-black">
      {/* Controls Bar (hidden on print) */}
      <div className="no-print max-w-3xl mx-auto mb-4 p-3 bg-white rounded-lg shadow-sm border border-gray-300 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Link href="/" className="text-xs text-gray-500 hover:text-black font-semibold">
            &larr; Dashboard
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-xs font-bold text-gray-800">
            Blank Voucher Print (B&W)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={currentCo.code}
            onChange={(e) => handleCompanySelect(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 font-semibold"
          >
            {companies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            placeholder="TAG"
            className="w-16 text-xs font-bold uppercase border border-gray-300 rounded px-1.5 py-1"
          />

          <label className="flex items-center space-x-1.5 text-xs font-semibold text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={twoPerPage}
              onChange={(e) => setTwoPerPage(e.target.checked)}
              className="rounded text-black focus:ring-black"
            />
            <span>2 Vouchers per A4</span>
          </label>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-1 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded shadow cursor-pointer"
          >
            🖨️ Print Form
          </button>
        </div>
      </div>

      {/* Sheet Container */}
      <div className="max-w-[195mm] mx-auto print:m-0">
        {twoPerPage ? (
          <div className="two-per-a4-page">
            {/* Top Half */}
            <BlankVoucher copyLabel="OFFICE COPY" />

            {/* Dotted Cut Guide */}
            <div className="flex items-center justify-center my-1 text-[8px] font-mono text-black border-b border-dashed border-black">
              <span className="bg-white px-2">✂ ------------------------------------- Cut Here (Half of A4 Page) -------------------------------------</span>
            </div>

            {/* Bottom Half */}
            <BlankVoucher copyLabel="MAKER COPY" />
          </div>
        ) : (
          <div>
            <BlankVoucher />
            <div className="flex items-center justify-center my-3 text-[8px] font-mono text-black border-b border-dashed border-black">
              <span className="bg-white px-2">✂ ------------------------------------- Cut Here (Half of A4 Page) -------------------------------------</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

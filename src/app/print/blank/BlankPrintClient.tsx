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

  function handleCompanySelect(code: string) {
    const found = companies.find((c) => c.code === code);
    if (found) {
      setCurrentCo(found);
      setTag(found.code === "CLAN" ? "ADMIN" : "BPO");
    }
  }

  const isYellowTint = currentCo.paperTint === "#FFF4C2";

  return (
    <div
      className="min-h-screen p-8 text-black"
      style={{
        backgroundColor: isYellowTint ? "#FFFAE0" : "#FFFFFF",
      }}
    >
      {/* Configuration Bar (hidden on print) */}
      <div className="no-print max-w-4xl mx-auto mb-6 p-4 bg-white rounded-xl shadow-sm border border-gray-300 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-900 font-semibold">
            &larr; Dashboard
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-xs font-bold text-gray-800">
            Emergency Blank Form Generator
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5">
            <label className="text-xs font-semibold text-gray-700">Company:</label>
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
          </div>

          <div className="flex items-center space-x-1.5">
            <label className="text-xs font-semibold text-gray-700">Tag:</label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              placeholder="BPO / ADMIN / CASH"
              className="w-24 text-xs font-bold uppercase border border-gray-300 rounded px-2 py-1"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-[#E42528] hover:bg-[#B81D20] text-white text-xs font-bold rounded shadow cursor-pointer"
          >
            🖨️ Print Blank A4 Form
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="max-w-4xl mx-auto bg-transparent border-0 print:p-0">
        {/* Header Block matching the scan */}
        <div className="flex items-start justify-between pb-3 border-b-2 border-black">
          {/* Logo & Tag & Title */}
          <div className="flex items-start space-x-3">
            <img
              src={currentCo.logo}
              alt={currentCo.name}
              className="h-14 w-auto object-contain"
            />
            <div className="pt-0.5">
              <div className="text-sm font-bold text-black uppercase tracking-tight">
                {currentCo.name.toLowerCase()} <span className="font-extrabold">({tag})</span>
              </div>
              <div className="text-[12px] font-bold text-black underline uppercase tracking-wider mt-0.5">
                REQUISITION FOR FUND
              </div>
            </div>
          </div>

          {/* Legal name & addresses */}
          <div className="text-center max-w-md px-2">
            <h1 className="text-sm font-extrabold text-black uppercase tracking-tight">
              {currentCo.legalName}
            </h1>
            <p className="text-[10px] text-black leading-tight mt-0.5">
              {currentCo.address}
            </p>
            <p className="text-[10px] text-black leading-tight">
              {currentCo.phone && `Phone ${currentCo.phone}. `}
              {currentCo.email && `E-mail: ${currentCo.email}`}
            </p>
            {currentCo.website && (
              <p className="text-[10px] text-black font-medium">{currentCo.website}</p>
            )}
          </div>

          {/* Empty Space for Manual Voucher Number */}
          <div className="text-right flex flex-col items-end justify-center min-w-[80px]">
            <span className="text-[9px] font-bold text-gray-500 uppercase">Manual Serial #</span>
            <span className="block border-b border-black w-24 h-5 mt-1"></span>
          </div>
        </div>

        {/* Top meta fields with dotted lines */}
        <div className="mt-4 grid grid-cols-2 text-[11px] gap-y-2 text-black">
          <div className="flex items-baseline">
            <span className="w-24 font-bold">Name</span>
            <span className="mr-1">:</span>
            <span className="flex-1 border-b border-dotted border-black"></span>
          </div>
          <div className="flex items-baseline justify-end">
            <span className="font-bold mr-2">Date :</span>
            <span className="w-36 border-b border-dotted border-black"></span>
          </div>
          <div className="flex items-baseline">
            <span className="w-24 font-bold">Designation</span>
            <span className="mr-1">:</span>
            <span className="flex-1 border-b border-dotted border-black"></span>
          </div>
          <div className="flex items-baseline justify-end">
            <span className="font-bold mr-2">Project :</span>
            <span className="w-36 border-b border-dotted border-black"></span>
          </div>
        </div>

        {/* Amount & Purpose Header with dotted lines */}
        <div className="mt-3 text-[11px] text-black border-t border-gray-300 pt-2 leading-relaxed">
          <div className="flex items-baseline">
            <span className="font-bold whitespace-nowrap">An amount Tk. </span>
            <span className="w-32 border-b border-dotted border-black mx-1"></span>
            <span className="font-bold whitespace-nowrap ml-1">(In word) </span>
            <span className="flex-1 border-b border-dotted border-black ml-1"></span>
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="whitespace-nowrap">
              Is Required for the following purpose which may be sanctioned and disbursed on
            </span>
            <span className="flex-1 border-b border-dotted border-black ml-2"></span>
          </div>
        </div>

        {/* Line Items Table (Blank for Manual handwriting) */}
        <div className="mt-4 border border-black">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-black font-extrabold uppercase bg-gray-50/50">
                <th className="py-1 px-1.5 w-10 text-center border-r border-black">SL.</th>
                <th className="py-1 px-2 border-r border-black">Particulars</th>
                <th className="py-1 px-2 border-r border-black w-1/4">Purpose</th>
                <th className="py-1 px-1.5 border-r border-black w-14 text-right">Qty.</th>
                <th className="py-1 px-2 border-r border-black w-24 text-right">Unit Price</th>
                <th className="py-1 px-2 w-28 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-7">
                  <td className="py-1 px-1 text-center font-bold border-r border-black">{i + 1}.</td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td></td>
                </tr>
              ))}

              {/* Total row */}
              <tr className="border-t-2 border-black font-extrabold text-[11px] bg-gray-50/50 h-7">
                <td colSpan={5} className="py-1 px-4 text-right uppercase border-r border-black">
                  Total
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comments with dotted lines */}
        <div className="mt-3 text-[10px] text-black">
          <span className="font-bold">Comments:</span>
          <div className="border-b border-dotted border-black h-4 mt-1"></div>
          <div className="border-b border-dotted border-black h-4 mt-1"></div>
        </div>

        {/* 5 Bottom Signature Boxes */}
        <div className="mt-12 pt-6">
          <div className="grid grid-cols-5 gap-3 text-center text-[10px]">
            <div className="border-t border-black pt-1">
              <span className="font-bold block">Requested by</span>
            </div>
            <div className="border-t border-black pt-1">
              <span className="font-bold block">Checked by</span>
            </div>
            <div className="border-t border-black pt-1">
              <span className="font-bold block">Checked by</span>
            </div>
            <div className="border-t border-black pt-1">
              <span className="font-bold block">Checked by Accounts</span>
            </div>
            <div className="border-t border-black pt-1">
              <span className="font-bold block">Approve by management</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-2 border-t border-gray-300 text-[8px] text-gray-400 flex justify-between">
          <span>IMS GROUP Emergency Requisition Voucher &bull; Standard Official Format</span>
          <span>Form Version: ERP-V1-MANUAL</span>
        </div>
      </div>
    </div>
  );
}

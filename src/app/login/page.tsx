"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const demoAccounts = [
    { label: "Super Admin — Abir Abedin (1001)", email: "admin@ims.com.bd", role: "Priority 5 • Sr. Manager, Information & Transformation" },
    { label: "Director — Iftekhar Hussein (1004)", email: "nahiyan@ims.com.bd", role: "Priority 4 • BD / Outsourcing / Events" },
    { label: "Director — Nazmus Sakib Rahman (1005)", email: "nazmus@ims.com.bd", role: "Priority 4 • BD Red Team / Studio" },
    { label: "Director — Mahabub Hasan Shible (1026)", email: "shible@ims.com.bd", role: "Priority 4 • Operations & Events" },
    { label: "Managing Director — Sami Hasan (1015)", email: "sami.hasan@ims.com.bd", role: "Priority 4 • MD (IMS Group)" },
    { label: "Managing Director — Syed Sarwar Morshed (1025)", email: "sarwarmorshed@ims.com.bd", role: "Priority 4 • MD (IMS Group)" },
    { label: "Accounts Manager — Harun Ur-Rashid (1050)", email: "harun@ims.com.bd", role: "Priority 4 • Accounts Check & Forward" },
    { label: "Outsourcing/TP Mgr — Murshalin Polok (1070)", email: "polok@ims.com.bd", role: "Priority 4 • Outsourcing / TradePulse" },
    { label: "CLAN Manager — Abrar Jawad (1016)", email: "abrar@ims.com.bd", role: "Priority 3 • CLAN Manager" },
    { label: "Events Manager — Naimur Rahman Ringku (1092)", email: "ringku@ims.com.bd", role: "Priority 3 • Operation & Events" },
    { label: "Project Robi Exec — Munir Kabir (1074)", email: "ruhan@ims.com.bd", role: "Priority 3 • Project Robi" },
    { label: "Project GP Exec — Salauddin Saju (1077)", email: "saju@ims.com.bd", role: "Priority 3 • Project GP" },
    { label: "CLAN Exec — Saad Ali Shadil (1002)", email: "shadil@clan.com.bd", role: "Priority 2 • CLAN Executive" },
    { label: "Accounts Exec — Israt Jahan Tanni (1051)", email: "tanni@ims.com.bd", role: "Priority 3 • Execution & Disbursement" },
    { label: "HR Manager — Moushumi Tamanna (1014)", email: "moushumi@ims.com.bd", role: "Priority 4 • HR Admin" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <img src="/logos/ims.png" alt="IMS Group" className="h-16 w-auto object-contain" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          IMS GROUP
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Integrated Requisition & Approval Workflow System
        </p>
        <div className="mt-2 flex items-center justify-center space-x-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          <span>IMS</span>
          <span>•</span>
          <span>CLAN</span>
          <span>•</span>
          <span>SCL</span>
          <span>•</span>
          <span>TradePULSE</span>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm rounded-xl sm:px-10 border border-gray-200">
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-[#E42528] p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-gray-700">
                Email Address or Employee ID
              </label>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@ims.com.bd or Employee ID (e.g. 1001)"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">
                Password <span className="font-normal text-gray-400">(Default: your email address)</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your email address as password"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-[#E42528] hover:bg-[#B81D20] focus:outline-none cursor-pointer transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in to Dashboard"}
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              Quick Account Switcher (Password = Email)
            </p>
            <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword(acc.email);
                  }}
                  className="text-left px-2.5 py-1.5 rounded text-xs bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 transition-colors flex justify-between items-center group cursor-pointer"
                >
                  <div>
                    <span className="font-semibold text-gray-800 group-hover:text-[#E42528]">
                      {acc.label}
                    </span>
                    <span className="block text-[10px] text-gray-500">
                      {acc.email} • {acc.role}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 group-hover:text-[#E42528] font-medium">
                    Use &rarr;
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

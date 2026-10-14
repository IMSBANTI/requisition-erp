"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Ims@12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const demoAccounts = [
    { label: "Maker Executive (IMS)", email: "ims.exec@ims.com.bd", role: "Executive" },
    { label: "Outsourcing Manager", email: "outsourcing.manager@ims.com.bd", role: "Manager (24 Projects)" },
    { label: "Sr. Mgr IT (Abir Abedin)", email: "abir@ims.com.bd", role: "Super Admin & IT Checker" },
    { label: "Accounts Manager (Harun)", email: "harun@ims.com.bd", role: "Accounts Check & Forward" },
    { label: "Director (Iftekhar Hussein)", email: "iftekhar@ims.com.bd", role: "Director Approval" },
    { label: "Managing Director", email: "md@ims.com.bd", role: "MD Final / Batch Approval" },
    { label: "Accounts Exec (Sumon)", email: "sumon@ims.com.bd", role: "Execution & Disbursement" },
    { label: "HR (Moushumi Tamanna)", email: "moushumi@ims.com.bd", role: "HR Read-Only Admin" },
    { label: "CLAN Manager", email: "clan.manager@clan.com.bd", role: "CLAN Admin Manager" },
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
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@ims.com.bd"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-[#E42528] focus:border-[#E42528]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              Fast Demo Switcher (Pre-configured Users)
            </p>
            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword("Ims@12345");
                  }}
                  className="text-left px-2.5 py-1.5 rounded text-xs bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 transition-colors flex justify-between items-center group cursor-pointer"
                >
                  <div>
                    <span className="font-semibold text-gray-800 group-hover:text-[#E42528]">
                      {acc.label}
                    </span>
                    <span className="block text-[10px] text-gray-500">{acc.email}</span>
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

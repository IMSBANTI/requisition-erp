"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DemoAccountItem {
  label: string;
  email: string;
  role: string;
}

type LoginStep =
  | "CREDENTIALS"
  | "VERIFY_2FA"
  | "ENROLL_2FA"
  | "SHOW_BACKUP_CODES"
  | "PENDING_DEVICE";

export default function LoginClient({
  demoAccounts,
  blockedReason = null,
}: {
  demoAccounts: DemoAccountItem[];
  blockedReason?: "ip" | "mobile" | "device" | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("CREDENTIALS");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA Challenge & Enrollment state
  const [twoFaUserName, setTwoFaUserName] = useState("");
  const [twoFaAccountName, setTwoFaAccountName] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [trustedDeviceDays, setTrustedDeviceDays] = useState(14);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [trustBrowser, setTrustBrowser] = useState(true);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Pending Trusted Device Approval state
  const [pendingDeviceLabel, setPendingDeviceLabel] = useState("");
  const [pendingDeviceIp, setPendingDeviceIp] = useState("");
  const [pendingDeviceUser, setPendingDeviceUser] = useState("");

  function detectClientTouchMobile(): boolean {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const smallViewport = Math.min(window.screen.width, window.screen.height) <= 820;
    const hasTouch = (navigator.maxTouchPoints ?? 0) > 1;
    return coarse && smallViewport && hasTouch;
  }

  async function handleSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          clientHintMobile: detectClientTouchMobile(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.pendingDeviceApproval) {
          setPendingDeviceLabel(data.deviceLabel || "This Browser");
          setPendingDeviceIp(data.detectedIp || "");
          setPendingDeviceUser(data.userName || email);
          setStep("PENDING_DEVICE");
          setError("");
          setLoading(false);
          return;
        }
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      if (data.require2fa) {
        setTwoFaUserName(data.userName || "");
        setTwoFaAccountName(data.accountName || email);
        setTrustedDeviceDays(Number(data.trustedDeviceDays ?? 0));
        setCode("");
        setUseBackupCode(false);
        setTrustBrowser(Number(data.trustedDeviceDays ?? 0) > 0);

        if (data.mode === "ENROLL") {
          setQrDataUrl(data.qrDataUrl || "");
          setManualKey(data.manualKey || "");
          setStep("ENROLL_2FA");
        } else {
          setStep("VERIFY_2FA");
        }
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

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          useBackupCode: step === "VERIFY_2FA" && useBackupCode,
          trustBrowser,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid verification code");
        setLoading(false);
        return;
      }

      if (data.enrolled && Array.isArray(data.backupCodes) && data.backupCodes.length > 0) {
        setBackupCodes(data.backupCodes);
        setStep("SHOW_BACKUP_CODES");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Verification failed");
      setLoading(false);
    }
  }

  function handleCopyBackupCodes() {
    const text = `IMS GROUP ERP — 2FA Backup Recovery Codes (${twoFaAccountName})\nKeep these in a safe place. Each code works once.\n\n${backupCodes.join("\n")}`;
    navigator.clipboard?.writeText(text);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2500);
  }

  function handleDownloadBackupCodes() {
    const text = `IMS GROUP ERP — 2FA Backup Recovery Codes\nAccount: ${twoFaAccountName}\nGenerated: ${new Date().toISOString()}\n\nEach code can be used once if you lose access to your authenticator app:\n\n${backupCodes.join("\n")}\n`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IMS_ERP_2FA_Recovery_Codes_${twoFaAccountName.replace(/[^a-z0-9]/gi, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleBackToLogin() {
    setStep("CREDENTIALS");
    setError("");
    setCode("");
    setQrDataUrl("");
    setManualKey("");
    setUseBackupCode(false);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <img
            src="/logos/ims.png"
            alt="IMS Group"
            className="h-16 w-auto object-contain"
          />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          IMS GROUP
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Integrated Requisition &amp; Approval Workflow System
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
          {blockedReason === "ip" && step === "CREDENTIALS" && (
            <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900">
              <p className="font-bold">Office Network Required</p>
              <p className="mt-0.5">
                Your session was paused because your current IP address is outside the authorized IMS office network. Connect to office Wi-Fi/LAN or request Remote IP Access from Super Admin.
              </p>
            </div>
          )}

          {blockedReason === "mobile" && step === "CREDENTIALS" && (
            <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900">
              <p className="font-bold">Desktop Computer Required</p>
              <p className="mt-0.5">
                Mobile &amp; tablet access is restricted by IMS security policy for this account. Please sign in from an office desktop browser or request Mobile Access from Super Admin.
              </p>
            </div>
          )}

          {blockedReason === "device" && step === "CREDENTIALS" && (
            <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900">
              <p className="font-bold">Trusted Device Approval Required</p>
              <p className="mt-0.5">
                This browser or device is not currently approved for your account (or was revoked by Super Admin). Sign in below to submit a one-time approval request.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-[#E42528] p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* ─── STEP 1: CREDENTIALS ─── */}
          {step === "CREDENTIALS" && (
            <>
              <form className="space-y-4" onSubmit={handleSubmitCredentials}>
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
                    Password{" "}
                    <span className="font-normal text-gray-400">
                      (Default: your email address)
                    </span>
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
            </>
          )}

          {/* ─── STEP 2A: VERIFY EXISTING 2FA ─── */}
          {step === "VERIFY_2FA" && (
            <form className="space-y-4" onSubmit={handleVerify2fa}>
              <div className="text-center pb-2 border-b border-gray-100">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-[#E42528] border border-red-200">
                  Two-Factor Verification
                </span>
                <h3 className="mt-2 text-base font-bold text-gray-900">
                  {twoFaUserName || twoFaAccountName}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {useBackupCode
                    ? "Enter one of your 8-character backup recovery codes."
                    : "Open Google Authenticator or Microsoft Authenticator and enter the 6-digit code."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  {useBackupCode ? "Backup Recovery Code" : "6-Digit Authenticator Code"}
                </label>
                <input
                  type="text"
                  inputMode={useBackupCode ? "text" : "numeric"}
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
                  maxLength={useBackupCode ? 12 : 6}
                  className="mt-1 block w-full px-3 py-2.5 text-center font-mono text-lg tracking-[0.25em] border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              {trustedDeviceDays > 0 && (
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trustBrowser}
                    onChange={(e) => setTrustBrowser(e.target.checked)}
                    className="rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span>Trust this browser for {trustedDeviceDays} days</span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-white bg-[#E42528] hover:bg-[#B81D20] cursor-pointer transition-colors disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setCode("");
                    setError("");
                  }}
                  className="text-blue-700 hover:underline font-semibold cursor-pointer"
                >
                  {useBackupCode ? "Use 6-digit authenticator code" : "Lost phone? Use a backup code"}
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  &larr; Back
                </button>
              </div>
            </form>
          )}

          {/* ─── STEP 2B: MANDATORY FIRST-TIME 2FA ENROLLMENT ─── */}
          {step === "ENROLL_2FA" && (
            <form className="space-y-4" onSubmit={handleVerify2fa}>
              <div className="text-center pb-2 border-b border-gray-100">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  Mandatory Security Setup (2FA)
                </span>
                <h3 className="mt-2 text-base font-bold text-gray-900">
                  Set Up Authenticator App
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Your role handles sensitive financial/approval data. Scan this QR code with{" "}
                  <span className="font-semibold text-gray-700">Google Authenticator</span> or{" "}
                  <span className="font-semibold text-gray-700">Microsoft Authenticator</span>.
                </p>
              </div>

              {qrDataUrl && (
                <div className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <img
                    src={qrDataUrl}
                    alt="2FA Authenticator QR Code"
                    className="w-44 h-44 rounded bg-white p-1 border border-gray-200"
                  />
                  <div className="mt-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Or enter setup key manually
                    </p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-gray-800 break-all select-all bg-white px-2 py-1 rounded border border-gray-200">
                      {manualKey}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Enter the 6-digit code shown in your app
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="mt-1 block w-full px-3 py-2.5 text-center font-mono text-lg tracking-[0.25em] border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              {trustedDeviceDays > 0 && (
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trustBrowser}
                    onChange={(e) => setTrustBrowser(e.target.checked)}
                    className="rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span>Trust this browser for {trustedDeviceDays} days</span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-white bg-[#E42528] hover:bg-[#B81D20] cursor-pointer transition-colors disabled:opacity-50"
              >
                {loading ? "Activating 2FA..." : "Verify & Activate 2FA"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  &larr; Cancel and return to login
                </button>
              </div>
            </form>
          )}

          {/* ─── STEP 3: SAVE BACKUP RECOVERY CODES ─── */}
          {step === "SHOW_BACKUP_CODES" && (
            <div className="space-y-4">
              <div className="text-center pb-2 border-b border-gray-100">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  2FA Activated Successfully
                </span>
                <h3 className="mt-2 text-base font-bold text-gray-900">
                  Save Your Backup Recovery Codes
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Store these 8 codes safely. If you ever lose your phone, each code lets you sign in once. They will not be shown again.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                {backupCodes.map((c) => (
                  <div
                    key={c}
                    className="font-mono text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded px-2.5 py-1.5 text-center select-all"
                  >
                    {c}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyBackupCodes}
                  className="flex-1 py-2 px-3 rounded-md text-xs font-bold border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 cursor-pointer"
                >
                  {copiedCodes ? "Copied!" : "Copy All Codes"}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadBackupCodes}
                  className="flex-1 py-2 px-3 rounded-md text-xs font-bold border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 cursor-pointer"
                >
                  Download .txt
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  router.push("/");
                  router.refresh();
                }}
                className="w-full py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-white bg-[#E42528] hover:bg-[#B81D20] cursor-pointer transition-colors"
              >
                I&apos;ve Saved My Codes — Continue to Dashboard
              </button>
            </div>
          )}

          {/* ─── STEP 4: PENDING TRUSTED DEVICE APPROVAL ─── */}
          {step === "PENDING_DEVICE" && (
            <div className="space-y-4">
              <div className="text-center pb-2 border-b border-gray-100">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  One-Time Device Approval Pending
                </span>
                <h3 className="mt-2 text-base font-bold text-gray-900">
                  Waiting for Super Admin Approval
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  For security, new laptops, PCs, and mobile phones require one-time approval by Super Admin before signing in.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 text-xs space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 font-medium">Account:</span>
                  <span className="font-bold text-gray-900 text-right">{pendingDeviceUser}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 font-medium">Device / Browser:</span>
                  <span className="font-semibold text-gray-800 text-right">{pendingDeviceLabel}</span>
                </div>
                {pendingDeviceIp && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 font-medium">Detected IP:</span>
                    <span className="font-mono font-semibold text-gray-800">{pendingDeviceIp}</span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-gray-600 bg-blue-50/70 border border-blue-200 rounded-lg p-2.5">
                Ask Super Admin to open <span className="font-bold">Administration &rarr; Security &amp; 2FA</span> and click <span className="font-bold">Approve</span> on this device. Once approved, click the button below.
              </p>

              <button
                type="button"
                disabled={loading}
                onClick={handleSubmitCredentials}
                className="w-full py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-white bg-[#E42528] hover:bg-[#B81D20] cursor-pointer transition-colors disabled:opacity-50"
              >
                {loading ? "Checking Approval..." : "Check Approval & Sign In"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                >
                  &larr; Back to login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

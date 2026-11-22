"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SecurityPolicyConfig } from "@/lib/security";
import { useToast } from "@/components/ToastProvider";

interface SecurityUserRow {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  roleName: string;
  levelLabel: string;
  isSensitive: boolean;
  is2faRequired: boolean;
  twoFactorEnabled: boolean;
  twoFactorEnrolledAt: string | null;
  backupCodesLeft: number;
  allowRemoteIp: boolean;
  allowMobile: boolean;
  isExecOrDir: boolean;
}

interface SecurityLogRow {
  id: string;
  action: string;
  details: string;
  ip: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export default function SecuritySettingsClient({
  initialPolicy,
  detectedIp,
  deviceSummary,
  users,
  recentLogs,
}: {
  initialPolicy: SecurityPolicyConfig;
  detectedIp: string;
  deviceSummary: string;
  users: SecurityUserRow[];
  recentLogs: SecurityLogRow[];
}) {
  const router = useRouter();
  const { toast, confirmDialog } = useToast();

  const [ipLockEnabled, setIpLockEnabled] = useState(initialPolicy.ipLockEnabled);
  const [allowedIps, setAllowedIps] = useState<string[]>(initialPolicy.allowedIps);
  const [newIpInput, setNewIpInput] = useState("");
  const [mobileLockEnabled, setMobileLockEnabled] = useState(
    initialPolicy.mobileLockEnabled
  );
  const [enforce2faSensitive, setEnforce2faSensitive] = useState(
    initialPolicy.enforce2faSensitive
  );
  const [trustedDeviceDays, setTrustedDeviceDays] = useState(
    initialPolicy.trustedDeviceDays
  );
  const [allowSuperAdminBypass, setAllowSuperAdminBypass] = useState(
    initialPolicy.allowSuperAdminBypass
  );
  const [saving, setSaving] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);

  const sensitiveUsers = useMemo(
    () => users.filter((u) => u.isSensitive || u.is2faRequired || u.twoFactorEnabled),
    [users]
  );

  const displayedUsers = showAllUsers ? users : sensitiveUsers;
  const enrolledSensitiveCount = sensitiveUsers.filter(
    (u) => u.twoFactorEnabled
  ).length;

  function handleAddIp(entryRaw?: string) {
    const raw = (entryRaw ?? newIpInput).trim();
    if (!raw) return;
    if (raw === "local") {
      toast.info("Localhost is automatically allowed in development mode. Add your public office IP (e.g. 103.x.x.x).");
      return;
    }
    if (allowedIps.includes(raw)) {
      toast.info(`${raw} is already in the Office IP allowlist.`);
      setNewIpInput("");
      return;
    }
    setAllowedIps((prev) => [...prev, raw]);
    setNewIpInput("");
  }

  function handleRemoveIp(entry: string) {
    setAllowedIps((prev) => prev.filter((x) => x !== entry));
  }

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (ipLockEnabled && allowedIps.length === 0) {
      toast.error(
        "Add at least one authorized Office IP or CIDR before enabling Office IP Lock."
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipLockEnabled,
          allowedIps,
          mobileLockEnabled,
          enforce2faSensitive,
          trustedDeviceDays,
          allowSuperAdminBypass,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save security policy.");
        return;
      }
      toast.success("Security policy saved and active immediately.");
      router.refresh();
    } catch {
      toast.error("Network error while saving security policy.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetUser2fa(u: SecurityUserRow) {
    const ok = await confirmDialog({
      title: "Reset User 2FA",
      message: `Reset Two-Factor Authentication for ${u.name} (${u.email})? They will be prompted to scan a new QR code on next sign-in.`,
      confirmLabel: "Reset 2FA",
      tone: "danger",
    });
    if (!ok) return;

    setResettingUserId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-2fa`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to reset 2FA.");
        return;
      }
      toast.success(data.message || `2FA reset for ${u.name}.`);
      router.refresh();
    } catch {
      toast.error("Network error while resetting 2FA.");
    } finally {
      setResettingUserId(null);
    }
  }

  function badgeColorForAction(action: string) {
    if (action.includes("BLOCKED") || action.includes("FAILED")) {
      return "bg-red-50 text-red-700 border-red-200";
    }
    if (action.includes("2FA_ENABLED") || action === "LOGIN_SUCCESS") {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (action.includes("RESET") || action.includes("BACKUP") || action.includes("POLICY")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    return "bg-gray-100 text-gray-800 border-gray-200";
  }

  return (
    <div className="mt-6 space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Your Detected Network IP
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-bold text-gray-900 truncate">
              {detectedIp}
            </span>
            {detectedIp && detectedIp !== "local" && !allowedIps.includes(detectedIp) && (
              <button
                type="button"
                onClick={() => handleAddIp(detectedIp)}
                className="px-2 py-1 text-[10px] font-bold rounded bg-red-50 text-[#E42528] border border-red-200 hover:bg-red-100 cursor-pointer shrink-0"
              >
                + Add Office IP
              </button>
            )}
          </div>
          <div className="text-[11px] text-gray-400 mt-1 truncate">
            {deviceSummary}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Office IP Lock
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                ipLockEnabled
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {ipLockEnabled ? "ACTIVE" : "OFF"}
            </span>
            <span className="text-xs text-gray-600">
              {allowedIps.length} allowed {allowedIps.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            MD, Directors &amp; exempted users bypass
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Mobile Access Lock
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                mobileLockEnabled
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {mobileLockEnabled ? "ACTIVE" : "OFF"}
            </span>
            <span className="text-xs text-gray-600">
              {mobileLockEnabled ? "Desktop required" : "All devices allowed"}
            </span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Per-user override in Admin &rarr; Users
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Sensitive Role 2FA
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold text-gray-900">
              {enrolledSensitiveCount} / {sensitiveUsers.length}
            </span>
            <span className="text-xs text-gray-500">enrolled</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            MD, Directors, Accounts, Admin &amp; Report Users
          </div>
        </div>
      </div>

      {/* Main Policy Form */}
      <form
        onSubmit={handleSavePolicy}
        className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              Global Security Policy
            </h2>
            <p className="text-xs text-gray-500">
              Applies immediately on login and active sessions. Individual user exceptions are managed in{" "}
              <Link href="/admin/users" className="text-[#E42528] font-semibold hover:underline">
                Admin &rarr; Users
              </Link>{" "}
              (Tab 3: Scopes &amp; Privileges).
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] shadow-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving Policy..." : "Save Security Policy"}
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          {/* Left Column: IP Lock + Mobile Lock */}
          <div className="space-y-5">
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    Office IP Access Lock
                  </h3>
                  <p className="text-gray-500 mt-0.5">
                    Restrict Accounts, Managers, and Staff to authorized IMS office public IPs or CIDR ranges. MD, Directors, and users with <span className="font-semibold">Allow Remote IP</span> can still access remotely.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={ipLockEnabled}
                    onChange={(e) => setIpLockEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span className="font-bold text-gray-800">
                    {ipLockEnabled ? "ON" : "OFF"}
                  </span>
                </label>
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-2.5">
                <label className="block font-semibold text-gray-700">
                  Authorized Office IPs / CIDR Ranges
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newIpInput}
                    onChange={(e) => setNewIpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddIp();
                      }
                    }}
                    placeholder="e.g. 103.112.54.10 or 103.112.54.0/29"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddIp()}
                    className="px-3 py-1.5 rounded-md bg-gray-900 text-white font-bold hover:bg-gray-800 cursor-pointer"
                  >
                    Add IP
                  </button>
                </div>

                {allowedIps.length === 0 ? (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    No office IPs added yet. Add your office static public IP before turning IP Lock ON.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allowedIps.map((entry) => (
                      <span
                        key={entry}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[11px] font-semibold"
                      >
                        {entry}
                        <button
                          type="button"
                          onClick={() => handleRemoveIp(entry)}
                          className="text-slate-400 hover:text-red-600 font-bold cursor-pointer"
                          aria-label={`Remove ${entry}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  Mobile &amp; Tablet Access Lock
                </h3>
                <p className="text-gray-500 mt-0.5">
                  Block phones and tablets for non-exempt staff so sensitive ERP actions happen on office desktops. MD, Directors, Super Admin, and users with <span className="font-semibold">Allow Mobile</span> remain allowed.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 pt-0.5">
                <input
                  type="checkbox"
                  checked={mobileLockEnabled}
                  onChange={(e) => setMobileLockEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                />
                <span className="font-bold text-gray-800">
                  {mobileLockEnabled ? "ON" : "OFF"}
                </span>
              </label>
            </div>
          </div>

          {/* Right Column: Mandatory 2FA + Anti-Lockout */}
          <div className="space-y-5">
            <div className="border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    Mandatory 2FA for Sensitive Roles
                  </h3>
                  <p className="text-gray-500 mt-0.5">
                    Requires Google Authenticator / Microsoft Authenticator (6-digit TOTP) for{" "}
                    <span className="font-semibold text-gray-800">
                      Super Admin, Managing Directors, Directors, Accounts, and all Financial Report / P&amp;L users
                    </span>
                    . Unenrolled users are guided through QR setup automatically on next sign-in.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={enforce2faSensitive}
                    onChange={(e) => setEnforce2faSensitive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span className="font-bold text-gray-800">
                    {enforce2faSensitive ? "ON" : "OFF"}
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <label className="block font-semibold text-gray-700 mb-1">
                  Trusted Browser Duration (&ldquo;Remember this browser&rdquo;)
                </label>
                <select
                  value={trustedDeviceDays}
                  onChange={(e) => setTrustedDeviceDays(Number(e.target.value))}
                  className="w-full sm:w-72 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-xs font-medium"
                >
                  <option value={0}>0 days — Require 6-digit code on every login</option>
                  <option value={7}>7 days — Remember verified browser for 1 week</option>
                  <option value={14}>14 days — Recommended balance (2 weeks)</option>
                  <option value={30}>30 days — Remember verified browser for 1 month</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  New or unrecognized browsers always require the 6-digit Authenticator code.
                </p>
              </div>
            </div>

            <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-amber-950 text-sm">
                  Super Admin Anti-Lockout Safeguard
                </h3>
                <p className="text-amber-900/80 mt-0.5">
                  Allows Super Admin (Priority 5) to sign in from any IP/device so an unexpected office ISP IP change can never lock you out of updating the allowlist. (Super Admin still requires 2FA.)
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 pt-0.5">
                <input
                  type="checkbox"
                  checked={allowSuperAdminBypass}
                  onChange={(e) => setAllowSuperAdminBypass(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400 text-[#E42528] focus:ring-[#E42528]"
                />
                <span className="font-bold text-amber-950">
                  {allowSuperAdminBypass ? "ON" : "OFF"}
                </span>
              </label>
            </div>
          </div>
        </div>
      </form>

      {/* Sensitive Accounts 2FA Status Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              Account 2FA &amp; Access Status ({displayedUsers.length})
            </h2>
            <p className="text-xs text-gray-500">
              Monitor 2FA enrollment across MD, Directors, Accounts, Super Admin &amp; Financial Report users, or reset 2FA if someone loses their phone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllUsers(!showAllUsers)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 cursor-pointer"
          >
            {showAllUsers ? "Show Sensitive Roles Only" : `Show All Active Users (${users.length})`}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Role / Level</th>
                <th className="py-2.5 px-4">2FA Status</th>
                <th className="py-2.5 px-4">Remote IP / Mobile</th>
                <th className="py-2.5 px-4 text-right">Recovery Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/80">
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-gray-900">
                      {u.name}{" "}
                      {u.employeeId && (
                        <span className="font-mono text-[10px] text-gray-400">
                          ({u.employeeId})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">{u.email}</div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-gray-800">{u.roleName}</div>
                    {u.isSensitive && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-50 text-[#E42528] border border-red-200">
                        Sensitive Role
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    {u.twoFactorEnabled ? (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          2FA Active
                        </span>
                        <span className="block text-[10px] text-gray-400 mt-0.5">
                          {u.backupCodesLeft} backup codes left
                        </span>
                      </div>
                    ) : u.is2faRequired ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        Required — Pending Setup
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                        Optional (Off)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          u.allowRemoteIp
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {u.allowRemoteIp ? "Remote IP Allowed" : "Office IP Only"}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          u.allowMobile
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {u.allowMobile ? "Mobile Allowed" : "Desktop Only"}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {u.twoFactorEnabled ? (
                      <button
                        type="button"
                        disabled={resettingUserId === u.id}
                        onClick={() => handleResetUser2fa(u)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 cursor-pointer disabled:opacity-50"
                      >
                        {resettingUserId === u.id ? "Resetting..." : "Reset 2FA"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Security Events Feed */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              Recent Security &amp; Login Events
            </h2>
            <p className="text-xs text-gray-500">
              Latest sign-ins, 2FA setups, failed attempts, and blocked IP/mobile access.
            </p>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-semibold text-[#E42528] hover:underline"
          >
            Full Audit Trail &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2 px-4">Time</th>
                <th className="py-2 px-4">Event</th>
                <th className="py-2 px-4">User</th>
                <th className="py-2 px-4">Details</th>
                <th className="py-2 px-4">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    No security events recorded yet.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/80">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${badgeColorForAction(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-gray-900">{log.userName}</span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-700 max-w-md">{log.details}</td>
                    <td className="py-2.5 px-4 font-mono text-[10px] text-gray-500 whitespace-nowrap">
                      {log.ip}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

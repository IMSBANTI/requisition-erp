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

interface TrustedDeviceRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userEmpId: string;
  userRole: string;
  deviceLabel: string;
  status: "PENDING" | "APPROVED" | "REVOKED";
  firstIp: string;
  lastIp: string;
  lastSeenAt: string;
  approvedAt: string | null;
  createdAt: string;
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
  devices = [],
  recentLogs,
}: {
  initialPolicy: SecurityPolicyConfig;
  detectedIp: string;
  deviceSummary: string;
  users: SecurityUserRow[];
  devices?: TrustedDeviceRow[];
  recentLogs: SecurityLogRow[];
}) {
  const router = useRouter();
  const { toast, confirmDialog } = useToast();

  // Clean 3-tab layout (eliminates long cluttered vertical stack)
  const [activeTab, setActiveTab] = useState<"SETTINGS" | "DEVICES" | "ACCOUNTS">("SETTINGS");
  const [accountsSubTab, setAccountsSubTab] = useState<"USERS" | "ACTIVITY">("USERS");

  const [ipLockEnabled, setIpLockEnabled] = useState(initialPolicy.ipLockEnabled);
  const [allowedIps, setAllowedIps] = useState<string[]>(initialPolicy.allowedIps);
  const [newIpInput, setNewIpInput] = useState("");
  const [mobileLockEnabled, setMobileLockEnabled] = useState(initialPolicy.mobileLockEnabled);
  const [deviceApprovalEnabled, setDeviceApprovalEnabled] = useState(
    initialPolicy.deviceApprovalEnabled
  );
  const [approvedDeviceSkips2fa, setApprovedDeviceSkips2fa] = useState(
    initialPolicy.approvedDeviceSkips2fa
  );
  const [skip2faOnOfficeIp, setSkip2faOnOfficeIp] = useState(
    initialPolicy.skip2faOnOfficeIp
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
  const [deviceFilter, setDeviceFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REVOKED">("ALL");
  const [deviceBusyId, setDeviceBusyId] = useState<string | null>(null);
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});

  const pendingDevicesCount = useMemo(
    () => devices.filter((d) => d.status === "PENDING").length,
    [devices]
  );
  const approvedDevicesCount = useMemo(
    () => devices.filter((d) => d.status === "APPROVED").length,
    [devices]
  );
  const revokedDevicesCount = useMemo(
    () => devices.filter((d) => d.status === "REVOKED").length,
    [devices]
  );

  const sortedFilteredDevices = useMemo(() => {
    const order = { PENDING: 0, APPROVED: 1, REVOKED: 2 };
    return devices
      .filter((d) => deviceFilter === "ALL" || d.status === deviceFilter)
      .sort((a, b) => {
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      });
  }, [devices, deviceFilter]);

  const sensitiveUsers = useMemo(
    () => users.filter((u) => u.isSensitive || u.is2faRequired || u.twoFactorEnabled),
    [users]
  );
  const displayedUsers = showAllUsers ? users : sensitiveUsers;
  const enrolledSensitiveCount = sensitiveUsers.filter((u) => u.twoFactorEnabled).length;

  function applyPreset(preset: "SMOOTH_OFFICE" | "STRICT" | "MINIMAL") {
    if (preset === "SMOOTH_OFFICE") {
      setDeviceApprovalEnabled(true);
      setApprovedDeviceSkips2fa(true);
      setSkip2faOnOfficeIp(true);
      setEnforce2faSensitive(true);
      setTrustedDeviceDays(30);
      setAllowSuperAdminBypass(true);
      toast.info('Loaded "Smooth Office + Approved Devices" preset. Click Save Settings to apply.');
    } else if (preset === "STRICT") {
      setDeviceApprovalEnabled(true);
      setApprovedDeviceSkips2fa(false);
      setSkip2faOnOfficeIp(false);
      setMobileLockEnabled(true);
      setEnforce2faSensitive(true);
      setTrustedDeviceDays(14);
      setAllowSuperAdminBypass(true);
      toast.info('Loaded "Strict 2FA Everywhere" preset. Click Save Settings to apply.');
    } else {
      setIpLockEnabled(false);
      setMobileLockEnabled(false);
      setDeviceApprovalEnabled(false);
      setEnforce2faSensitive(false);
      setAllowSuperAdminBypass(true);
      toast.info('Loaded "Simple Password Login" preset. Click Save Settings to apply.');
    }
  }

  function handleAddIp(entryRaw?: string) {
    const raw = (entryRaw ?? newIpInput).trim();
    if (!raw) return;
    if (raw === "local") {
      toast.info("Localhost is allowed automatically in dev. Add your public office IP (e.g. 103.x.x.x).");
      return;
    }
    if (allowedIps.includes(raw)) {
      toast.info(`${raw} is already in your Office IP list.`);
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
      toast.error("Add at least one Office IP before enabling Office IP Lock.");
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
          deviceApprovalEnabled,
          approvedDeviceSkips2fa,
          skip2faOnOfficeIp,
          enforce2faSensitive,
          trustedDeviceDays,
          allowSuperAdminBypass,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save security settings.");
        return;
      }
      toast.success("Security settings saved.");
      router.refresh();
    } catch {
      toast.error("Network error while saving settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetUser2fa(u: SecurityUserRow) {
    const ok = await confirmDialog({
      title: "Reset User 2FA",
      message: `Reset 2FA for ${u.name} (${u.email})? They will scan a fresh QR code on next sign-in.`,
      confirmLabel: "Reset 2FA",
      tone: "danger",
    });
    if (!ok) return;

    setResettingUserId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-2fa`, { method: "POST" });
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

  async function handleDeviceAction(
    device: TrustedDeviceRow,
    action: "APPROVE" | "REVOKE" | "DELETE"
  ) {
    if (action === "REVOKE" || action === "DELETE") {
      const ok = await confirmDialog({
        title: action === "REVOKE" ? "Revoke Approved Device" : "Remove Device Record",
        message:
          action === "REVOKE"
            ? `Revoke "${device.deviceLabel}" for ${device.userName}? Their active session on this device will end immediately.`
            : `Delete device record "${device.deviceLabel}" for ${device.userName}?`,
        confirmLabel: action === "REVOKE" ? "Revoke" : "Remove",
        tone: "danger",
      });
      if (!ok) return;
    }

    setDeviceBusyId(device.id);
    try {
      const customLabel = (labelEdits[device.id] ?? device.deviceLabel).trim();
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: device.id,
          action,
          deviceLabel: customLabel || device.deviceLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to update device.");
        return;
      }
      if (action === "APPROVE") {
        toast.success(`Approved "${customLabel || device.deviceLabel}" for ${device.userName}.`);
      } else if (action === "REVOKE") {
        toast.info(`Revoked "${device.deviceLabel}" for ${device.userName}.`);
      } else {
        toast.success("Device removed.");
      }
      router.refresh();
    } catch {
      toast.error("Network error while updating device.");
    } finally {
      setDeviceBusyId(null);
    }
  }

  function badgeColorForAction(action: string) {
    if (action.includes("BLOCKED") || action.includes("FAILED") || action === "DEVICE_REVOKED") {
      return "bg-red-50 text-red-700 border-red-200";
    }
    if (action.includes("2FA_ENABLED") || action === "LOGIN_SUCCESS" || action === "DEVICE_APPROVED") {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (action.includes("RESET") || action.includes("BACKUP") || action.includes("POLICY") || action.includes("DEVICE_")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    return "bg-gray-100 text-gray-800 border-gray-200";
  }

  return (
    <div className="mt-5 space-y-4">
      {/* Compact Top Status Bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Your IP:</span>
            <span className="font-mono font-bold text-gray-900">{detectedIp}</span>
            {detectedIp && detectedIp !== "local" && !allowedIps.includes(detectedIp) && (
              <button
                type="button"
                onClick={() => {
                  handleAddIp(detectedIp);
                  setActiveTab("SETTINGS");
                }}
                className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-50 text-[#E42528] border border-red-200 hover:bg-red-100 cursor-pointer"
              >
                + Add Office IP
              </button>
            )}
          </div>
          <div className="text-gray-500">
            Device: <span className="font-semibold text-gray-800">{deviceSummary}</span>
          </div>
          <div className="text-gray-500">
            Approved Devices:{" "}
            <span className="font-bold text-gray-900">{approvedDevicesCount}</span>
            {pendingDevicesCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDeviceFilter("PENDING");
                  setActiveTab("DEVICES");
                }}
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 cursor-pointer"
              >
                {pendingDevicesCount} pending
              </button>
            )}
          </div>
          <div className="text-gray-500">
            2FA Enrolled:{" "}
            <span className="font-bold text-gray-900">
              {enrolledSensitiveCount}/{sensitiveUsers.length}
            </span>
          </div>
        </div>
      </div>

      {/* Clean 3-Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("SETTINGS")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === "SETTINGS"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            1. Access &amp; 2FA Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("DEVICES")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === "DEVICES"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span>2. Trusted Devices</span>
            {pendingDevicesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-400 text-gray-950">
                {pendingDevicesCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ACCOUNTS")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === "ACCOUNTS"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            3. Accounts &amp; Activity
          </button>
        </div>

        <Link
          href="/admin/users"
          className="text-xs font-semibold text-gray-500 hover:text-[#E42528]"
        >
          Per-user exceptions in Users &amp; Roles &rarr;
        </Link>
      </div>

      {/* ────────────────── TAB 1: COMPACT ACCESS & 2FA RULES ────────────────── */}
      {activeTab === "SETTINGS" && (
        <form
          onSubmit={handleSavePolicy}
          className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden text-xs"
        >
          {/* Quick Presets Strip */}
          <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Quick Presets:
              </span>
              <button
                type="button"
                onClick={() => applyPreset("SMOOTH_OFFICE")}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-gray-300 hover:border-[#E42528] hover:text-[#E42528] text-gray-700 cursor-pointer"
              >
                Smooth Office + Approved Devices
              </button>
              <button
                type="button"
                onClick={() => applyPreset("STRICT")}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-gray-300 hover:border-gray-500 text-gray-700 cursor-pointer"
              >
                Strict 2FA Everywhere
              </button>
              <button
                type="button"
                onClick={() => applyPreset("MINIMAL")}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-gray-300 hover:border-gray-500 text-gray-700 cursor-pointer"
              >
                Simple Password Only
              </button>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {/* Row 1: Office Network IPs */}
            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-4">
                <h3 className="font-bold text-gray-900 text-sm">Office Network (IPs)</h3>
                <p className="text-gray-500 mt-0.5">
                  Add your 4 office public IPs. Lets office logins stay smooth even when switching Chrome/Edge.
                </p>
              </div>
              <div className="lg:col-span-8 space-y-2.5">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 font-semibold text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ipLockEnabled}
                      onChange={(e) => setIpLockEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                    />
                    <span>Restrict Staff to Office IPs</span>
                  </label>
                  <label className="inline-flex items-center gap-2 font-semibold text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skip2faOnOfficeIp}
                      onChange={(e) => setSkip2faOnOfficeIp(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                    />
                    <span>Skip 2FA inside Authorized Office IPs</span>
                  </label>
                </div>

                <div className="flex gap-2 max-w-md">
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

                {allowedIps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {allowedIps.map((entry) => (
                      <span
                        key={entry}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[11px] font-semibold"
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

            {/* Row 2: Devices & Mobile */}
            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-4">
                <h3 className="font-bold text-gray-900 text-sm">Devices &amp; Mobile</h3>
                <p className="text-gray-500 mt-0.5">
                  Approve MD/Director phones &amp; office PCs once; block unknown devices or mobile browsers.
                </p>
              </div>
              <div className="lg:col-span-8 flex flex-wrap gap-x-6 gap-y-2.5 pt-0.5">
                <label className="inline-flex items-center gap-2 font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deviceApprovalEnabled}
                    onChange={(e) => setDeviceApprovalEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span>Require Admin Device Approval</span>
                </label>
                <label className="inline-flex items-center gap-2 font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={approvedDeviceSkips2fa}
                    onChange={(e) => setApprovedDeviceSkips2fa(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span>Approved Devices Skip 2FA</span>
                </label>
                <label className="inline-flex items-center gap-2 font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mobileLockEnabled}
                    onChange={(e) => setMobileLockEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span>Block Mobile Browsers (Staff)</span>
                </label>
              </div>
            </div>

            {/* Row 3: Two-Factor Authentication */}
            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-4">
                <h3 className="font-bold text-gray-900 text-sm">Two-Factor (Authenticator)</h3>
                <p className="text-gray-500 mt-0.5">
                  Applies to Super Admin, MD, Directors, Accounts &amp; Report users on untrusted browsers/IPs.
                </p>
              </div>
              <div className="lg:col-span-8 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enforce2faSensitive}
                    onChange={(e) => setEnforce2faSensitive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#E42528] focus:ring-[#E42528]"
                  />
                  <span>Require 2FA for Sensitive Roles</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Remember browser:</span>
                  <select
                    value={trustedDeviceDays}
                    onChange={(e) => setTrustedDeviceDays(Number(e.target.value))}
                    className="px-2.5 py-1 border border-gray-300 rounded-md bg-white text-xs font-semibold"
                  >
                    <option value={0}>Every login</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Quiet Anti-Lockout Footer */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allowSuperAdminBypass}
                onChange={(e) => setAllowSuperAdminBypass(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-[#E42528]"
              />
              <span>Super Admin anti-lockout safeguard (always allow Super Admin IP/device access)</span>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}

      {/* ────────────────── TAB 2: TRUSTED DEVICES & PENDING APPROVALS ────────────────── */}
      {activeTab === "DEVICES" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Trusted Devices &amp; Pending Approvals
              </h2>
              <p className="text-xs text-gray-500">
                Approve MD/Director phones &amp; office PCs once, or revoke any lost/ex-employee device immediately.
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: "ALL", label: `All (${devices.length})` },
                  { id: "PENDING", label: `Pending (${pendingDevicesCount})` },
                  { id: "APPROVED", label: `Approved (${approvedDevicesCount})` },
                  { id: "REVOKED", label: `Revoked (${revokedDevicesCount})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDeviceFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    deviceFilter === f.id
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Device / Label</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Last IP &amp; Seen</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedFilteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      No devices in this view yet. Devices appear here automatically when users sign in.
                    </td>
                  </tr>
                ) : (
                  sortedFilteredDevices.map((d) => (
                    <tr
                      key={d.id}
                      className={
                        d.status === "PENDING"
                          ? "bg-amber-50/40 hover:bg-amber-50/70"
                          : "hover:bg-gray-50/80"
                      }
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-gray-900">
                          {d.userName}{" "}
                          {d.userEmpId && (
                            <span className="font-mono text-[10px] text-gray-400">
                              ({d.userEmpId})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500">{d.userEmail}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        {d.status === "PENDING" ? (
                          <input
                            type="text"
                            value={labelEdits[d.id] ?? d.deviceLabel}
                            onChange={(e) =>
                              setLabelEdits((prev) => ({
                                ...prev,
                                [d.id]: e.target.value,
                              }))
                            }
                            placeholder="e.g. MD Sami iPhone"
                            className="w-full max-w-[220px] px-2 py-1 border border-amber-300 rounded bg-white text-xs font-medium text-gray-900"
                          />
                        ) : (
                          <span className="font-semibold text-gray-800">{d.deviceLabel}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            d.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : d.status === "PENDING"
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-mono text-[11px] text-gray-700">{d.lastIp}</div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(d.lastSeenAt).toLocaleString("en-GB")}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {d.status !== "APPROVED" && (
                            <button
                              type="button"
                              disabled={deviceBusyId === d.id}
                              onClick={() => handleDeviceAction(d, "APPROVE")}
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                            >
                              Approve
                            </button>
                          )}
                          {d.status !== "REVOKED" && (
                            <button
                              type="button"
                              disabled={deviceBusyId === d.id}
                              onClick={() => handleDeviceAction(d, "REVOKE")}
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 cursor-pointer disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          )}
                          {d.status === "REVOKED" && (
                            <button
                              type="button"
                              disabled={deviceBusyId === d.id}
                              onClick={() => handleDeviceAction(d, "DELETE")}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: ACCOUNTS & SECURITY ACTIVITY ────────────────── */}
      {activeTab === "ACCOUNTS" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAccountsSubTab("USERS")}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer ${
                  accountsSubTab === "USERS"
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                2FA Account Status ({displayedUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setAccountsSubTab("ACTIVITY")}
                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer ${
                  accountsSubTab === "ACTIVITY"
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                Recent Security Activity ({recentLogs.length})
              </button>
            </div>

            {accountsSubTab === "USERS" ? (
              <button
                type="button"
                onClick={() => setShowAllUsers(!showAllUsers)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 cursor-pointer"
              >
                {showAllUsers ? "Sensitive Roles Only" : `Show All Users (${users.length})`}
              </button>
            ) : (
              <Link href="/admin/audit" className="text-xs font-semibold text-[#E42528] hover:underline">
                Full Audit Trail &rarr;
              </Link>
            )}
          </div>

          {accountsSubTab === "USERS" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                    <th className="py-2.5 px-4">User</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">2FA Status</th>
                    <th className="py-2.5 px-4">Access Scope</th>
                    <th className="py-2.5 px-4 text-right">Recovery</th>
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
                      <td className="py-2.5 px-4 text-gray-700">{u.roleName}</td>
                      <td className="py-2.5 px-4">
                        {u.twoFactorEnabled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Active ({u.backupCodesLeft} codes)
                          </span>
                        ) : u.is2faRequired ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Pending Setup
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                            Optional
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-gray-600">
                        {u.allowRemoteIp ? "Any IP" : "Office IP"} ·{" "}
                        {u.allowMobile ? "Desktop & Mobile" : "Desktop Only"}
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
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
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
                        <td className="py-2.5 px-4 font-semibold text-gray-900">
                          {log.userName}
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
          )}
        </div>
      )}
    </div>
  );
}

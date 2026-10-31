"use client";

import { useState, useRef, useEffect } from "react";
import SignaturePad from "signature_pad";

interface ProfileClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    designation: string;
    signature: string | null;
    hasPin: boolean;
    mustChangePassword?: boolean;
    companyName?: string;
    roleName: string;
  };
}

export default function ProfileClient({ user }: ProfileClientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const [signature, setSignature] = useState(user.signature);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [pinError, setPinError] = useState(false);
  const [sigMsg, setSigMsg] = useState("");
  const [loadingSig, setLoadingSig] = useState(false);
  const [loadingPin, setLoadingPin] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState(false);
  const [loadingPw, setLoadingPw] = useState(false);
  const [isDefaultPw, setIsDefaultPw] = useState(user.mustChangePassword ?? true);

  useEffect(() => {
    if (canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, {
        penColor: "#000000",
        backgroundColor: "rgba(255, 255, 255, 0)",
      });
    }
    return () => {
      sigPadRef.current?.off();
    };
  }, []);

  function handleClear() {
    sigPadRef.current?.clear();
  }

  async function handleSaveDrawn() {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setSigMsg("Please draw your signature first.");
      return;
    }
    const dataUrl = sigPadRef.current.toDataURL("image/png");
    await saveSignatureToServer(dataUrl);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await saveSignatureToServer(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function saveSignatureToServer(dataUrl: string) {
    setLoadingSig(true);
    setSigMsg("");
    try {
      const res = await fetch("/api/user/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: dataUrl }),
      });
      if (!res.ok) throw new Error("Failed to save signature");
      setSignature(dataUrl);
      setSigMsg("Digital signature saved successfully!");
      sigPadRef.current?.clear();
    } catch (err: any) {
      setSigMsg(err.message || "Error saving signature");
    } finally {
      setLoadingSig(false);
    }
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg("");
    setPinError(false);
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setPinError(true);
      setPinMsg("PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setPinError(true);
      setPinMsg("PINs do not match.");
      return;
    }

    setLoadingPin(true);
    try {
      const res = await fetch("/api/user/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to set PIN");
      setPinError(false);
      setPinMsg("4-digit signing PIN set successfully!");
      setPin("");
      setConfirmPin("");
    } catch (err: any) {
      setPinError(true);
      setPinMsg(err.message || "Error setting PIN");
    } finally {
      setLoadingPin(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwError(false);

    if (!currentPassword.trim()) {
      setPwError(true);
      setPwMsg("Please enter your current password.");
      return;
    }
    if (newPassword.trim().length < 6) {
      setPwError(true);
      setPwMsg("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(true);
      setPwMsg("New password and confirmation do not match.");
      return;
    }

    setLoadingPw(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }
      setPwError(false);
      setPwMsg("Login password changed successfully!");
      setIsDefaultPw(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(true);
      setPwMsg(err.message || "Error updating password");
    } finally {
      setLoadingPw(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Top Row: Change Login Password & 4-Digit Approval PIN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Change Login Password Card */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
                <span>🔑</span>
                <span>Change Login Password</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer"
              >
                {showPasswords ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Update your account password used to log into the ERP portal.
            </p>

            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
              Password Status:{" "}
              {!isDefaultPw ? (
                <span className="font-semibold text-green-700">✅ Custom password set</span>
              ) : (
                <span className="font-semibold text-amber-700">
                  ⚠️ Using default password ({user.email})
                </span>
              )}
            </div>

            {pwMsg && (
              <div
                className={`mt-3 p-2.5 rounded text-xs font-medium border ${
                  pwError
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-green-50 border-green-200 text-green-800"
                }`}
              >
                {pwError ? "⚠️ " : "✅ "}
                {pwMsg}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Current Password
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  New Password <span className="text-gray-400 font-normal">(min. 6 characters)</span>
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Confirm New Password
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              <button
                type="submit"
                disabled={loadingPw}
                className="w-full py-2 bg-[#E42528] hover:bg-[#B81D20] text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loadingPw ? "Updating Password..." : "Change Password"}
              </button>
            </form>
          </div>
        </div>

        {/* 4-Digit Signing PIN Setup */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
              <span>🔐</span>
              <span>4-Digit Approval PIN</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Confirm your identity instantly when signing requisitions with a 4-digit PIN (or password).
            </p>

            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
              Status:{" "}
              {user.hasPin ? (
                <span className="font-semibold text-green-700">✅ 4-Digit PIN is active</span>
              ) : (
                <span className="font-semibold text-amber-700">⚠️ No PIN set (Default to password)</span>
              )}
            </div>

            {pinMsg && (
              <div
                className={`mt-3 p-2.5 rounded text-xs font-medium border ${
                  pinError
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-green-50 border-green-200 text-green-800"
                }`}
              >
                {pinError ? "⚠️ " : "✅ "}
                {pinMsg}
              </div>
            )}

            <form onSubmit={handleSavePin} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm tracking-widest text-center font-mono focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700">
                  Confirm 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm tracking-widest text-center font-mono focus:ring-[#E42528] focus:border-[#E42528]"
                />
              </div>

              <button
                type="submit"
                disabled={loadingPin}
                className="w-full py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loadingPin ? "Saving PIN..." : "Update Signing PIN"}
              </button>
            </form>
          </div>

          {/* User Snapshot summary */}
          <div className="mt-6 pt-4 border-t border-gray-200 text-[11px] text-gray-500 grid grid-cols-2 gap-1.5">
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Designation:</strong> {user.designation}</p>
            <p><strong>Company:</strong> {user.companyName || "IMS Group"}</p>
          </div>
        </div>
      </div>

      {/* Bottom Row: Signature Setup Card */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
            <span>✍️</span>
            <span>Digital Signature</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            This digital signature will be embedded onto approved and executed vouchers.
          </p>
          {sigMsg && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              {sigMsg}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Current Signature & Upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Current Signature on Record:
            </label>
            {signature ? (
              <div className="h-32 p-3 bg-gray-50 border border-gray-300 rounded-lg shadow-inner flex items-center justify-center">
                <div className="bg-white px-4 py-2 border border-gray-200 rounded shadow-2xs max-w-full">
                  <img
                    src={signature}
                    alt="User Signature"
                    className="h-20 w-auto object-contain mx-auto"
                  />
                </div>
              </div>
            ) : (
              <div className="h-32 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-center text-center">
                ⚠️ You do not have a digital signature saved yet. Please draw or upload one.
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-gray-700">
                Upload Scanned Signature (PNG/JPG):
              </label>
              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleFileUpload}
                className="text-xs text-gray-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
              />
            </div>
          </div>

          {/* Draw Pad */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Or Draw New Signature:
            </label>
            <div className="h-32 border border-gray-300 rounded-lg bg-white overflow-hidden shadow-inner">
              <canvas
                ref={canvasRef}
                width={380}
                height={128}
                className="w-full h-full touch-none cursor-crosshair"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-gray-600 hover:text-gray-900 font-medium px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer"
              >
                Clear Pad
              </button>
              <button
                type="button"
                disabled={loadingSig}
                onClick={handleSaveDrawn}
                className="px-3 py-1.5 bg-[#E42528] hover:bg-[#B81D20] text-white text-xs font-semibold rounded shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loadingSig ? "Saving..." : "Save Drawn Signature"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  users: any[];
  roles: any[];
  companies: any[];
  departments: any[];
  projects: any[];
  isReadOnly: boolean;
}

export default function AdminUsersClient({ users, roles, companies, departments, isReadOnly }: Props) {
  const router = useRouter();

  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [modalType, setModalType] = useState<"PASSWORD" | "EDIT" | null>(null);
  const [newPassword, setNewPassword] = useState("Ims@12345");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
      setMsg("Password reset successfully!");
      setTimeout(() => {
        setModalType(null);
        setMsg("");
      }, 1500);
    } catch (err: any) {
      setMsg(err.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-2.5 px-4">Name / Email</th>
                <th className="py-2.5 px-4">Designation</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Company & Dept</th>
                <th className="py-2.5 px-4 text-center">Sig / PIN</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                {!isReadOnly && <th className="py-2.5 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-bold text-gray-900 block">{u.name}</span>
                    <span className="text-[11px] text-gray-500">{u.email}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-800">{u.designation}</td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800 border border-gray-200">
                      {u.roleName}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-800">{u.companyName}</span>
                    <span className="block text-[10px] text-gray-500">{u.departmentName}</span>
                  </td>
                  <td className="py-3 px-4 text-center space-x-1">
                    <span
                      title={u.hasSignature ? "Signature Active" : "No Signature"}
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        u.hasSignature ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {u.hasSignature ? "✍️ Sig" : "No Sig"}
                    </span>
                    <span
                      title={u.hasPin ? "PIN Active" : "No PIN"}
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        u.hasPin ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {u.hasPin ? "🔐 PIN" : "No PIN"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {!isReadOnly && (
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setModalType("PASSWORD");
                          setNewPassword("Ims@12345");
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        Reset PW
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {modalType === "PASSWORD" && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900">
              Reset Password for {selectedUser.name}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Set a temporary password. The user can change it from their profile.
            </p>

            {msg && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 text-xs text-blue-800 rounded">
                {msg}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">New Password</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs font-mono"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#E42528] hover:bg-[#B81D20] rounded shadow disabled:opacity-50"
                >
                  {loading ? "Resetting..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

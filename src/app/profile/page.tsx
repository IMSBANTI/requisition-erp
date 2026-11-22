import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncDesignationWithLevel } from "@/lib/userDisplay";
import { is2FARequiredForUser } from "@/lib/security";
import { getSecurityPolicy } from "@/lib/securityServer";
import AppShell from "@/components/AppShell";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const user = await requireUser();

  const [fullUser, policy] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        designation: true,
        signature: true,
        pinHash: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
        company: { select: { name: true, code: true } },
        role: { select: { name: true } },
      },
    }),
    getSecurityPolicy(),
  ]);

  if (!fullUser) return null;
  const twoFactorRequired = is2FARequiredForUser(user, policy);

  return (
    <AppShell>
      <div className="p-3 sm:p-6 max-w-5xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
            My Profile, Security &amp; Signature Setup
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your login password, 4-digit approval PIN, Two-Factor Authentication (2FA), and digital signature.
          </p>
        </div>

        <ProfileClient
          user={{
            id: fullUser.id,
            name: fullUser.name,
            email: fullUser.email,
            designation: syncDesignationWithLevel(fullUser.designation, user.levelLabel),
            signature: fullUser.signature,
            hasPin: !!fullUser.pinHash,
            mustChangePassword: fullUser.mustChangePassword,
            twoFactorEnabled: fullUser.twoFactorEnabled,
            twoFactorRequired,
            backupCodesRemaining: (fullUser.twoFactorBackupCodes || []).length,
            companyName: fullUser.company?.name,
            roleName: fullUser.role.name,
          }}
        />
      </div>
    </AppShell>
  );
}

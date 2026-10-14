import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const user = await requireUser();

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      designation: true,
      signature: true,
      pinHash: true,
      company: { select: { name: true, code: true } },
      role: { select: { name: true } },
    },
  });

  if (!fullUser) return null;

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto w-full">
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            My Profile & Signature Setup
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your digital signature and 4-digit PIN for signing requisitions.
          </p>
        </div>

        <ProfileClient
          user={{
            id: fullUser.id,
            name: fullUser.name,
            email: fullUser.email,
            designation: fullUser.designation,
            signature: fullUser.signature,
            hasPin: !!fullUser.pinHash,
            companyName: fullUser.company?.name,
            roleName: fullUser.role.name,
          }}
        />
      </div>
    </AppShell>
  );
}

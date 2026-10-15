import { prisma } from "@/lib/db";

export async function createNotification({
  userId,
  message,
  link,
}: {
  userId: string;
  message: string;
  link?: string;
}) {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        message,
        link,
      },
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

export async function notifyUsers({
  userIds,
  message,
  link,
}: {
  userIds: string[];
  message: string;
  link?: string;
}) {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (!uniqueIds.length) return;
  try {
    return await prisma.notification.createMany({
      data: uniqueIds.map((userId) => ({
        userId,
        message,
        link,
      })),
    });
  } catch (err) {
    console.error("Failed to create notifications:", err);
  }
}

/**
 * Finds user IDs that hold specific permissions (e.g. Accounts or MD pool)
 */
export async function findUsersWithPermission(permission: string): Promise<string[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        OR: [
          { role: { permissions: { has: permission } } },
          { extraPermissions: { has: permission } },
        ],
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  } catch (err) {
    console.error("Failed to find users with permission:", err);
    return [];
  }
}

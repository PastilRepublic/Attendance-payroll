import { prisma } from "@/lib/prisma";

export async function logAudit(params: {
  actorAdminId: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  await prisma.auditLog.create({
    data: {
      actorAdminId: params.actorAdminId,
      action: params.action,
      targetTable: params.targetTable,
      targetId: params.targetId,
      beforeJson: params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before)),
      afterJson: params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after)),
      reason: params.reason,
    },
  });
}

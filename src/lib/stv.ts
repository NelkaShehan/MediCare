import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  batches as batchTable,
  grns,
  indentItems,
  indents,
  stvEvents,
  stvItems,
  stvs,
  transferRequests,
} from "@/db/schema";
import { logAudit } from "@/lib/inventory";
import { makeCode, stvActionsFor } from "@/lib/orders";
import { daysToExpiry, expiryTier, STV_STATE_HINTS, type SessionUser } from "@/lib/shared";

export type TransitionInput = {
  action: string;
  comment?: string;
  receipts?: { itemId: number; acceptedQty: number }[];
};

const NEXT_STATE: Record<string, string> = {
  start_pick: "Picking",
  pack: "Packed & Verified",
  dispatch: "In-Transit",
  deliver: "Delivered",
  post_grn: "GRN Posted",
  exception: "Delivery Exception",
  retry_delivery: "Delivered",
  reject: "Rejected / Quarantined",
  cancel: "Cancelled",
};

export async function transitionStv(user: SessionUser, stvId: number, input: TransitionInput) {
  const [stv] = await db.select().from(stvs).where(eq(stvs.id, stvId)).limit(1);
  if (!stv) throw new Error("STV not found");

  const allowed = stvActionsFor(user, stv).map((a) => a.action);
  if (!allowed.includes(input.action)) {
    throw new Error(`Action "${input.action}" is not permitted from state "${stv.status}" for your role`);
  }
  const newState = NEXT_STATE[input.action];
  if (!newState) throw new Error("Unknown action");

  const items = await db.select().from(stvItems).where(eq(stvItems.stvId, stvId));
  if (items.length === 0) throw new Error("STV has no lines");

  const receiptMap = new Map((input.receipts ?? []).map((r) => [r.itemId, r.acceptedQty]));

  const grnCode = input.action === "post_grn" ? makeCode("GRN") : null;
  let totalAccepted = 0;
  let totalRejected = 0;

  await db.transaction(async (tx) => {
    if (input.action === "start_pick") {
      await tx.update(stvs).set({ status: newState, updatedAt: new Date() }).where(eq(stvs.id, stvId));
    } else if (input.action === "pack") {
      await tx.update(stvs).set({ status: newState, updatedAt: new Date() }).where(eq(stvs.id, stvId));
    } else if (input.action === "dispatch") {
      for (const line of items) {
        if (!line.batchId) throw new Error(`Line ${line.batchNumber} has no source batch`);
        const [batch] = await tx.select().from(batchTable).where(eq(batchTable.id, line.batchId)).limit(1);
        if (!batch) throw new Error(`Source batch ${line.batchNumber} not found`);
        const tier = expiryTier(daysToExpiry(batch.expiryDate));
        if (batch.status !== "available") throw new Error(`Batch ${line.batchNumber} is ${batch.status} — dispatch blocked`);
        if (tier === "red" || tier === "expired") {
          throw new Error(`Batch ${line.batchNumber} is ${tier === "expired" ? "expired" : "near-expiry (red)"} — transfers are locked`);
        }
        const updated = await tx
          .update(batchTable)
          .set({ quantity: sql`${batchTable.quantity} - ${line.quantity}` })
          .where(and(eq(batchTable.id, line.batchId), sql`${batchTable.quantity} >= ${line.quantity}`))
          .returning({ id: batchTable.id });
        if (updated.length === 0) throw new Error(`Insufficient stock in batch ${line.batchNumber}`);
      }
      await tx
        .update(stvs)
        .set({ status: newState, dispatchedAt: new Date(), updatedAt: new Date() })
        .where(eq(stvs.id, stvId));

      if (stv.indentId) {
        const indentLines = await tx.select().from(indentItems).where(eq(indentItems.indentId, stv.indentId));
        for (const line of items) {
          const target = indentLines.find((l) => l.productId === line.productId);
          if (target) {
            await tx
              .update(indentItems)
              .set({ fulfilledQty: sql`${indentItems.fulfilledQty} + ${line.quantity}` })
              .where(eq(indentItems.id, target.id));
          }
        }
      }
    } else if (input.action === "deliver" || input.action === "retry_delivery") {
      await tx
        .update(stvs)
        .set({ status: newState, deliveredAt: new Date(), updatedAt: new Date(), exceptionReason: null })
        .where(eq(stvs.id, stvId));
    } else if (input.action === "exception") {
      if (!input.comment || input.comment.trim().length < 5) {
        throw new Error("A discrepancy reason (min 5 characters) is required");
      }
      await tx
        .update(stvs)
        .set({ status: newState, exceptionReason: input.comment, updatedAt: new Date() })
        .where(eq(stvs.id, stvId));
    } else if (input.action === "reject") {
      // Restore dispatched quantities to source as quarantined.
      for (const line of items) {
        if (line.batchId) {
          await tx
            .update(batchTable)
            .set({ quantity: sql`${batchTable.quantity} + ${line.quantity}`, status: "quarantined" })
            .where(eq(batchTable.id, line.batchId));
        }
      }
      await tx
        .update(stvs)
        .set({ status: newState, exceptionReason: input.comment ?? "Rejected at receiving location", updatedAt: new Date() })
        .where(eq(stvs.id, stvId));
    } else if (input.action === "cancel") {
      await tx.update(stvs).set({ status: newState, updatedAt: new Date() }).where(eq(stvs.id, stvId));
    } else if (input.action === "post_grn") {
      for (const line of items) {
        const accepted = receiptMap.has(line.id) ? Math.max(0, Math.min(line.quantity, Number(receiptMap.get(line.id)))) : line.quantity;
        const rejected = line.quantity - accepted;
        totalAccepted += accepted;
        totalRejected += rejected;

        if (accepted > 0) {
          const [existing] = await tx
            .select()
            .from(batchTable)
            .where(
              and(
                eq(batchTable.productId, line.productId),
                eq(batchTable.locationId, stv.destinationLocationId),
                eq(batchTable.batchNumber, line.batchNumber),
              ),
            )
            .limit(1);

          const expiredLine = daysToExpiry(line.expiryDate) <= 0;
          if (existing) {
            await tx
              .update(batchTable)
              .set({ quantity: sql`${batchTable.quantity} + ${accepted}` })
              .where(eq(batchTable.id, existing.id));
          } else {
            await tx.insert(batchTable).values({
              productId: line.productId,
              locationId: stv.destinationLocationId,
              batchNumber: line.batchNumber,
              expiryDate: line.expiryDate,
              quantity: accepted,
              unitCost: line.unitCost,
              supplier: "Inter-location transfer",
              status: expiredLine ? "quarantined" : "available",
            });
          }
        }

        if (rejected > 0 && line.batchId) {
          await tx
            .update(batchTable)
            .set({ quantity: sql`${batchTable.quantity} + ${rejected}`, status: "quarantined" })
            .where(eq(batchTable.id, line.batchId));
        }

        await tx
          .update(stvItems)
          .set({ acceptedQty: accepted, rejectedQty: rejected })
          .where(eq(stvItems.id, line.id));
      }

      await tx.insert(grns).values({
        code: grnCode!,
        stvId,
        locationId: stv.destinationLocationId,
        receivedBy: user.id,
        receivedByName: user.name,
        note: input.comment ?? "Delivery verified against STV",
        totalAccepted,
        totalRejected,
      });

      await tx
        .update(stvs)
        .set({ status: newState, grnPostedAt: new Date(), updatedAt: new Date() })
        .where(eq(stvs.id, stvId));

      if (stv.indentId) {
        await tx.update(indents).set({ status: "fulfilled" }).where(eq(indents.id, stv.indentId));
      }
      if (stv.transferRequestId) {
        await tx.update(transferRequests).set({ status: "completed" }).where(eq(transferRequests.id, stv.transferRequestId));
      }
    }

    await tx.insert(stvEvents).values({
      stvId,
      userId: user.id,
      userName: user.name,
      previousState: stv.status,
      newState,
      comment: input.comment?.trim() || STV_STATE_HINTS[newState] || null,
    });
  });

  await logAudit({
    user,
    action: `stv.${input.action}`,
    entityType: "stv",
    entityId: stvId,
    details: `${stv.code}: ${stv.status} → ${newState}${totalAccepted ? ` · accepted ${totalAccepted}` : ""}${
      totalRejected ? ` · rejected ${totalRejected}` : ""
    }`,
  });

  return { id: stvId, status: newState, totalAccepted, totalRejected, grnCode };
}



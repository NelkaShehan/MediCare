import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  indentItems,
  indents,
  locations,
  products,
  stvEvents,
  stvItems,
  stvs,
  transferRequestItems,
  transferRequests,
  users,
} from "@/db/schema";
import { allocateFefo } from "@/lib/inventory";
import type { SessionUser } from "@/lib/shared";

export function makeCode(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 12);
  const rand = String(Math.floor(100 + Math.random() * 900));
  return `${prefix}-${stamp}${rand}`;
}

export type ActionDescriptor = { action: string; label: string; tone: "primary" | "danger" | "neutral" };

export function stvActionsFor(user: SessionUser, stv: { status: string; type: string; sourceLocationId: number; destinationLocationId: number }): ActionDescriptor[] {
  const isSource = stv.sourceLocationId === user.locationId;
  const isDest = stv.destinationLocationId === user.locationId;
  const admin = user.role === "central_admin";
  const warehouse = user.role === "warehouse_staff";
  const manager = user.role === "branch_manager";
  const operator = admin || (warehouse && stv.type === "warehouse") || (manager && stv.type === "inter_branch" && isSource);

  switch (stv.status) {
    case "Created":
      return operator
        ? [
            { action: "start_pick", label: "Start picking", tone: "primary" },
            { action: "cancel", label: "Cancel", tone: "neutral" },
          ]
        : [];
    case "Picking":
      return operator
        ? [
            { action: "pack", label: "Pack & verify", tone: "primary" },
            { action: "cancel", label: "Cancel", tone: "neutral" },
          ]
        : [];
    case "Packed & Verified":
      return operator ? [{ action: "dispatch", label: "Dispatch (deduct stock)", tone: "primary" }] : [];
    case "In-Transit":
      return admin || (manager && isDest)
        ? [
            { action: "deliver", label: "Confirm delivery", tone: "primary" },
            { action: "exception", label: "Report discrepancy", tone: "danger" },
          ]
        : [];
    case "Delivered":
      return admin || (manager && isDest) ? [{ action: "post_grn", label: "Post GRN (add stock)", tone: "primary" }] : [];
    case "Delivery Exception":
      return admin || (manager && isDest)
        ? [
            { action: "retry_delivery", label: "Resolve as delivered", tone: "primary" },
            { action: "reject", label: "Reject / quarantine", tone: "danger" },
          ]
        : [];
    default:
      return [];
  }
}

export async function listIndents(user: SessionUser) {
  const scope =
    user.role === "central_admin" || user.role === "warehouse_staff"
      ? undefined
      : eq(indents.branchId, user.locationId ?? -1);

  const rows = await db
    .select({
      id: indents.id,
      code: indents.code,
      branchId: indents.branchId,
      branchName: locations.name,
      requestedByName: indents.requestedByName,
      status: indents.status,
      priority: indents.priority,
      note: indents.note,
      reviewNote: indents.reviewNote,
      createdAt: indents.createdAt,
      reviewedAt: indents.reviewedAt,
    })
    .from(indents)
    .innerJoin(locations, eq(indents.branchId, locations.id))
    .where(scope)
    .orderBy(desc(indents.id));

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: indentItems.id,
          indentId: indentItems.indentId,
          productId: indentItems.productId,
          productName: products.name,
          sku: products.sku,
          uom: products.uom,
          requestedQty: indentItems.requestedQty,
          approvedQty: indentItems.approvedQty,
          fulfilledQty: indentItems.fulfilledQty,
        })
        .from(indentItems)
        .innerJoin(products, eq(indentItems.productId, products.id))
        .where(inArray(indentItems.indentId, ids))
    : [];

  return rows.map((r) => ({ ...r, items: items.filter((i) => i.indentId === r.id) }));
}

export async function listTransfers(user: SessionUser) {
  const scope =
    user.role === "central_admin"
      ? undefined
      : or(eq(transferRequests.fromLocationId, user.locationId ?? -1), eq(transferRequests.toLocationId, user.locationId ?? -1));

  const rows = await db
    .select({
      id: transferRequests.id,
      code: transferRequests.code,
      fromLocationId: transferRequests.fromLocationId,
      toLocationId: transferRequests.toLocationId,
      kind: transferRequests.kind,
      status: transferRequests.status,
      note: transferRequests.note,
      reviewNote: transferRequests.reviewNote,
      requestedByName: transferRequests.requestedByName,
      createdAt: transferRequests.createdAt,
      stvId: transferRequests.stvId,
      reviewedAt: transferRequests.reviewedAt,
    })
    .from(transferRequests)
    .where(scope)
    .orderBy(desc(transferRequests.id));

  const locRows = await db.select({ id: locations.id, name: locations.name, type: locations.type }).from(locations);
  const nameOf = (id: number) => locRows.find((l) => l.id === id)?.name ?? "Unknown";

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: transferRequestItems.id,
          requestId: transferRequestItems.requestId,
          productId: transferRequestItems.productId,
          productName: products.name,
          sku: products.sku,
          uom: products.uom,
          quantity: transferRequestItems.quantity,
        })
        .from(transferRequestItems)
        .innerJoin(products, eq(transferRequestItems.productId, products.id))
        .where(inArray(transferRequestItems.requestId, ids))
    : [];

  return rows.map((r) => ({
    ...r,
    fromName: r.fromLocationId === user.locationId ? "This branch" : nameOf(r.fromLocationId),
    toName: r.toLocationId === user.locationId ? "This branch" : nameOf(r.toLocationId),
    fromLocationName: nameOf(r.fromLocationId),
    toLocationName: nameOf(r.toLocationId),
    items: items.filter((i) => i.requestId === r.id),
  }));
}

export async function listStvs(user: SessionUser, filters: { status?: string; type?: string } = {}) {
  const conditions = [];
  if (user.role !== "central_admin") {
    conditions.push(
      or(eq(stvs.sourceLocationId, user.locationId ?? -1), eq(stvs.destinationLocationId, user.locationId ?? -1)),
    );
  }
  if (filters.status && filters.status !== "all") conditions.push(eq(stvs.status, filters.status));
  if (filters.type && filters.type !== "all") conditions.push(eq(stvs.type, filters.type));

  const rows = await db
    .select({
      id: stvs.id,
      code: stvs.code,
      type: stvs.type,
      status: stvs.status,
      sourceLocationId: stvs.sourceLocationId,
      destinationLocationId: stvs.destinationLocationId,
      createdByName: stvs.createdByName,
      createdAt: stvs.createdAt,
      dispatchedAt: stvs.dispatchedAt,
      deliveredAt: stvs.deliveredAt,
      grnPostedAt: stvs.grnPostedAt,
      notes: stvs.notes,
      indentId: stvs.indentId,
      transferRequestId: stvs.transferRequestId,
    })
    .from(stvs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(stvs.id));

  const locRows = await db.select({ id: locations.id, name: locations.name }).from(locations);
  const nameOf = (id: number) => locRows.find((l) => l.id === id)?.name ?? "Unknown";
  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          stvId: stvItems.stvId,
          quantity: stvItems.quantity,
          acceptedQty: stvItems.acceptedQty,
          rejectedQty: stvItems.rejectedQty,
          productName: products.name,
          uom: products.uom,
        })
        .from(stvItems)
        .innerJoin(products, eq(stvItems.productId, products.id))
        .where(inArray(stvItems.stvId, ids))
    : [];

  return rows.map((r) => {
    const lines = items.filter((i) => i.stvId === r.id);
    return {
      ...r,
      sourceName: nameOf(r.sourceLocationId),
      destinationName: nameOf(r.destinationLocationId),
      lineCount: lines.length,
      totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
      preview: lines.slice(0, 2).map((l) => `${l.productName} × ${l.quantity} ${l.uom}`),
      actions: stvActionsFor(user, r),
    };
  });
}

export async function getStvDetail(user: SessionUser, id: number) {
  const rows = await db.select().from(stvs).where(eq(stvs.id, id)).limit(1);
  const stv = rows[0];
  if (!stv) return null;

  const [source] = await db.select().from(locations).where(eq(locations.id, stv.sourceLocationId)).limit(1);
  const [dest] = await db.select().from(locations).where(eq(locations.id, stv.destinationLocationId)).limit(1);

  const items = await db
    .select({
      id: stvItems.id,
      productId: stvItems.productId,
      productName: products.name,
      sku: products.sku,
      uom: products.uom,
      batchNumber: stvItems.batchNumber,
      expiryDate: stvItems.expiryDate,
      quantity: stvItems.quantity,
      acceptedQty: stvItems.acceptedQty,
      rejectedQty: stvItems.rejectedQty,
      unitCost: stvItems.unitCost,
    })
    .from(stvItems)
    .innerJoin(products, eq(stvItems.productId, products.id))
    .where(eq(stvItems.stvId, id));

  const events = await db
    .select({
      id: stvEvents.id,
      userName: stvEvents.userName,
      previousState: stvEvents.previousState,
      newState: stvEvents.newState,
      comment: stvEvents.comment,
      createdAt: stvEvents.createdAt,
    })
    .from(stvEvents)
    .where(eq(stvEvents.stvId, id))
    .orderBy(stvEvents.id);

  const requestedBy = await db.select({ name: users.name }).from(users).where(eq(users.id, stv.createdBy)).limit(1);

  return {
    ...stv,
    sourceName: source?.name ?? "Unknown",
    destinationName: dest?.name ?? "Unknown",
    createdByName: stv.createdByName || requestedBy[0]?.name || "System",
    items,
    events,
    actions: stvActionsFor(user, stv),
    totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

/** Builds a warehouse pick list from an approved indent, sorted FEFO (earliest expiry first). */
export async function createWarehouseStv(user: SessionUser, indentId: number) {
  const [indent] = await db.select().from(indents).where(eq(indents.id, indentId)).limit(1);
  if (!indent) throw new Error("Indent not found");
  if (indent.status !== "approved") throw new Error("Only approved indents can be picked");

  const lines = await db
    .select()
    .from(indentItems)
    .innerJoin(products, eq(indentItems.productId, products.id))
    .where(eq(indentItems.indentId, indentId));

  const warehouse = await db.select().from(locations).where(eq(locations.type, "warehouse")).limit(1);
  const warehouseId = warehouse[0]?.id;
  if (!warehouseId) throw new Error("No central warehouse configured");

  const allocations = [];
  for (const line of lines) {
    const target = line.indent_items.approvedQty || line.indent_items.requestedQty;
    const result = await allocateFefo(warehouseId, line.indent_items.productId, target);
    allocations.push(...result.allocations);
  }
  if (allocations.length === 0) {
    throw new Error("No transferable warehouse stock available (near-expiry and expired batches are locked)");
  }

  const [stv] = await db
    .insert(stvs)
    .values({
      code: makeCode("STV-WH"),
      type: "warehouse",
      status: "Created",
      sourceLocationId: warehouseId,
      destinationLocationId: indent.branchId,
      indentId: indent.id,
      createdBy: user.id,
      createdByName: user.name,
      notes: `Pick list generated from ${indent.code} using FEFO.`,
    })
    .returning({ id: stvs.id, code: stvs.code });

  await db.insert(stvItems).values(
    allocations.map((a) => ({
      stvId: stv.id,
      productId: a.productId,
      batchId: a.batchId,
      batchNumber: a.batchNumber,
      expiryDate: a.expiryDate,
      uom: a.uom,
      quantity: a.quantity,
      unitCost: a.unitCost,
    })),
  );

  await db.insert(stvEvents).values({
    stvId: stv.id,
    userId: user.id,
    userName: user.name,
    previousState: null,
    newState: "Created",
    comment: `Pick list generated from ${indent.code}; batches sorted by earliest expiry (FEFO).`,
  });

  return stv;
}

/** Creates the inter-branch STV when central admin approves a transfer request. */
export async function createInterBranchStv(user: SessionUser, requestId: number) {
  const [request] = await db.select().from(transferRequests).where(eq(transferRequests.id, requestId)).limit(1);
  if (!request) throw new Error("Transfer request not found");

  const lines = await db
    .select()
    .from(transferRequestItems)
    .innerJoin(products, eq(transferRequestItems.productId, products.id))
    .where(eq(transferRequestItems.requestId, requestId));

  const allocations = [];
  for (const line of lines) {
    const result = await allocateFefo(request.fromLocationId, line.transfer_request_items.productId, line.transfer_request_items.quantity);
    if (result.shortfall > 0) {
      throw new Error(
        `Insufficient transferable stock for ${line.products.name} at source (need ${line.transfer_request_items.quantity}, available ${result.allocated}). Near-expiry/expired batches are locked.`,
      );
    }
    allocations.push(...result.allocations);
  }
  if (allocations.length === 0) throw new Error("No transferable stock available at the source location");

  const source = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, request.fromLocationId)).limit(1);

  const [stv] = await db
    .insert(stvs)
    .values({
      code: makeCode("STV-IB"),
      type: "inter_branch",
      status: "Created",
      sourceLocationId: request.fromLocationId,
      destinationLocationId: request.toLocationId,
      transferRequestId: request.id,
      createdBy: request.requestedBy,
      createdByName: source[0]?.name ?? "Branch",
      notes: `Inter-branch transfer from ${request.code}. ${request.note ?? ""}`.trim(),
    })
    .returning({ id: stvs.id });

  await db.insert(stvItems).values(
    allocations.map((a) => ({
      stvId: stv.id,
      productId: a.productId,
      batchId: a.batchId,
      batchNumber: a.batchNumber,
      expiryDate: a.expiryDate,
      uom: a.uom,
      quantity: a.quantity,
      unitCost: a.unitCost,
    })),
  );

  await db.insert(stvEvents).values({
    stvId: stv.id,
    userId: user.id,
    userName: user.name,
    previousState: null,
    newState: "Created",
    comment: `Central admin approved ${request.code}. Source branch to pick & dispatch (FEFO).`,
  });

  await db.update(transferRequests).set({ stvId: stv.id }).where(eq(transferRequests.id, request.id));
  return stv;
}

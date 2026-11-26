import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  alerts,
  auditLogs,
  automationRuns,
  batches,
  eodSheets,
  grns,
  indentItems,
  indents,
  locations,
  products,
  stockOuts,
  stockReturnItems,
  stockReturns,
  stvEvents,
  stvItems,
  stvs,
  transferRequestItems,
  transferRequests,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { runAutomation } from "@/lib/alerts";

/** Primary administrator account. Extra users are created from Users & roles. */
export const ADMIN_NAME = "Nelka Shehan";
export const ADMIN_EMAIL = "nelkasehan@gmail.com";
export const ADMIN_PASSWORD = "nelka123";
export const DEMO_PASSWORD = ADMIN_PASSWORD;

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

function offsetDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

function addDays(n: number) {
  return new Date(Date.now() + n * 86_400_000);
}

async function doSeed() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  /* ---------------- Locations ---------------- */
  const locationRows = await db
    .insert(locations)
    .values([
      {
        code: "WH-CENTRAL",
        name: "Central Warehouse",
        type: "warehouse",
        address: "Plot 42, Sundar Industrial Estate, Lahore",
        phone: "+92 42 3512 9000",
      },
      {
        code: "BR-A",
        name: "Branch A — Gulberg",
        type: "branch",
        address: "12-C MM Alam Road, Gulberg III, Lahore",
        phone: "+92 42 3578 1122",
      },
      {
        code: "BR-B",
        name: "Branch B — DHA",
        type: "branch",
        address: "Sector Y, DHA Phase 3, Lahore",
        phone: "+92 42 3569 4455",
      },
    ])
    .returning({ id: locations.id, code: locations.code });

  const loc = (code: string) => locationRows.find((l) => l.code === code)!.id;
  const whId = loc("WH-CENTRAL");
  const branchA = loc("BR-A");
  const branchB = loc("BR-B");

  /* ---------------- Users ----------------
   * Clean slate: only the primary administrator is seeded. Additional users
   * and their roles are created from Users & roles (Central Admin only).
   */
  const [admin] = await db
    .insert(users)
    .values({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: "central_admin",
      locationId: whId,
      phone: "+94 77 000 0000",
    })
    .returning({ id: users.id, email: users.email });

  const adminId = admin.id;

  /* ---------------- Product master ---------------- */
  const productSeed = [
    { sku: "PCM-500", name: "Paracetamol 500mg", genericName: "Paracetamol", category: "Analgesic", uom: "Tablet", packSize: 10, unitPrice: 12, reorderLevel: 600 },
    { sku: "AMX-500", name: "Amoxicillin 500mg", genericName: "Amoxicillin", category: "Antibiotic", uom: "Capsule", packSize: 10, unitPrice: 28, reorderLevel: 400 },
    { sku: "OMP-20", name: "Omeprazole 20mg", genericName: "Omeprazole", category: "Gastro", uom: "Capsule", packSize: 14, unitPrice: 22, reorderLevel: 350 },
    { sku: "MET-500", name: "Metformin 500mg", genericName: "Metformin HCl", category: "Antidiabetic", uom: "Tablet", packSize: 10, unitPrice: 15, reorderLevel: 450 },
    { sku: "AML-5", name: "Amlodipine 5mg", genericName: "Amlodipine", category: "Cardiovascular", uom: "Tablet", packSize: 10, unitPrice: 18, reorderLevel: 400 },
    { sku: "CET-10", name: "Cetirizine 10mg", genericName: "Cetirizine", category: "Antihistamine", uom: "Tablet", packSize: 10, unitPrice: 9, reorderLevel: 300 },
    { sku: "SAL-INH", name: "Salbutamol Inhaler 100mcg", genericName: "Salbutamol", category: "Respiratory", uom: "Box", packSize: 1, unitPrice: 480, reorderLevel: 60 },
    { sku: "INS-GLA", name: "Insulin Glargine 100IU", genericName: "Insulin Glargine", category: "Antidiabetic", uom: "Vial", packSize: 1, unitPrice: 1450, reorderLevel: 50 },
    { sku: "CEF-1G", name: "Ceftriaxone 1g Injection", genericName: "Ceftriaxone", category: "Antibiotic", uom: "Injection", packSize: 1, unitPrice: 340, reorderLevel: 120 },
    { sku: "ORS-001", name: "ORS Electrolyte Sachet", genericName: "Oral Rehydration Salt", category: "Electrolyte", uom: "Sachet", packSize: 1, unitPrice: 35, reorderLevel: 250 },
    { sku: "DIC-GEL", name: "Diclofenac Gel 1%", genericName: "Diclofenac Sodium", category: "Topical", uom: "Tube", packSize: 1, unitPrice: 160, reorderLevel: 100 },
    { sku: "MVT-SYR", name: "Multivitamin Syrup 200ml", genericName: "Multivitamins", category: "Supplement", uom: "Bottle", packSize: 1, unitPrice: 210, reorderLevel: 80 },
  ];

  const productRows = await db
    .insert(products)
    .values(productSeed.map((p) => ({ ...p, fastMovingThreshold: 60 })))
    .returning({ id: products.id, sku: products.sku, name: products.name, uom: products.uom, unitPrice: products.unitPrice });
  const pid = (sku: string) => productRows.find((p) => p.sku === sku)!.id;
  const productBySku = new Map(productRows.map((p) => [p.sku, p]));

  /* ---------------- Batches (5 expiry windows) ---------------- */
  const windows = [
    { tag: "EXP", days: -20, qty: 60 },
    { tag: "N15", days: 15, qty: 90 },
    { tag: "N75", days: 75, qty: 150 },
    { tag: "N150", days: 150, qty: 240 },
    { tag: "N365", days: 365, qty: 520 },
  ];

  type BatchInsert = typeof batches.$inferInsert;
  const batchInserts: BatchInsert[] = [];
  for (const p of productSeed) {
    for (const w of windows) {
      batchInserts.push({
        productId: pid(p.sku),
        locationId: whId,
        batchNumber: `${w.tag}-${p.sku}-${String(1000 + Math.floor(Math.random() * 8999))}`,
        expiryDate: offsetDate(w.days),
        quantity: w.qty,
        unitCost: p.unitPrice,
        supplier: w.days < 0 ? "MedSupply Intl." : "Getz Pharma Distribution",
        status: "available",
        receivedAt: daysAgo(Math.max(5, 200 - w.days)),
      });
    }
  }

  const branchStock: { sku: string; locationId: number; days: number; qty: number }[] = [
    // Branch A — fast movers: Paracetamol, Cetirizine; slow: Diclofenac, Multivitamin, Amoxicillin
    { sku: "PCM-500", locationId: branchA, days: 365, qty: 260 },
    { sku: "PCM-500", locationId: branchA, days: 150, qty: 90 },
    { sku: "CET-10", locationId: branchA, days: 365, qty: 140 },
    { sku: "OMP-20", locationId: branchA, days: 365, qty: 120 },
    { sku: "AML-5", locationId: branchA, days: 15, qty: 30 },
    { sku: "AMX-500", locationId: branchA, days: 75, qty: 55 },
    { sku: "DIC-GEL", locationId: branchA, days: 150, qty: 48 },
    { sku: "MVT-SYR", locationId: branchA, days: 150, qty: 34 },
    { sku: "PCM-500", locationId: branchA, days: -10, qty: 25 },
    // Branch B — fast movers: Amoxicillin, Paracetamol, Metformin
    { sku: "AMX-500", locationId: branchB, days: 365, qty: 220 },
    { sku: "PCM-500", locationId: branchB, days: 365, qty: 190 },
    { sku: "MET-500", locationId: branchB, days: 365, qty: 160 },
    { sku: "ORS-001", locationId: branchB, days: 150, qty: 110 },
    { sku: "CEF-1G", locationId: branchB, days: 75, qty: 45 },
    { sku: "INS-GLA", locationId: branchB, days: 75, qty: 14 },
    { sku: "SAL-INH", locationId: branchB, days: 150, qty: 18 },
  ];

  for (const b of branchStock) {
    const p = productBySku.get(b.sku)!;
    batchInserts.push({
      productId: p.id,
      locationId: b.locationId,
      batchNumber: `${b.days < 0 ? "EXP" : "BR"}-${b.sku}-${b.locationId === branchA ? "A" : "B"}-${Math.floor(100 + Math.random() * 899)}`,
      expiryDate: offsetDate(b.days),
      quantity: b.qty,
      unitCost: p.unitPrice,
      supplier: "Getz Pharma Distribution",
      status: b.days < 0 ? "quarantined" : "available",
      receivedAt: daysAgo(40),
    });
  }

  await db.insert(batches).values(batchInserts);
  const allBatches = await db.select().from(batches);

  /* ---------------- Dispensing history (velocity) ---------------- */
  type Group = { locationId: number; sku: string; total: number };
  const dispensed: Group[] = [
    { locationId: branchA, sku: "PCM-500", total: 168 },
    { locationId: branchA, sku: "CET-10", total: 96 },
    { locationId: branchA, sku: "OMP-20", total: 42 },
    { locationId: branchA, sku: "AMX-500", total: 9 },
    { locationId: branchA, sku: "DIC-GEL", total: 7 },
    { locationId: branchA, sku: "MVT-SYR", total: 4 },
    { locationId: branchB, sku: "AMX-500", total: 144 },
    { locationId: branchB, sku: "PCM-500", total: 102 },
    { locationId: branchB, sku: "MET-500", total: 54 },
    { locationId: branchB, sku: "ORS-001", total: 48 },
    { locationId: branchB, sku: "CEF-1G", total: 18 },
    { locationId: branchB, sku: "SAL-INH", total: 6 },
    { locationId: branchB, sku: "INS-GLA", total: 5 },
  ];

  let stockOutSeq = 0;
  for (const group of dispensed) {
    const product = productBySku.get(group.sku)!;
    const pharmacist = adminId;
    const pharmacistName = `${ADMIN_NAME} (admin import)`;
    const locationName = group.locationId === branchA ? "Branch A — Gulberg" : "Branch B — DHA";
    const available = allBatches
      .filter((b) => b.locationId === group.locationId && b.productId === product.id && b.quantity > 0 && b.status === "available")
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    let remaining = group.total;
    let chunkIndex = 0;
    while (remaining > 0 && available.length > 0) {
      const batch = available[0];
      const take = Math.min(remaining, batch.quantity, Math.max(3, Math.ceil(group.total / 3)));
      if (take <= 0) break;
      const qty = Math.min(take, remaining);
      batch.quantity -= qty;
      remaining -= qty;
      stockOutSeq += 1;
      await db.insert(stockOuts).values({
        code: `SO-${String(stockOutSeq).padStart(4, "0")}`,
        locationId: group.locationId,
        productId: product.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: qty,
        uom: product.uom,
        pharmacistId: pharmacist,
        pharmacistName,
        reference: `${locationName.split(" ")[1]}-RX-${1000 + stockOutSeq}`,
        note: "Seed dispensing record",
        createdAt: daysAgo(chunkIndex * 3 + (group.locationId === branchA ? 1 : 2)),
      });
      if (batch.quantity <= 0) available.shift();
      else if (remaining <= 0) break;
      else chunkIndex += 1;
      if (chunkIndex > 8) break;
    }
    // persist deducted quantities
    for (const b of allBatches.filter((x) => x.locationId === group.locationId && x.productId === product.id)) {
      await db.update(batches).set({ quantity: b.quantity }).where(eq(batches.id, b.id));
    }
  }

  /* ---------------- Indents ---------------- */
  const [indentA] = await db
    .insert(indents)
    .values({
      code: "IND-1001",
      branchId: branchA,
      requestedBy: adminId,
      requestedByName: ADMIN_NAME,
      status: "pending",
      priority: "normal",
      note: "Weekly replenishment for OPD counter. Paracetamol running low.",
      createdAt: daysAgo(2),
    })
    .returning({ id: indents.id });

  await db.insert(indentItems).values([
    { indentId: indentA.id, productId: pid("PCM-500"), requestedQty: 300, approvedQty: 0, fulfilledQty: 0 },
    { indentId: indentA.id, productId: pid("OMP-20"), requestedQty: 150, approvedQty: 0, fulfilledQty: 0 },
    { indentId: indentA.id, productId: pid("AML-5"), requestedQty: 120, approvedQty: 0, fulfilledQty: 0 },
  ]);

  const [indentB] = await db
    .insert(indents)
    .values({
      code: "IND-1002",
      branchId: branchB,
      requestedBy: adminId,
      requestedByName: ADMIN_NAME,
      status: "approved",
      priority: "normal",
      note: "Monthly replenishment.",
      reviewNote: "Approved — ample warehouse stock for all lines.",
      reviewedBy: adminId,
      reviewedAt: daysAgo(1),
      createdAt: daysAgo(3),
    })
    .returning({ id: indents.id });

  await db.insert(indentItems).values([
    { indentId: indentB.id, productId: pid("AMX-500"), requestedQty: 240, approvedQty: 240, fulfilledQty: 0 },
    { indentId: indentB.id, productId: pid("ORS-001"), requestedQty: 180, approvedQty: 180, fulfilledQty: 0 },
    { indentId: indentB.id, productId: pid("INS-GLA"), requestedQty: 20, approvedQty: 20, fulfilledQty: 0 },
  ]);

  const [indentA2] = await db
    .insert(indents)
    .values({
      code: "IND-1003",
      branchId: branchA,
      requestedBy: adminId,
      requestedByName: ADMIN_NAME,
      status: "rejected",
      priority: "emergency",
      note: "Emergency — dengue season spike in Cetirizine demand.",
      reviewNote: "Rejected: Branch B holds surplus; raised inter-branch offer instead.",
      reviewedBy: adminId,
      reviewedAt: daysAgo(4),
      createdAt: daysAgo(5),
    })
    .returning({ id: indents.id });

  await db.insert(indentItems).values([
    { indentId: indentA2.id, productId: pid("CET-10"), requestedQty: 400, approvedQty: 0, fulfilledQty: 0 },
  ]);

  /* ---------------- Inter-branch requests ---------------- */
  const [transfer1] = await db
    .insert(transferRequests)
    .values({
      code: "IBT-2001",
      fromLocationId: branchA,
      toLocationId: branchB,
      kind: "offer",
      requestedBy: adminId,
      requestedByName: ADMIN_NAME,
      status: "pending",
      note: "Diclofenac Gel and Multivitamin Syrup are slow-moving here. Offering to Branch B where seasonal demand is higher.",
      createdAt: daysAgo(1),
    })
    .returning({ id: transferRequests.id });

  await db.insert(transferRequestItems).values([
    { requestId: transfer1.id, productId: pid("DIC-GEL"), quantity: 20 },
    { requestId: transfer1.id, productId: pid("MVT-SYR"), quantity: 15 },
  ]);

  const [transfer2] = await db
    .insert(transferRequests)
    .values({
      code: "IBT-2002",
      fromLocationId: branchB,
      toLocationId: branchA,
      kind: "request",
      requestedBy: adminId,
      requestedByName: ADMIN_NAME,
      status: "approved",
      note: "Requesting Paracetamol surplus from Branch B to cover OPD demand.",
      reviewNote: "Approved — Branch B holds >190 units. STV generated at source.",
      reviewedBy: adminId,
      reviewedAt: daysAgo(1),
      createdAt: daysAgo(2),
    })
    .returning({ id: transferRequests.id });

  await db.insert(transferRequestItems).values([
    { requestId: transfer2.id, productId: pid("PCM-500"), quantity: 60 },
  ]);

  /* ---------------- STVs (pipeline showcase) ---------------- */
  const stvSeq: { code: string; type: string; status: string; source: number; dest: number; createdBy: number; createdByName: string; createdAt: Date; indentId?: number; transferRequestId?: number; dispatchedAt?: Date; deliveredAt?: Date }[] = [
    {
      code: "STV-WH-3001",
      type: "warehouse",
      status: "In-Transit",
      source: whId,
      dest: branchA,
      createdBy: adminId,
      createdByName: ADMIN_NAME,
      createdAt: daysAgo(3),
      dispatchedAt: daysAgo(1),
    },
    {
      code: "STV-IB-3002",
      type: "inter_branch",
      status: "Delivered",
      source: branchB,
      dest: branchA,
      createdBy: adminId,
      createdByName: ADMIN_NAME,
      createdAt: daysAgo(2),
      transferRequestId: transfer2.id,
      dispatchedAt: daysAgo(1),
      deliveredAt: daysAgo(0),
    },
    {
      code: "STV-WH-3003",
      type: "warehouse",
      status: "Created",
      source: whId,
      dest: branchB,
      createdBy: adminId,
      createdByName: ADMIN_NAME,
      createdAt: new Date(),
      indentId: indentB.id,
    },
  ];

  for (const s of stvSeq) {
    const [stv] = await db
      .insert(stvs)
      .values({
        code: s.code,
        type: s.type,
        status: s.status,
        sourceLocationId: s.source,
        destinationLocationId: s.dest,
        indentId: s.indentId ?? null,
        transferRequestId: s.transferRequestId ?? null,
        createdBy: s.createdBy,
        createdByName: s.createdByName,
        notes: s.type === "warehouse" ? "Warehouse replenishment dispatch." : "Inter-branch redistribution.",
        dispatchedAt: s.dispatchedAt ?? null,
        deliveredAt: s.deliveredAt ?? null,
        createdAt: s.createdAt,
      })
      .returning({ id: stvs.id });

    const picked: { sku: string; qty: number }[] =
      s.code === "STV-WH-3001"
        ? [
            { sku: "PCM-500", qty: 120 },
            { sku: "OMP-20", qty: 60 },
          ]
        : s.code === "STV-IB-3002"
          ? [{ sku: "PCM-500", qty: 60 }]
          : [
              { sku: "AMX-500", qty: 240 },
              { sku: "ORS-001", qty: 180 },
            ];

    for (const line of picked) {
      const product = productBySku.get(line.sku)!;
      const pool = allBatches
        .filter((b) => b.locationId === s.source && b.productId === product.id && b.quantity > 0 && b.status === "available")
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      if (pool.length === 0) continue;
      let remaining = line.qty;
      for (const batch of pool) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.quantity);
        const isDispatchedOrLater = s.status !== "Created";
        if (isDispatchedOrLater) {
          batch.quantity -= take;
          await db.update(batches).set({ quantity: batch.quantity }).where(eq(batches.id, batch.id));
        }
        await db.insert(stvItems).values({
          stvId: stv.id,
          productId: product.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          uom: product.uom,
          quantity: take,
          acceptedQty: 0,
          rejectedQty: 0,
          unitCost: batch.unitCost,
        });
        remaining -= take;
      }
    }

    const history: { prev: string | null; next: string; comment: string; at: Date; by: string }[] = [
      { prev: null, next: "Created", comment: "Pick list generated (FEFO ordering).", at: s.createdAt, by: s.createdByName },
    ];
    if (s.status !== "Created") {
      history.push({ prev: "Created", next: "Picking", comment: "Storekeeper started picking earliest-expiry batches.", at: s.createdAt, by: s.createdByName });
      history.push({ prev: "Picking", next: "Packed & Verified", comment: "All lines packed and verified against pick list.", at: s.createdAt, by: s.createdByName });
      history.push({ prev: "Packed & Verified", next: "In-Transit", comment: "Dispatched. Source stock deducted — destination not yet increased.", at: s.dispatchedAt!, by: s.createdByName });
    }
    if (s.status === "Delivered") {
      history.push({ prev: "In-Transit", next: "Delivered", comment: "Receiving manager confirmed physical delivery.", at: s.deliveredAt!, by: ADMIN_NAME });
    }
    for (const h of history) {
      await db.insert(stvEvents).values({
        stvId: stv.id,
        userId: s.createdBy,
        userName: h.by,
        previousState: h.prev,
        newState: h.next,
        comment: h.comment,
        createdAt: h.at,
      });
    }
  }

  /* ---------------- GRN history ---------------- */
  await db.insert(grns).values({
    code: "GRN-4001",
    stvId: (await db.select({ id: stvs.id }).from(stvs).where(eq(stvs.code, "STV-IB-3002")).limit(1))[0].id,
    locationId: branchA,
    receivedBy: adminId,
    receivedByName: ADMIN_NAME,
    note: "All 60 units accepted. Batch verified.",
    totalAccepted: 60,
    totalRejected: 0,
    createdAt: daysAgo(0),
  });

  /* ---------------- Expired stock return ---------------- */
  const expiredBranchBatch = allBatches.find(
    (b) => b.locationId === branchA && b.expiryDate < new Date().toISOString().slice(0, 10),
  );
  const [ret] = await db
    .insert(stockReturns)
    .values({
      code: "RTN-5001",
      locationId: branchA,
      createdBy: adminId,
      createdByName: ADMIN_NAME,
      status: "pending",
      note: "Expired Paracetamol identified during EOD count. Awaiting warehouse disposal.",
      createdAt: daysAgo(1),
    })
    .returning({ id: stockReturns.id });

  if (expiredBranchBatch) {
    await db.insert(stockReturnItems).values({
      returnId: ret.id,
      batchId: expiredBranchBatch.id,
      productId: expiredBranchBatch.productId,
      batchNumber: expiredBranchBatch.batchNumber,
      expiryDate: expiredBranchBatch.expiryDate,
      quantity: expiredBranchBatch.quantity,
      reason: "Expired — hard locked, disposal only",
    });
  }

  /* ---------------- EOD sheet (yesterday, reconciled) ---------------- */
  await db.insert(eodSheets).values({
    locationId: branchA,
    sheetDate: offsetDate(-1),
    status: "reconciled",
    totalDispensed: 24,
    totalLines: 6,
    notes: "Counted against physical shelf. No variance.",
    reconciledBy: adminId,
    reconciledByName: ADMIN_NAME,
    reconciledAt: daysAgo(1),
  });

  await db.insert(auditLogs).values([
    { userId: adminId, userName: ADMIN_NAME, action: "indent.approve", entityType: "indent", entityId: indentB.id, details: "Approved IND-1002 for Branch B", createdAt: addDays(-1) },
    { userId: adminId, userName: ADMIN_NAME, action: "stv.dispatch", entityType: "stv", entityId: 1, details: "Dispatched STV-WH-3001 to Branch A", createdAt: addDays(-1) },
    { userId: adminId, userName: ADMIN_NAME, action: "stv.deliver", entityType: "stv", entityId: 2, details: "Confirmed delivery of STV-IB-3002", createdAt: new Date() },
    { userId: adminId, userName: ADMIN_NAME, action: "transfer.offer", entityType: "transfer", entityId: transfer1.id, details: "Offered slow-moving stock to Branch B", createdAt: addDays(-1) },
    { userId: adminId, userName: ADMIN_NAME, action: "stock-out.create", entityType: "stock_out", entityId: 1, details: "Historical dispensing import (FEFO batch)", createdAt: new Date() },
  ]);

  await runAutomation("seed", {
    id: adminId,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    role: "central_admin",
    locationId: whId,
    locationName: "Central Warehouse",
    locationType: "warehouse",
  });
}

/** Used by the seed API route to force a rebuild of demo data (admin only). */
export async function reseedDemoData() {
  await db.delete(stockReturnItems);
  await db.delete(stockReturns);
  await db.delete(stvEvents);
  await db.delete(grns);
  await db.delete(stvItems);
  await db.delete(stvs);
  await db.delete(transferRequestItems);
  await db.delete(transferRequests);
  await db.delete(indentItems);
  await db.delete(indents);
  await db.delete(stockOuts);
  await db.delete(eodSheets);
  await db.delete(alerts);
  await db.delete(automationRuns);
  await db.delete(auditLogs);
  await db.delete(batches);
  await db.delete(products);
  await db.delete(users);
  await db.delete(locations);
  seedPromise = null;
  await ensureSeeded();
}

export async function countInventoryScopes() {
  const rows = await db
    .select({ locationId: batches.locationId, total: sql<number>`sum(${batches.quantity})`.mapWith(Number) })
    .from(batches)
    .where(and(inArray(batches.status, ["available", "quarantined"]), sql`${batches.quantity} > 0`))
    .groupBy(batches.locationId)
    .orderBy(asc(batches.locationId));
  return rows;
}

export async function unexpiredBatches(productId: number, locationId: number) {
  return db
    .select()
    .from(batches)
    .where(and(eq(batches.productId, productId), eq(batches.locationId, locationId), eq(batches.status, "available")))
    .orderBy(asc(batches.expiryDate));
}

import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Master data                                                         */
/* ------------------------------------------------------------------ */

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull().default("branch"), // warehouse | branch
  address: text("address"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // central_admin | warehouse_staff | branch_manager | pharmacist
  locationId: integer("location_id").references(() => locations.id),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  genericName: text("generic_name"),
  category: text("category").notNull().default("General"),
  uom: text("uom").notNull().default("Tablet"),
  packSize: integer("pack_size").notNull().default(1),
  unitPrice: integer("unit_price").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(100),
  fastMovingThreshold: integer("fast_moving_threshold").notNull().default(60),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Inventory batches (batch = stock at one location)                   */
/* ------------------------------------------------------------------ */

export const batches = pgTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    batchNumber: text("batch_number").notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    unitCost: integer("unit_cost").notNull().default(0),
    supplier: text("supplier"),
    status: text("status").notNull().default("available"), // available | quarantined | disposed
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("batches_product_location_batch_uq").on(t.productId, t.locationId, t.batchNumber),
    index("batches_location_idx").on(t.locationId),
  ],
);

/* ------------------------------------------------------------------ */
/* Warehouse indents                                                   */
/* ------------------------------------------------------------------ */

export const indents = pgTable("indents", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  branchId: integer("branch_id")
    .notNull()
    .references(() => locations.id),
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => users.id),
  requestedByName: text("requested_by_name").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | fulfilled | cancelled
  priority: text("priority").notNull().default("normal"), // normal | emergency
  note: text("note"),
  reviewNote: text("review_note"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const indentItems = pgTable("indent_items", {
  id: serial("id").primaryKey(),
  indentId: integer("indent_id")
    .notNull()
    .references(() => indents.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  requestedQty: integer("requested_qty").notNull(),
  approvedQty: integer("approved_qty").notNull().default(0),
  fulfilledQty: integer("fulfilled_qty").notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* Inter-branch stock sharing                                          */
/* ------------------------------------------------------------------ */

export const transferRequests = pgTable("transfer_requests", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  fromLocationId: integer("from_location_id")
    .notNull()
    .references(() => locations.id),
  toLocationId: integer("to_location_id")
    .notNull()
    .references(() => locations.id),
  kind: text("kind").notNull().default("request"), // request | offer
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => users.id),
  requestedByName: text("requested_by_name").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | completed | cancelled
  note: text("note"),
  reviewNote: text("review_note"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  stvId: integer("stv_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transferRequestItems = pgTable("transfer_request_items", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .references(() => transferRequests.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
});

/* ------------------------------------------------------------------ */
/* Stock Transfer Vouchers + audit trail                               */
/* ------------------------------------------------------------------ */

export const stvs = pgTable("stvs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("warehouse"), // warehouse | inter_branch
  status: text("status").notNull().default("Created"),
  sourceLocationId: integer("source_location_id")
    .notNull()
    .references(() => locations.id),
  destinationLocationId: integer("destination_location_id")
    .notNull()
    .references(() => locations.id),
  indentId: integer("indent_id").references(() => indents.id),
  transferRequestId: integer("transfer_request_id").references(() => transferRequests.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdByName: text("created_by_name").notNull().default(""),
  notes: text("notes"),
  exceptionReason: text("exception_reason"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  grnPostedAt: timestamp("grn_posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stvItems = pgTable("stv_items", {
  id: serial("id").primaryKey(),
  stvId: integer("stv_id")
    .notNull()
    .references(() => stvs.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  batchId: integer("batch_id").references(() => batches.id),
  batchNumber: text("batch_number").notNull(),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  uom: text("uom").notNull().default("Tablet"),
  quantity: integer("quantity").notNull(),
  acceptedQty: integer("accepted_qty").notNull().default(0),
  rejectedQty: integer("rejected_qty").notNull().default(0),
  unitCost: integer("unit_cost").notNull().default(0),
});

export const stvEvents = pgTable("stv_events", {
  id: serial("id").primaryKey(),
  stvId: integer("stv_id")
    .notNull()
    .references(() => stvs.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name").notNull().default(""),
  previousState: text("previous_state"),
  newState: text("new_state").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const grns = pgTable("grns", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  stvId: integer("stv_id")
    .notNull()
    .references(() => stvs.id),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  receivedBy: integer("received_by")
    .notNull()
    .references(() => users.id),
  receivedByName: text("received_by_name").notNull().default(""),
  note: text("note"),
  totalAccepted: integer("total_accepted").notNull().default(0),
  totalRejected: integer("total_rejected").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Dispensing (manual stock-out, no barcode)                           */
/* ------------------------------------------------------------------ */

export const stockOuts = pgTable("stock_outs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batches.id),
  batchNumber: text("batch_number").notNull(),
  quantity: integer("quantity").notNull(),
  uom: text("uom").notNull().default("Tablet"),
  pharmacistId: integer("pharmacist_id")
    .notNull()
    .references(() => users.id),
  pharmacistName: text("pharmacist_name").notNull().default(""),
  reference: text("reference"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eodSheets = pgTable(
  "eod_sheets",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    sheetDate: date("sheet_date", { mode: "string" }).notNull(),
    status: text("status").notNull().default("draft"), // draft | reconciled
    totalDispensed: integer("total_dispensed").notNull().default(0),
    totalLines: integer("total_lines").notNull().default(0),
    notes: text("notes"),
    reconciledBy: integer("reconciled_by").references(() => users.id),
    reconciledByName: text("reconciled_by_name").notNull().default(""),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("eod_location_date_uq").on(t.locationId, t.sheetDate)],
);

/* ------------------------------------------------------------------ */
/* Expired stock returns / disposal                                    */
/* ------------------------------------------------------------------ */

export const stockReturns = pgTable("stock_returns", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdByName: text("created_by_name").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | received | disposed
  note: text("note"),
  processedBy: integer("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockReturnItems = pgTable("stock_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id")
    .notNull()
    .references(() => stockReturns.id, { onDelete: "cascade" }),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batches.id),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  batchNumber: text("batch_number").notNull(),
  expiryDate: date("expiry_date", { mode: "string" }).notNull(),
  quantity: integer("quantity").notNull(),
  reason: text("reason"),
});

/* ------------------------------------------------------------------ */
/* Alerts + automation + audit                                         */
/* ------------------------------------------------------------------ */

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // expiry | reorder | slow_moving
  severity: text("severity").notNull(), // yellow | orange | red | expired | info
  locationId: integer("location_id").references(() => locations.id),
  productId: integer("product_id").references(() => products.id),
  batchId: integer("batch_id").references(() => batches.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name").notNull().default(""),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull().default("cron"), // cron | manual | seed
  summary: jsonb("summary").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Location = typeof locations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Indent = typeof indents.$inferSelect;
export type Stv = typeof stvs.$inferSelect;
export type StvItem = typeof stvItems.$inferSelect;
export type Alert = typeof alerts.$inferSelect;

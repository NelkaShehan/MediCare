CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"location_id" integer,
	"product_id" integer,
	"batch_id" integer,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"batch_number" text NOT NULL,
	"expiry_date" date NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"supplier" text,
	"status" text DEFAULT 'available' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eod_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"sheet_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_dispensed" integer DEFAULT 0 NOT NULL,
	"total_lines" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"reconciled_by" integer,
	"reconciled_by_name" text DEFAULT '' NOT NULL,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grns" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"stv_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"received_by" integer NOT NULL,
	"received_by_name" text DEFAULT '' NOT NULL,
	"note" text,
	"total_accepted" integer DEFAULT 0 NOT NULL,
	"total_rejected" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "indent_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"indent_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"requested_qty" integer NOT NULL,
	"approved_qty" integer DEFAULT 0 NOT NULL,
	"fulfilled_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indents" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"branch_id" integer NOT NULL,
	"requested_by" integer NOT NULL,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"note" text,
	"review_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indents_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'branch' NOT NULL,
	"address" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"generic_name" text,
	"category" text DEFAULT 'General' NOT NULL,
	"uom" text DEFAULT 'Tablet' NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 100 NOT NULL,
	"fast_moving_threshold" integer DEFAULT 60 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "stock_outs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"batch_number" text NOT NULL,
	"quantity" integer NOT NULL,
	"uom" text DEFAULT 'Tablet' NOT NULL,
	"pharmacist_id" integer NOT NULL,
	"pharmacist_name" text DEFAULT '' NOT NULL,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_outs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"batch_number" text NOT NULL,
	"expiry_date" date NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "stock_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"location_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_by_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"processed_by" integer,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_returns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stv_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stv_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"previous_state" text,
	"new_state" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stv_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"stv_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"batch_id" integer,
	"batch_number" text NOT NULL,
	"expiry_date" date NOT NULL,
	"uom" text DEFAULT 'Tablet' NOT NULL,
	"quantity" integer NOT NULL,
	"accepted_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stvs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'warehouse' NOT NULL,
	"status" text DEFAULT 'Created' NOT NULL,
	"source_location_id" integer NOT NULL,
	"destination_location_id" integer NOT NULL,
	"indent_id" integer,
	"transfer_request_id" integer,
	"created_by" integer NOT NULL,
	"created_by_name" text DEFAULT '' NOT NULL,
	"notes" text,
	"exception_reason" text,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"grn_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stvs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "transfer_request_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"from_location_id" integer NOT NULL,
	"to_location_id" integer NOT NULL,
	"kind" text DEFAULT 'request' NOT NULL,
	"requested_by" integer NOT NULL,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"review_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"stv_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"location_id" integer,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eod_sheets" ADD CONSTRAINT "eod_sheets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eod_sheets" ADD CONSTRAINT "eod_sheets_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_stv_id_stvs_id_fk" FOREIGN KEY ("stv_id") REFERENCES "public"."stvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_indent_id_indents_id_fk" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indent_items" ADD CONSTRAINT "indent_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indents" ADD CONSTRAINT "indents_branch_id_locations_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indents" ADD CONSTRAINT "indents_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indents" ADD CONSTRAINT "indents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outs" ADD CONSTRAINT "stock_outs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outs" ADD CONSTRAINT "stock_outs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outs" ADD CONSTRAINT "stock_outs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_outs" ADD CONSTRAINT "stock_outs_pharmacist_id_users_id_fk" FOREIGN KEY ("pharmacist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_return_items" ADD CONSTRAINT "stock_return_items_return_id_stock_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."stock_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_return_items" ADD CONSTRAINT "stock_return_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_return_items" ADD CONSTRAINT "stock_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stv_events" ADD CONSTRAINT "stv_events_stv_id_stvs_id_fk" FOREIGN KEY ("stv_id") REFERENCES "public"."stvs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stv_events" ADD CONSTRAINT "stv_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stv_items" ADD CONSTRAINT "stv_items_stv_id_stvs_id_fk" FOREIGN KEY ("stv_id") REFERENCES "public"."stvs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stv_items" ADD CONSTRAINT "stv_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stv_items" ADD CONSTRAINT "stv_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stvs" ADD CONSTRAINT "stvs_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stvs" ADD CONSTRAINT "stvs_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stvs" ADD CONSTRAINT "stvs_indent_id_indents_id_fk" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stvs" ADD CONSTRAINT "stvs_transfer_request_id_transfer_requests_id_fk" FOREIGN KEY ("transfer_request_id") REFERENCES "public"."transfer_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stvs" ADD CONSTRAINT "stvs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_request_items" ADD CONSTRAINT "transfer_request_items_request_id_transfer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."transfer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_request_items" ADD CONSTRAINT "transfer_request_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batches_product_location_batch_uq" ON "batches" USING btree ("product_id","location_id","batch_number");--> statement-breakpoint
CREATE INDEX "batches_location_idx" ON "batches" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eod_location_date_uq" ON "eod_sheets" USING btree ("location_id","sheet_date");
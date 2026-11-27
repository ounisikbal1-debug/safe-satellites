CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"class_no" integer DEFAULT 1 NOT NULL,
	"nature" text DEFAULT 'actif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"category" text DEFAULT 'MatÃ©riel' NOT NULL,
	"acquisition_date" date NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"duration_years" integer DEFAULT 5 NOT NULL,
	"rate_bp" integer DEFAULT 2000 NOT NULL,
	"accumulated" integer DEFAULT 0 NOT NULL,
	"account_code" text DEFAULT '2231' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'banque' NOT NULL,
	"bank_name" text,
	"rib" text,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"account_code" text DEFAULT '532' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"tx_date" date NOT NULL,
	"label" text NOT NULL,
	"direction" text DEFAULT 'encaissement' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"category" text DEFAULT 'Divers' NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"label" text NOT NULL,
	"quantity" integer DEFAULT 1000 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"vat_rate" integer DEFAULT 19 NOT NULL,
	"line_ht" integer DEFAULT 0 NOT NULL,
	"line_vat" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"partner_id" uuid,
	"partner_name" text DEFAULT '' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"total_ht" integer DEFAULT 0 NOT NULL,
	"total_vat" integer DEFAULT 0 NOT NULL,
	"total_ttc" integer DEFAULT 0 NOT NULL,
	"withholding" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY DEFAULT 'company' NOT NULL,
	"name" text DEFAULT 'SociÃ©tÃ© Tunisienne SARL' NOT NULL,
	"matricule_fiscal" text DEFAULT '0000000/A/M/000' NOT NULL,
	"registre_commerce" text DEFAULT 'B0000000000' NOT NULL,
	"address" text DEFAULT 'Avenue Habib Bourguiba, Tunis' NOT NULL,
	"phone" text DEFAULT '+216 71 000 000' NOT NULL,
	"email" text DEFAULT 'contact@societe.tn' NOT NULL,
	"vat_regime" text DEFAULT 'assujetti' NOT NULL,
	"tax_regime" text DEFAULT 'reel' NOT NULL,
	"is_rate" integer DEFAULT 15 NOT NULL,
	"fiscal_year" integer DEFAULT 2026 NOT NULL,
	"tcl_rate_bp" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricule" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"department" text DEFAULT 'Administration' NOT NULL,
	"hire_date" date NOT NULL,
	"base_salary" integer DEFAULT 0 NOT NULL,
	"allowances" integer DEFAULT 0 NOT NULL,
	"marital_status" text DEFAULT 'celibataire' NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"head_of_family" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'actif' NOT NULL,
	"cnss_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid,
	"label" text NOT NULL,
	"quantity" integer DEFAULT 1000 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"vat_rate" integer DEFAULT 19 NOT NULL,
	"line_ht" integer DEFAULT 0 NOT NULL,
	"line_vat" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"partner_id" uuid,
	"partner_name" text DEFAULT '' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"total_ht" integer DEFAULT 0 NOT NULL,
	"total_vat" integer DEFAULT 0 NOT NULL,
	"stamp_duty" integer DEFAULT 0 NOT NULL,
	"total_ttc" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_date" date NOT NULL,
	"journal" text DEFAULT 'OD' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_code" text NOT NULL,
	"account_label" text DEFAULT '' NOT NULL,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'client' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"matricule_fiscal" text,
	"address" text,
	"email" text,
	"phone" text,
	"payment_terms" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"total_gross" integer DEFAULT 0 NOT NULL,
	"total_cnss_employee" integer DEFAULT 0 NOT NULL,
	"total_cnss_employer" integer DEFAULT 0 NOT NULL,
	"total_css" integer DEFAULT 0 NOT NULL,
	"total_irpp" integer DEFAULT 0 NOT NULL,
	"total_net" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid,
	"employee_name" text DEFAULT '' NOT NULL,
	"matricule" text DEFAULT '' NOT NULL,
	"base_salary" integer DEFAULT 0 NOT NULL,
	"allowances" integer DEFAULT 0 NOT NULL,
	"gross" integer DEFAULT 0 NOT NULL,
	"cnss_employee" integer DEFAULT 0 NOT NULL,
	"cnss_employer" integer DEFAULT 0 NOT NULL,
	"css" integer DEFAULT 0 NOT NULL,
	"taxable_base" integer DEFAULT 0 NOT NULL,
	"irpp" integer DEFAULT 0 NOT NULL,
	"net" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'produit' NOT NULL,
	"unit" text DEFAULT 'U' NOT NULL,
	"price_ht" integer DEFAULT 0 NOT NULL,
	"vat_rate" integer DEFAULT 19 NOT NULL,
	"account_code" text DEFAULT '701' NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"due_date" date NOT NULL,
	"base_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'a_declarer' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_code_idx" ON "accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "bank_tx_account_idx" ON "bank_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "bank_tx_date_idx" ON "bank_transactions" USING btree ("tx_date");--> statement-breakpoint
CREATE INDEX "bill_lines_bill_idx" ON "bill_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bills_date_idx" ON "bills" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "employees_mat_idx" ON "employees" USING btree ("matricule");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "files_created_idx" ON "files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_date_idx" ON "invoices" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "partners_type_idx" ON "partners" USING btree ("type");--> statement-breakpoint
CREATE INDEX "partners_name_idx" ON "partners" USING btree ("name");--> statement-breakpoint
CREATE INDEX "payslips_run_idx" ON "payslips" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "products_ref_idx" ON "products" USING btree ("reference");

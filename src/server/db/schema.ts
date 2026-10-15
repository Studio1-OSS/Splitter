import { relations, sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date()),
};

// ── Better Auth tables (field names must match Better Auth's core schema) ──────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  ...timestamps,
});

/** Profile photo (~60 KB, compressed in the browser). `user.image` points at /api/avatar/<userId>. */
export const userAvatars = sqliteTable("user_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  ...timestamps,
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

// ── App tables. All money columns are integer minor units in the row's currency. ─────────

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  kind: text("kind").notNull().default("other"),
  /** Banner colour and artwork keys from config/banners.ts; null shows the emoji instead. */
  bannerColor: text("banner_color"),
  bannerArt: text("banner_art"),
  currency: text("currency").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  ...timestamps,
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** Null for a friend who has not joined yet (a named placeholder). */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (t) => [
    index("members_group_idx").on(t.groupId),
    uniqueIndex("members_group_user_uq").on(t.groupId, t.userId),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    paidByMemberId: text("paid_by_member_id")
      .notNull()
      .references(() => members.id),
    merchant: text("merchant").notNull(),
    category: text("category").notNull().default("other"),
    date: text("date").notNull(), // YYYY-MM-DD
    currency: text("currency").notNull(),
    subtotal: integer("subtotal").notNull(),
    tax: integer("tax").notNull().default(0),
    tip: integer("tip").notNull().default(0),
    serviceCharge: integer("service_charge").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    shareToken: text("share_token").notNull().unique(),
    /** Set when the expense came from a "Settle with AI" batch. */
    batchId: text("batch_id").references((): AnySQLiteColumn => batches.id, { onDelete: "set null" }),
    /** How it was split, e.g. the AI's explanation. Shown to members. */
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [index("expenses_group_idx").on(t.groupId), index("expenses_batch_idx").on(t.batchId)],
);

/** A "Settle with AI" run: the bills, the group's notes and the AI summary, published together. */
export const batches = sqliteTable(
  "batches",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    context: text("context").notNull().default(""),
    summary: text("summary").notNull().default(""),
    shareToken: text("share_token").notNull().unique(),
    /** Whether the public share page may show bill images. Off by default. */
    shareImages: integer("share_images", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [index("batches_group_idx").on(t.groupId)],
);

/** Compressed copies of bill photos (~150 KB), visible to group members only. */
export const billImages = sqliteTable(
  "bill_images",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    batchId: text("batch_id").references(() => batches.id, { onDelete: "cascade" }),
    expenseId: text("expense_id").references(() => expenses.id, { onDelete: "cascade" }),
    /** Bill number within its batch (#1, #2…). */
    billNo: integer("bill_no"),
    /** Page of that bill, starting at 1 (long receipts and PDFs have several). */
    page: integer("page").notNull().default(1),
    mime: text("mime").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    thumb: blob("thumb", { mode: "buffer" }).notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [index("bill_images_group_idx").on(t.groupId), index("bill_images_expense_idx").on(t.expenseId), index("bill_images_batch_idx").on(t.batchId)],
);

export const expenseItems = sqliteTable(
  "expense_items",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    quantity: real("quantity").notNull().default(1),
    amount: integer("amount").notNull(),
  },
  (t) => [index("expense_items_expense_idx").on(t.expenseId)],
);

export const itemAssignments = sqliteTable(
  "item_assignments",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => expenseItems.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    weight: real("weight").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.memberId] })],
);

/** The computed result of a split, written in the same transaction as the expense. */
export const expenseShares = sqliteTable(
  "expense_shares",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] })],
);

export const settlements = sqliteTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: text("from_member_id")
      .notNull()
      .references(() => members.id),
    toMemberId: text("to_member_id")
      .notNull()
      .references(() => members.id),
    amount: integer("amount").notNull(),
    status: text("status", { enum: ["reported", "confirmed"] }).notNull().default("reported"),
    batchId: text("batch_id").references((): AnySQLiteColumn => batches.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [index("settlements_group_idx").on(t.groupId)],
);

export const scanUsage = sqliteTable(
  "scan_usage",
  {
    key: text("key").notNull(),
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.day] })],
);

// ── Relations (used by db.query.*) ─────────────────────────────────────────────────────

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(members),
  batches: many(batches),
  expenses: many(expenses),
  settlements: many(settlements),
}));

export const membersRelations = relations(members, ({ one }) => ({
  group: one(groups, { fields: [members.groupId], references: [groups.id] }),
  user: one(user, { fields: [members.userId], references: [user.id] }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  batch: one(batches, { fields: [expenses.batchId], references: [batches.id] }),
  images: many(billImages),
  paidBy: one(members, { fields: [expenses.paidByMemberId], references: [members.id] }),
  items: many(expenseItems),
  shares: many(expenseShares),
}));

export const expenseItemsRelations = relations(expenseItems, ({ one, many }) => ({
  expense: one(expenses, { fields: [expenseItems.expenseId], references: [expenses.id] }),
  assignments: many(itemAssignments),
}));

export const itemAssignmentsRelations = relations(itemAssignments, ({ one }) => ({
  item: one(expenseItems, { fields: [itemAssignments.itemId], references: [expenseItems.id] }),
  member: one(members, { fields: [itemAssignments.memberId], references: [members.id] }),
}));

export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
  expense: one(expenses, { fields: [expenseShares.expenseId], references: [expenses.id] }),
  member: one(members, { fields: [expenseShares.memberId], references: [members.id] }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, { fields: [settlements.groupId], references: [groups.id] }),
  from: one(members, { fields: [settlements.fromMemberId], references: [members.id] }),
  to: one(members, { fields: [settlements.toMemberId], references: [members.id] }),
}));

export const batchesRelations = relations(batches, ({ one, many }) => ({
  group: one(groups, { fields: [batches.groupId], references: [groups.id] }),
  expenses: many(expenses),
  images: many(billImages),
}));

export const billImagesRelations = relations(billImages, ({ one }) => ({
  batch: one(batches, { fields: [billImages.batchId], references: [batches.id] }),
  expense: one(expenses, { fields: [billImages.expenseId], references: [expenses.id] }),
}));

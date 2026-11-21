import { relations } from 'drizzle-orm';
import { doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const marketSyncRuns = pgTable('market_sync_runs', {
  id: serial('id').primaryKey(),
  triggeredBy: text('triggered_by').notNull(),
  intervalMinutes: integer('interval_minutes').notNull().default(5),
  status: text('status').notNull(),
  summary: text('summary').notNull(),
  sourcesJson: text('sources_json').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const marketQuoteHistory = pgTable('market_quote_history', {
  id: serial('id').primaryKey(),
  syncRunId: integer('sync_run_id')
    .references(() => marketSyncRuns.id)
    .notNull(),
  instrumentId: text('instrument_id').notNull(),
  instrumentName: text('instrument_name').notNull(),
  ticker: text('ticker').notNull(),
  displayValue: text('display_value').notNull(),
  numericValue: doublePrecision('numeric_value').notNull(),
  signal: text('signal').notNull(),
  interpretation: text('interpretation').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const analystNotes = pgTable('analyst_notes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  sectionId: text('section_id').notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  notes: many(analystNotes),
}));

export const analystNotesRelations = relations(analystNotes, ({ one }) => ({
  author: one(users, {
    fields: [analystNotes.userId],
    references: [users.id],
  }),
}));

export const marketSyncRunsRelations = relations(marketSyncRuns, ({ many }) => ({
  quotes: many(marketQuoteHistory),
}));

export const marketQuoteHistoryRelations = relations(marketQuoteHistory, ({ one }) => ({
  syncRun: one(marketSyncRuns, {
    fields: [marketQuoteHistory.syncRunId],
    references: [marketSyncRuns.id],
  }),
}));

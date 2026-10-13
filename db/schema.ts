import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
export const characters = sqliteTable('characters', {
  name: text('name').primaryKey(), server: text('server').notNull(), job: text('job').notNull(),
  guild: text('guild'), itemLevel: real('item_level').notNull(), combatPower: real('combat_power').notNull(),
  profile: text('profile').notNull(), updatedAt: text('updated_at').notNull(), searches: integer('searches').notNull().default(1)
});
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), category: text('category').notNull(),
  title: text('title').notNull(), body: text('body').notNull(), status: text('status').notNull().default('접수'), createdAt: text('created_at').notNull()
});

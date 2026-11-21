import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { analystNotes, users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize analyst profile.', { cause: error });
  }
}

export async function getNotesForUser(uid: string) {
  try {
    return await db
      .select({
        id: analystNotes.id,
        sectionId: analystNotes.sectionId,
        note: analystNotes.note,
        createdAt: analystNotes.createdAt,
      })
      .from(analystNotes)
      .innerJoin(users, eq(analystNotes.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(analystNotes.createdAt))
      .limit(20);
  } catch (error) {
    console.error('Database query failed for analyst notes:', error);
    throw new Error('Failed to load analyst notes.', { cause: error });
  }
}

export async function createAnalystNote(
  uid: string,
  email: string,
  sectionId: string,
  note: string,
  displayName?: string
) {
  try {
    const userRow = await getOrCreateUser(uid, email, displayName);
    const inserted = await db
      .insert(analystNotes)
      .values({
        userId: userRow.id,
        sectionId,
        note,
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database insert failed for analyst note:', error);
    throw new Error('Failed to save analyst note.', { cause: error });
  }
}

import "server-only"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/infrastructure/db/client"
import type { Connection } from "@/infrastructure/db/schema"

/*
  Connection repository — data access for external connections.

  For V0, the Notion connection's encrypted credential is decrypted only at
  delivery time, server-side, and never returned to the client.
*/

export const connectionRepo = {
  async findByUserAndProvider(
    userId: string,
    provider: Connection["provider"],
  ): Promise<Connection | undefined> {
    const [row] = await db
      .select()
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.userId, userId),
          eq(schema.connections.provider, provider),
          eq(schema.connections.enabled, true),
        ),
      )
      .limit(1)
    return row
  },

  async listByUser(userId: string): Promise<Connection[]> {
    return db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.userId, userId))
      .orderBy(schema.connections.createdAt)
  },

  async insert(
    connection: Omit<
      typeof schema.connections.$inferInsert,
      "createdAt" | "updatedAt"
    >,
  ): Promise<Connection> {
    const [row] = await db
      .insert(schema.connections)
      .values(connection)
      .returning()
    if (!row) throw new Error("Connection insert returned no rows")
    return row
  },

  async remove(userId: string, id: string): Promise<void> {
    await db
      .delete(schema.connections)
      .where(
        and(
          eq(schema.connections.userId, userId),
          eq(schema.connections.id, id),
        ),
      )
  },
}

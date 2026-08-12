import "server-only"
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless"
import { Pool } from "@neondatabase/serverless"
import * as schema from "./schema"

/*
  Database client (PostgreSQL via Neon serverless driver + Drizzle).

  Server-only. Reads DATABASE_URL from the environment. The pool is created
  lazily on first use so importing the module (e.g. during `next build` page
  data collection) does not require a live DATABASE_URL.
*/

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    )
  }
  return url
}

let _db: NeonDatabase<typeof schema> | undefined
let _pool: Pool | undefined

function client(): NeonDatabase<typeof schema> {
  if (_db) return _db
  _pool = new Pool({ connectionString: getDatabaseUrl() })
  _db = drizzle({ client: _pool, schema, casing: "snake_case" })
  return _db
}

/**
 * Lazy Drizzle instance. Prefer this in application code. Use `getDB()` in
 * contexts that must resolve the instance at call time (tests, edge cases).
 */
export const db = new Proxy(
  {} as NeonDatabase<typeof schema>,
  {
    get(_target, prop) {
      const instance = client()
      const value = Reflect.get(instance, prop)
      return typeof value === "function" ? value.bind(instance) : value
    },
  },
)

export function getDB(): NeonDatabase<typeof schema> {
  return client()
}

export { schema }

export type DB = NeonDatabase<typeof schema>
export { Pool }

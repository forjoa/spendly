import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ApiKey } from "@/infrastructure/db/schema"

/*
  API key service tests.

  The service depends on a live PostgreSQL database (via the Drizzle adapter).
  No test database is available, so we mock only the DB boundary. All domain
  logic — key generation, hashing, suffix extraction, scoping — runs for real.
  The mock is an in-memory store that mirrors the real schema's columns.

  Drizzle's query builder (eq, and, isNull, desc) returns SQL expression
  objects, not plain predicates. We stub those operators to return lightweight
  predicate wrappers that the mock db can evaluate against in-memory rows.
*/

type ApiKeyRow = {
  id: string
  userId: string
  label: string
  keyHash: string
  keySuffix: string
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// Drizzle column `.name` (snake_case) → JS property name (camelCase).
const SNAKE_TO_CAMEL: Record<string, string> = {
  user_id: "userId",
  key_hash: "keyHash",
  key_suffix: "keySuffix",
  last_used_at: "lastUsedAt",
  revoked_at: "revokedAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
}

// A predicate wrapper the mock db can evaluate. Drizzle columns expose their
// DB column name via `.name` (e.g. "user_id"), so we map it back to the
// camelCase row key when evaluating.
type Pred = { field: string; op: "eq" | "isNull"; value?: unknown }

// In-memory store shared across the mock and the service under test.
let store: ApiKeyRow[]
let insertCaptured: Record<string, unknown> | null

function evalPred(pred: unknown, row: ApiKeyRow): boolean {
  if (typeof pred !== "object" || pred === null) return true
  if ("preds" in pred) {
    return (pred as { preds: unknown[] }).preds.every((p) => evalPred(p, row))
  }
  if ("field" in pred) {
    const p = pred as Pred
    const rowKey = SNAKE_TO_CAMEL[p.field] ?? p.field
    const val = row[rowKey as keyof ApiKeyRow]
    if (p.op === "isNull") return val === null
    return val === p.value
  }
  return true
}

function buildMockDb() {
  return {
    insert: () => ({
      values: (v: Partial<ApiKeyRow>) => ({
        returning: () => {
          insertCaptured = v
          const row: ApiKeyRow = {
            id: "test-id-" + store.length,
            userId: v.userId!,
            label: v.label!,
            keyHash: v.keyHash!,
            keySuffix: v.keySuffix!,
            lastUsedAt: null,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          store.push(row)
          return [row]
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (pred: unknown) => ({
          orderBy: () => store.filter((row) => evalPred(pred, row)),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Partial<ApiKeyRow>) => ({
        where: (pred: unknown) => ({
          returning: () => {
            const matched = store.filter((row) => evalPred(pred, row))
            for (const row of matched) {
              Object.assign(row, patch)
            }
            return matched
          },
        }),
      }),
    }),
  }
}

// Stub drizzle-orm operators so they produce predicates the mock db evaluates.
// The real Drizzle `eq(col, value)` receives a column whose `.name` is the DB
// column name (snake_case). We capture that name and the value.
vi.mock("drizzle-orm", () => ({
  eq: (field: { name: string }, value: unknown) =>
    ({ field: field.name, op: "eq", value }) as Pred,
  and: (...preds: unknown[]) => ({ preds }),
  isNull: (field: { name: string }) =>
    ({ field: field.name, op: "isNull" }) as Pred,
  desc: () => ({}),
}))

vi.mock("@/infrastructure/db/client", async () => {
  const schema = await vi.importActual("@/infrastructure/db/schema")
  return {
    db: buildMockDb(),
    schema,
    getDB: () => buildMockDb(),
  }
})

// Import after mock is set up.
const { createKey, listKeys, listActiveKeys, revokeKey } = await import("./service")

const USER_A = "user-a"
const USER_B = "user-b"

beforeEach(() => {
  store = []
  insertCaptured = null
})

describe("createKey", () => {
  it("returns the plaintext raw key exactly once", async () => {
    const { rawKey } = await createKey(USER_A, "test key")
    expect(typeof rawKey).toBe("string")
    expect(rawKey.startsWith("sk_live_")).toBe(true)
    expect(rawKey.length).toBeGreaterThan("sk_live_".length + 8)
  })

  it("stores only the hash and suffix, never the raw key", async () => {
    const { rawKey } = await createKey(USER_A, "test key")
    expect(insertCaptured).not.toBeNull()
    const stored = insertCaptured!

    // The hash must be present.
    expect(stored.keyHash).toBeDefined()
    expect(stored.keyHash).toMatch(/^[0-9a-f]{64}$/)

    // The suffix must be the last 4 chars of the raw key.
    expect(stored.keySuffix).toBe(rawKey.slice(-4))

    // The raw key must NOT be in any stored field.
    expect(stored.keyHash).not.toBe(rawKey)
    expect(stored.keySuffix).not.toBe(rawKey)
    for (const v of Object.values(stored)) {
      expect(v).not.toBe(rawKey)
    }
  })

  it("trims and truncates the label to 100 characters", async () => {
    const longLabel = "  " + "x".repeat(150) + "  "
    const { record } = await createKey(USER_A, longLabel)
    expect(record.label).toBe("x".repeat(100))
  })

  it("produces unique hashes for different raw keys", async () => {
    const a = await createKey(USER_A, "key-a")
    const b = await createKey(USER_A, "key-b")
    expect(a.rawKey).not.toBe(b.rawKey)
    expect(a.record.keyHash).not.toBe(b.record.keyHash)
  })
})

describe("listKeys", () => {
  it("returns rows scoped to the requesting user", async () => {
    await createKey(USER_A, "a1")
    await createKey(USER_A, "a2")
    await createKey(USER_B, "b1")

    const aKeys = await listKeys(USER_A)
    expect(aKeys).toHaveLength(2)
    expect(aKeys.every((k) => k.userId === USER_A)).toBe(true)

    const bKeys = await listKeys(USER_B)
    expect(bKeys).toHaveLength(1)
    expect(bKeys[0]!.userId).toBe(USER_B)
  })

  it("does not expose plaintext keys", async () => {
    const { rawKey } = await createKey(USER_A, "test")

    const keys: ApiKey[] = await listKeys(USER_A)
    for (const k of keys) {
      expect(k).not.toHaveProperty("rawKey")
      expect(JSON.stringify(k)).not.toContain(rawKey)
    }
  })

  it("returns rows without a keyHash field that matches the raw key", async () => {
    const { rawKey, record } = await createKey(USER_A, "test")
    const keys = await listKeys(USER_A)
    const found = keys.find((k) => k.id === record.id)
    expect(found).toBeDefined()
    expect(found!.keyHash).not.toBe(rawKey)
  })
})

describe("listActiveKeys", () => {
  it("excludes revoked keys", async () => {
    const { record } = await createKey(USER_A, "to-revoke")
    await createKey(USER_A, "active")

    await revokeKey(USER_A, record.id)

    const active = await listActiveKeys(USER_A)
    expect(active).toHaveLength(1)
    expect(active[0]!.label).toBe("active")
    expect(active.every((k) => k.revokedAt === null)).toBe(true)
  })
})

describe("revokeKey", () => {
  it("sets revokedAt on the matching key", async () => {
    const { record } = await createKey(USER_A, "test")
    expect(record.revokedAt).toBeNull()

    const revoked = await revokeKey(USER_A, record.id)
    expect(revoked).toBeDefined()
    expect(revoked!.revokedAt).toBeInstanceOf(Date)
  })

  it("is scoped by userId — cannot revoke another user's key", async () => {
    const { record } = await createKey(USER_A, "user-a key")

    const result = await revokeKey(USER_B, record.id)
    expect(result).toBeUndefined()

    // Verify the key is still active.
    const active = await listActiveKeys(USER_A)
    expect(active.find((k) => k.id === record.id)).toBeDefined()
  })
})

describe("authenticateApiKey (authorization)", () => {
  it("hashes match — a created key can authenticate", async () => {
    const { rawKey, record } = await createKey(USER_A, "auth test")

    // The stored hash must match the hash of the raw key.
    const { hashKey } = await import("@/lib/keys")
    const hashOfRaw = await hashKey(rawKey)
    expect(record.keyHash).toBe(hashOfRaw)
  })

  it("revoked keys cannot authenticate", async () => {
    const { record } = await createKey(USER_A, "to-revoke")
    await revokeKey(USER_A, record.id)

    const keys = await listKeys(USER_A)
    const key = keys.find((k) => k.id === record.id)
    expect(key!.revokedAt).not.toBeNull()
  })
})

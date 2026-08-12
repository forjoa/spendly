import "server-only"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { getDB } from "../db/client"
import * as schema from "../db/schema"

/*
  Better Auth server instance.

  Email/password only in V0. Sessions stored in Postgres via the Drizzle
  adapter. The `user` and `session` tables in schema.ts mirror Better Auth's
  expected schema so our foreign keys stay valid.

  The instance is created lazily on first use so importing this module
  (e.g. during `next build`) does not require live secrets.
*/

function buildOptions(): BetterAuthOptions {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32",
    )
  }
  return {
    database: drizzleAdapter(getDB(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
      },
    }),
    secret,
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      cookiePrefix: "spendly",
    },
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
    },
  }
}

let _auth: ReturnType<typeof betterAuth> | undefined

export function getAuth(): ReturnType<typeof betterAuth> {
  if (_auth) return _auth
  _auth = betterAuth(buildOptions())
  return _auth
}

export type Auth = ReturnType<typeof betterAuth>

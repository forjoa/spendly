import "server-only"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { getDB } from "../db/client"
import * as schema from "../db/schema"

/*
  Better Auth server instance.

  Email/password only in V0. Sessions stored in Postgres via the Drizzle
  adapter. The `user`, `session`, `account`, and `verification` tables in
  schema.ts are owned by Spendly in the public schema and mirror Better
  Auth's expected model shapes so all auth data lives in one place.

  Standard Better Auth environment variables are used:
    BETTER_AUTH_SECRET  — signs session tokens (required in production)
    BETTER_AUTH_URL     — public base URL for callbacks and absolute links
  Both are read automatically by Better Auth when not set in options, so
  we omit them here and let the library resolve them from the environment.

  The instance is created lazily on first use so importing this module
  (e.g. during `next build`) does not require live secrets.
*/

function buildOptions(): BetterAuthOptions {
  return {
    database: drizzleAdapter(getDB(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    baseURL: process.env.BETTER_AUTH_URL,
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

import "server-only"
import { headers } from "next/headers"
import { AuthenticationError } from "@/lib/errors"
import { getAuth } from "./auth"

/*
  Server-side session helpers for Next.js App Router.
*/

export async function getSession() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  })
  return session
}

export async function requireUser() {
  const session = await getSession()
  if (!session?.user) {
    throw new AuthenticationError()
  }
  return session
}

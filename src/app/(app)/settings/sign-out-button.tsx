"use client"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "@/infrastructure/auth/auth-client"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function SignOutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await signOut()
          router.push("/sign-in")
          router.refresh()
        })
      }}
    >
      {pending ? <Spinner /> : null}
      Sign out
    </Button>
  )
}

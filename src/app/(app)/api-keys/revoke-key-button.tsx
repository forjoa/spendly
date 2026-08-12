"use client"
import * as React from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { revokeApiKeyAction } from "./actions"

export function RevokeKeyButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Revoke key ${label}`}
      onClick={() => {
        const fd = new FormData()
        fd.set("id", id)
        startTransition(async () => {
          try {
            await revokeApiKeyAction(fd)
            toast.success("API key revoked")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not revoke key")
          }
        })
      }}
    >
      {pending ? <Spinner /> : <Trash2 />}
      Revoke
    </Button>
  )
}

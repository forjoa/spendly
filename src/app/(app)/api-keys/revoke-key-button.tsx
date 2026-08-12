"use client"
import * as React from "react"
import { Trash2 } from "lucide-react"
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
          } catch (err) {
            // error surfaced via toast in the parent; keep silent here
            console.error(err)
          }
        })
      }}
    >
      {pending ? <Spinner /> : <Trash2 />}
      Revoke
    </Button>
  )
}

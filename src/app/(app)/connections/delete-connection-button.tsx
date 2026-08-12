"use client"
import * as React from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { deleteConnectionAction } from "./actions"

export function DeleteConnectionButton({
  id,
  label,
}: {
  id: string
  label: string
}) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Delete connection ${label}`}
      onClick={() => {
        const fd = new FormData()
        fd.set("id", id)
        startTransition(async () => {
          try {
            await deleteConnectionAction(fd)
            toast.success("Connection removed")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not remove connection")
          }
        })
      }}
    >
      {pending ? <Spinner /> : <Trash2 />}
      Remove
    </Button>
  )
}

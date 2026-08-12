"use client"
import * as React from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { createNotionConnectionAction } from "./actions"

export function CreateConnectionDialog() {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createNotionConnectionAction(formData)
        toast.success("Notion connection added")
        setOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add connection")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Notion connection</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Notion</DialogTitle>
          <DialogDescription>
            Enter your Notion internal integration token and the database id where
            transactions will be created as pages.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="info">
          <AlertDescription>
            In Notion, share the target database with your integration so it can
            create pages. The token is encrypted at rest and never sent to the client.
          </AlertDescription>
        </Alert>
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" placeholder="My Notion" required maxLength={100} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="token">Integration token</Label>
            <Input
              id="token"
              name="token"
              type="password"
              placeholder="ntn_…"
              required
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="databaseId">Database id</Label>
            <Input
              id="databaseId"
              name="databaseId"
              placeholder="32-character id"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

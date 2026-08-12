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
            Spendly will create a page in your Notion database for each
            transaction it receives.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="info">
          <AlertDescription>
            You need a Notion database with these properties: Merchant (title),
            Amount (text), Currency (select), Date (date), Type (select),
            Source (text), External ID (text). Create one in Notion before
            connecting.
          </AlertDescription>
        </Alert>
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" placeholder="My Notion" required maxLength={100} />
            <p className="text-xs text-muted-foreground">
              A name so you can recognise this connection.
            </p>
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
            <p className="text-xs text-muted-foreground">
              Create one at notion.so/my-integrations (type: internal). The token
              is encrypted at rest and never shown again.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="databaseId">Database id</Label>
            <Input
              id="databaseId"
              name="databaseId"
              placeholder="32-character id"
              required
            />
            <p className="text-xs text-muted-foreground">
              Open your database in Notion. The id is in the URL:
              notion.so/&#123;workspace&#125;/&#123;databaseId&#125;?…. Share the
              database with your integration.
            </p>
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

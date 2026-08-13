"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Copy, Check } from "lucide-react"
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
import { createApiKeyAction } from "./actions"

type Created = { rawKey: string; id: string; label: string; keySuffix: string }

export function CreateApiKeyDialog() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [created, setCreated] = React.useState<Created | null>(null)
  const [copied, setCopied] = React.useState(false)

  function reset() {
    setLabel("")
    setCreated(null)
    setCopied(false)
    setPending(false)
  }

  async function onCreate(formData: FormData) {
    setPending(true)
    try {
      const result = await createApiKeyAction(formData)
      setCreated(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key")
    } finally {
      setPending(false)
    }
  }

  async function copyKey() {
    if (!created) return
    await navigator.clipboard.writeText(created.rawKey)
    setCopied(true)
    toast.success("API key copied")
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      // Refresh the key list now that the dialog is closing. This must
      // happen after the user has had a chance to copy the plaintext key.
      // We do not revalidate during creation (see actions.ts) to avoid
      // unmounting this component and losing the key from state.
      router.refresh()
      reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button>Create API key</Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>API key created</DialogTitle>
              <DialogDescription>
                Copy this key now. For security, the full value is shown only once.
              </DialogDescription>
            </DialogHeader>
            <Alert variant="warning">
              <AlertDescription>
                This key will only be shown once. Copy it now and store it securely.
                After you close this dialog, the plaintext key is gone forever.
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Input readOnly value={created.rawKey} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copyKey} aria-label="Copy key">
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Used by your Apple Wallet shortcut to post transactions to Spendly.
              </DialogDescription>
            </DialogHeader>
            <form action={onCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  name="label"
                  placeholder="iOS shortcut"
                  required
                  maxLength={100}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={pending}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !label.trim()}>
                  {pending ? <Spinner /> : null}
                  Create key
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

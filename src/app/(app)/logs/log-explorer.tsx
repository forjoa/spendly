"use client"
import * as React from "react"
import Link from "next/link"
import { ChevronRight, ChevronDown, ScrollText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/*
  Log explorer — filterable, paginated list of the user's application logs.
  Row click expands the full event detail (request id, transaction id and
  redacted metadata as readable JSON). All values arrive pre-redacted from
  the server.
*/

export interface LogExplorerItem {
  id: string
  createdAt: string
  level: "info" | "warn" | "error"
  event: string
  message: string | null
  requestId: string | null
  transactionId: string | null
  method: string | null
  path: string | null
  statusCode: number | null
  durationMs: number | null
  metadata: Record<string, unknown> | null
}

export interface LogExplorerFilters {
  level: string
  event: string
  requestId: string
  path: string
  statusCode: string
  from: string
  to: string
}

interface LogExplorerProps {
  items: LogExplorerItem[]
  filters: LogExplorerFilters
  page: number
  hasMore: boolean
}

const LEVEL_VARIANTS = {
  info: "secondary",
  warn: "warning",
  error: "destructive",
} as const

function formatTime(iso: string): string {
  // UTC, stable across server/client rendering.
  return new Date(iso).toISOString().slice(11, 19)
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/** Convert an ISO string to a datetime-local input value (UTC). */
function toLocalInput(iso: string): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16)
  return date.toISOString().slice(0, 16)
}

function buildQuery(filters: LogExplorerFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.level) params.set("level", filters.level)
  if (filters.event) params.set("event", filters.event)
  if (filters.requestId) params.set("requestId", filters.requestId)
  if (filters.path) params.set("path", filters.path)
  if (filters.statusCode) params.set("statusCode", filters.statusCode)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `/logs?${qs}` : "/logs"
}

function LogDetail({ item }: { item: LogExplorerItem }) {
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-3 text-xs">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-muted-foreground">Timestamp</span>
          <span className="font-mono">{item.createdAt}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-muted-foreground">Request</span>
          <span className="font-mono break-all">{item.requestId ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-muted-foreground">Endpoint</span>
          <span className="font-mono break-all">
            {item.method || item.path
              ? `${item.method ?? ""} ${item.path ?? ""}`.trim()
              : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-muted-foreground">Status / duration</span>
          <span className="font-mono">
            {item.statusCode ?? "—"}
            {item.durationMs !== null ? ` · ${item.durationMs} ms` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-muted-foreground">Transaction</span>
          <span className="font-mono break-all">{item.transactionId ?? "—"}</span>
        </div>
        {item.message ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-muted-foreground">Message</span>
            <span className="break-words">{item.message}</span>
          </div>
        ) : null}
      </div>
      {item.metadata && Object.keys(item.metadata).length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-muted-foreground">Metadata</span>
          <pre className="max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(item.metadata, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

export function LogExplorer({ items, filters, page, hasMore }: LogExplorerProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <form method="get" action="/logs" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="level">Level</Label>
                <select
                  id="level"
                  name="level"
                  defaultValue={filters.level}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">All</option>
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event">Event</Label>
                <Input
                  id="event"
                  name="event"
                  placeholder="transaction.validation.failed"
                  defaultValue={filters.event}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="requestId">Request id</Label>
                <Input
                  id="requestId"
                  name="requestId"
                  placeholder="abc123…"
                  defaultValue={filters.requestId}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="path">Path</Label>
                <Input
                  id="path"
                  name="path"
                  placeholder="/api/transactions"
                  defaultValue={filters.path}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="statusCode">Status code</Label>
                <Input
                  id="statusCode"
                  name="statusCode"
                  inputMode="numeric"
                  placeholder="422"
                  defaultValue={filters.statusCode}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">From (UTC)</Label>
                <Input
                  id="from"
                  name="from"
                  type="datetime-local"
                  defaultValue={toLocalInput(filters.from)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="to">To (UTC)</Label>
                <Input
                  id="to"
                  name="to"
                  type="datetime-local"
                  defaultValue={toLocalInput(filters.to)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">Apply filters</Button>
              <Button type="button" variant="ghost" size="sm" asChild>
                <Link href="/logs">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title="No logs found"
          description="Logs appear here after your Apple Wallet shortcut sends transactions, or when ingestion events occur."
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <ul className="divide-y">
              {items.map((item) => {
                const expanded = expandedId === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      aria-expanded={expanded}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
                    >
                      {expanded ? (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTime(item.createdAt)}
                      </span>
                      <Badge
                        variant={LEVEL_VARIANTS[item.level]}
                        className={cn("w-14 justify-center uppercase")}
                      >
                        {item.level}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {item.event}
                      </span>
                      {item.statusCode !== null ? (
                        <span
                          className={cn(
                            "hidden w-12 shrink-0 text-right font-mono text-xs md:block",
                            item.statusCode >= 500
                              ? "text-destructive"
                              : item.statusCode >= 400
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground",
                          )}
                        >
                          {item.statusCode}
                        </span>
                      ) : null}
                      {item.durationMs !== null ? (
                        <span className="hidden w-16 shrink-0 text-right font-mono text-xs text-muted-foreground lg:block">
                          {item.durationMs} ms
                        </span>
                      ) : null}
                      <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
                        {formatDate(item.createdAt)}
                      </span>
                    </button>
                    {expanded ? <LogDetail item={item} /> : null}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild={page > 1}
            disabled={page <= 1}
          >
            {page > 1 ? (
              <Link href={buildQuery(filters, page - 1)}>Previous</Link>
            ) : (
              <span>Previous</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild={hasMore}
            disabled={!hasMore}
          >
            {hasMore ? (
              <Link href={buildQuery(filters, page + 1)}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

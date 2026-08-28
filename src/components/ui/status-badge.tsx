import * as React from "react"
import { Check, Clock, AlertTriangle, MinusCircle } from "lucide-react"
import { Badge, type BadgeProps } from "./badge"
import { cn } from "@/lib/utils"

/**
 * Delivery status of a transaction at a destination (see DATABASE.md).
 * Keeping the union here lets the UI track the schema in one place.
 */
export type DeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "skipped"

const STATUS_CONFIG: Record<
  DeliveryStatus,
  { label: string; variant: BadgeProps["variant"]; icon: React.ReactNode }
> = {
  pending: { label: "Pending", variant: "warning", icon: <Clock /> },
  delivered: { label: "Delivered", variant: "success", icon: <Check /> },
  failed: { label: "Failed", variant: "destructive", icon: <AlertTriangle /> },
  skipped: { label: "Skipped", variant: "muted", icon: <MinusCircle /> },
}

interface StatusBadgeProps extends Omit<BadgeProps, "variant" | "children"> {
  status: DeliveryStatus
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant={config.variant} className={cn(className)} {...props}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

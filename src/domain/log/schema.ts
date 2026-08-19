import { z } from "zod"

/*
  Application log domain types.

  A "record" is one persistable log event, already redacted by the logger
  before it reaches the domain. `userId` is null for events emitted before
  authentication; `requestId` + `userId` + `transactionId` together let a
  single operation be reconstructed end-to-end.
*/

export const logLevelSchema = z.enum(["info", "warn", "error"])
export type PersistedLogLevel = z.infer<typeof logLevelSchema>

export const applicationLogRecordSchema = z.object({
  userId: z.string().max(128).optional(),
  requestId: z.string().max(256).optional(),
  transactionId: z.uuid().optional(),
  level: logLevelSchema,
  event: z.string().min(1).max(256),
  message: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.iso.datetime().optional(),
})

export type ApplicationLogRecord = z.infer<typeof applicationLogRecordSchema>

/** Query filters for the /logs UI. All optional; always scoped by userId. */
const dateFilter = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" })

export const applicationLogQuerySchema = z.object({
  level: logLevelSchema.optional(),
  event: z.string().trim().max(256).optional(),
  requestId: z.string().trim().max(256).optional(),
  // Request attributes live in metadata (jsonb); matched exactly.
  path: z.string().trim().max(256).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  // Accepts ISO datetimes and `datetime-local` values (interpreted in the
  // server timezone, UTC in production).
  from: dateFilter.optional(),
  to: dateFilter.optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export type ApplicationLogQuery = z.infer<typeof applicationLogQuerySchema>

export const LOG_PAGE_SIZE = 25

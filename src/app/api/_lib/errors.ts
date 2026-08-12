import { NextResponse } from "next/server"
import {
  SpendlyError,
  ValidationError,
  AuthenticationError,
  DestinationError,
  ConfigurationError,
} from "@/lib/errors"

/*
  Map domain errors to HTTP responses without leaking internals.

  All responses use a consistent { error: { code, message } } shape.
*/

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof SpendlyError) {
    const status = statusFor(error)
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status },
    )
  }

  if (isZodLike(error)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          issues: error.issues,
        },
      },
      { status: 422 },
    )
  }

  // Never expose the raw message of an unknown error.
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500 },
  )
}

function statusFor(error: SpendlyError): number {
  if (error instanceof ValidationError) return 422
  if (error instanceof AuthenticationError) return 401
  if (error instanceof DestinationError) return 502
  if (error instanceof ConfigurationError) return 500
  return 500
}

function isZodLike(error: unknown): error is { issues: unknown[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues)
  )
}

export function json(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init)
}

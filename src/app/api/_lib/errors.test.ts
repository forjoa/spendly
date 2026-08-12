import { describe, it, expect } from "vitest"
import { NextResponse } from "next/server"
import {
  ValidationError,
  AuthenticationError,
  DestinationError,
  ConfigurationError,
  SpendlyError,
} from "@/lib/errors"
import { errorResponse } from "./errors"

async function body(res: NextResponse): Promise<unknown> {
  return res.json()
}

describe("errorResponse", () => {
  it("maps ValidationError to 422", async () => {
    const res = errorResponse(new ValidationError("bad input"))
    expect(res.status).toBe(422)
    const json = (await body(res)) as { error: { code: string; message: string } }
    expect(json.error.code).toBe("VALIDATION_ERROR")
    expect(json.error.message).toBe("bad input")
  })

  it("maps AuthenticationError to 401", async () => {
    const res = errorResponse(new AuthenticationError())
    expect(res.status).toBe(401)
    const json = (await body(res)) as { error: { code: string } }
    expect(json.error.code).toBe("AUTHENTICATION_ERROR")
  })

  it("maps DestinationError to 502", async () => {
    const res = errorResponse(new DestinationError("notion down"))
    expect(res.status).toBe(502)
  })

  it("maps ConfigurationError to 500", async () => {
    const res = errorResponse(new ConfigurationError("missing secret"))
    expect(res.status).toBe(500)
  })

  it("maps a generic SpendlyError to 500", async () => {
    const res = errorResponse(new SpendlyError("custom", "CUSTOM"))
    expect(res.status).toBe(500)
    const json = (await body(res)) as { error: { code: string } }
    expect(json.error.code).toBe("CUSTOM")
  })

  it("maps a Zod-like error to 422 with issues", async () => {
    const zodLike = { issues: [{ path: ["amount"], message: "Required" }] }
    const res = errorResponse(zodLike)
    expect(res.status).toBe(422)
    const json = (await body(res)) as {
      error: { code: string; issues: unknown[] }
    }
    expect(json.error.code).toBe("VALIDATION_ERROR")
    expect(json.error.issues).toHaveLength(1)
  })

  it("maps an unknown error to 500 without leaking the message", async () => {
    const res = errorResponse(new Error("database password is hunter2"))
    expect(res.status).toBe(500)
    const json = (await body(res)) as { error: { code: string; message: string } }
    expect(json.error.code).toBe("INTERNAL_ERROR")
    expect(json.error.message).toBe("Something went wrong")
    expect(JSON.stringify(json)).not.toContain("hunter2")
  })
})

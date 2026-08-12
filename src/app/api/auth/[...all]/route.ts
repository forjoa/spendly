import { toNextJsHandler } from "better-auth/next-js"
import { getAuth } from "@/infrastructure/auth/auth"

// Resolve the handler lazily at request time so route module evaluation
// (which happens during `next build`) does not require live secrets.
let _handler: ReturnType<typeof toNextJsHandler> | undefined
function handler() {
  if (_handler) return _handler
  _handler = toNextJsHandler(getAuth())
  return _handler
}

export function GET(request: Request) {
  return handler().GET(request)
}

export function POST(request: Request) {
  return handler().POST(request)
}

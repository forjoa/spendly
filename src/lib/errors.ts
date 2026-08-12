/**
 * Typed error classes for Spendly.
 *
 * Domain and infrastructure code throw these so HTTP/API layers can map them
 * to the correct status code and message without leaking internals.
 */

export class SpendlyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

/** Input failed validation. Maps to HTTP 422. */
export class ValidationError extends SpendlyError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR")
  }
}

/** Authentication failed or was not provided. Maps to HTTP 401. */
export class AuthenticationError extends SpendlyError {
  constructor(message = "Unauthorized") {
    super(message, "AUTHENTICATION_ERROR")
  }
}

/** An external destination could not be reached or rejected the request. Maps to HTTP 502. */
export class DestinationError extends SpendlyError {
  constructor(message: string) {
    super(message, "DESTINATION_ERROR")
  }
}

/** The application is misconfigured (missing secret, bad key, etc). */
export class ConfigurationError extends SpendlyError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR")
  }
}

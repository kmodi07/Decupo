export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("unauthorized", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that") {
    super("forbidden", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource") {
    super("not_found", 404, `${entity} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", 409, message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("validation_error", 400, message, details);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super("invalid_transition", 409, `Cannot move from ${from} to ${to}`, { from, to });
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(required: number, available: number) {
    super("insufficient_credits", 402, `Needs ${required} credits but only ${available} are available`, {
      required,
      available,
    });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

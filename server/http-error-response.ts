const HTTP_STATUS_MIN = 400;
const HTTP_STATUS_MAX = 599;
const PUBLIC_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

type ErrorLike = {
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
  code?: unknown;
};

export type PublicHttpError = {
  status: number;
  message: string;
  code: string;
};

function isHttpErrorStatus(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= HTTP_STATUS_MIN &&
    value <= HTTP_STATUS_MAX
  );
}

function defaultErrorCode(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 422) return "UNPROCESSABLE_CONTENT";
  if (status === 429) return "TOO_MANY_REQUESTS";
  return status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
}

function readErrorLike(error: unknown): ErrorLike {
  return error && typeof error === "object" ? (error as ErrorLike) : {};
}

export function toPublicHttpError(
  error: unknown,
  options: {
    fallbackStatus?: number;
    internalMessage?: string;
    clientMessage?: string;
  } = {},
): PublicHttpError {
  const errorLike = readErrorLike(error);
  const fallbackStatus = isHttpErrorStatus(options.fallbackStatus)
    ? options.fallbackStatus
    : 500;
  const status = isHttpErrorStatus(errorLike.status)
    ? errorLike.status
    : isHttpErrorStatus(errorLike.statusCode)
      ? errorLike.statusCode
      : fallbackStatus;

  if (status >= 500) {
    return {
      status,
      message: options.internalMessage?.trim() || "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    };
  }

  const rawMessage =
    typeof errorLike.message === "string" ? errorLike.message.trim() : "";
  const rawCode = typeof errorLike.code === "string" ? errorLike.code.trim() : "";

  return {
    status,
    message: rawMessage || options.clientMessage?.trim() || "Request failed",
    code: PUBLIC_ERROR_CODE_PATTERN.test(rawCode)
      ? rawCode
      : defaultErrorCode(status),
  };
}

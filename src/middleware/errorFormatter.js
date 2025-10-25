const mongoose = require("mongoose");
const { MongoServerError } = require("mongodb");

const DUPLICATE_KEY_ERROR = 11000;

const formatValidationError = (error) => {
  const fieldErrors = Object.values(error.errors || {}).reduce(
    (acc, current) => {
      if (current?.path) {
        acc[current.path] = current.message;
      }
      return acc;
    },
    {}
  );

  return {
    status: 400,
    code: "ValidationError",
    message: "Validation failed",
    details: Object.keys(fieldErrors).length ? fieldErrors : undefined,
  };
};

const formatCastError = (error) => ({
  status: 400,
  code: "ValidationError",
  message: `Invalid value for ${error.path}`,
  details: { [error.path]: `Expected ${error.kind}` },
});

const formatMongoServerError = (error) => {
  if (error.code === DUPLICATE_KEY_ERROR) {
    return {
      status: 409,
      code: "Conflict",
      message: "Duplicate value",
      details: { index: error.index, keyValue: error.keyValue },
    };
  }

  return {
    status: 503,
    code: "DatabaseError",
    message: "Database operation failed",
  };
};

const formatZodError = (error) => {
  const details =
    error.issues?.reduce((acc, issue) => {
      const path = issue.path?.join(".") || "_root";
      acc[path] = issue.message;
      return acc;
    }, {}) || {};

  return {
    status: 400,
    code: "ValidationError",
    message: "Validation failed",
    details: Object.keys(details).length ? details : undefined,
  };
};

const formatJoiError = (error) => {
  const details =
    error.details?.reduce((acc, item) => {
      if (item?.path) {
        acc[item.path.join(".")] = item.message;
      }
      return acc;
    }, {}) || {};

  return {
    status: 400,
    code: "ValidationError",
    message: "Validation failed",
    details: Object.keys(details).length ? details : undefined,
  };
};

const formatBodyParserError = () => ({
  status: 400,
  code: "InvalidJSON",
  message: "Malformed JSON payload",
});

const normalizeDetails = (details) => {
  if (!details || typeof details !== "object") {
    return undefined;
  }

  const keys = Object.keys(details);
  if (!keys.length) {
    return undefined;
  }

  return details;
};

const CODE_TO_STATUS = {
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  ValidationError: 400,
  InvalidJSON: 400,
  PreconditionFailed: 412,
  TooManyRequests: 429,
  DatabaseError: 503,
  InternalServerError: 500,
};

const DEFAULT_MESSAGE_BY_CODE = {
  Unauthorized: "Authentication required",
  Forbidden: "Insufficient role",
  NotFound: "Resource not found",
  Conflict: "Conflict",
  ValidationError: "Validation failed",
  InvalidJSON: "Malformed JSON payload",
  PreconditionFailed: "Precondition failed",
  TooManyRequests: "Too many requests",
  DatabaseError: "Database operation failed",
  InternalServerError: "Internal server error",
};

const buildFallback = (error) => {
  // Prefer provided code/status but normalize according to OpenAPI overview
  let code = error.code;
  let status = Number(error.status);

  if (!code) {
    // derive code from status if possible
    if (Number.isInteger(status)) {
      if (status === 401) code = "Unauthorized";
      else if (status === 403) code = "Forbidden";
      else if (status === 404) code = "NotFound";
      else if (status === 409) code = "Conflict";
      else if (status === 412) code = "PreconditionFailed";
      else if (status === 429) code = "TooManyRequests";
      else if (status >= 500) code = "InternalServerError";
      else code = "BadRequest";
    } else {
      code = "InternalServerError";
    }
  }

  // If status is missing/invalid, infer from code mapping
  if (!Number.isInteger(status) || status <= 0) {
    status = CODE_TO_STATUS[code] || (code === "BadRequest" ? 400 : 500);
  }

  const fallbackMsg =
    DEFAULT_MESSAGE_BY_CODE[code] ||
    (status >= 500 ? "Internal server error" : "Request failed");
  const message = error.message || fallbackMsg;

  return {
    status,
    code,
    message,
    details: normalizeDetails(error.details),
  };
};

const formatError = (error) => {
  if (!error) {
    return {
      status: 500,
      code: "InternalServerError",
      message: "Internal server error",
    };
  }

  if (error.__isFormatted) {
    return error;
  }

  if (error.type === "entity.parse.failed" && error.expose) {
    return formatBodyParserError(error);
  }

  if (error.name === "ZodError") {
    return formatZodError(error);
  }

  if (error.isJoi) {
    return formatJoiError(error);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return formatValidationError(error);
  }

  if (error instanceof mongoose.Error.CastError) {
    return formatCastError(error);
  }

  if (error instanceof MongoServerError || error?.name === "MongoServerError") {
    return formatMongoServerError(error);
  }

  return buildFallback(error);
};

function errorFormatter(err, req, res, next) {
  const targetError =
    err && typeof err === "object" ? err : { message: String(err) };
  const formatted = formatError(targetError);

  targetError.status = formatted.status;
  targetError.code = formatted.code;
  targetError.message = formatted.message;
  targetError.details = normalizeDetails(formatted.details);
  targetError.__isFormatted = true;

  next(targetError);
}

module.exports = errorFormatter;

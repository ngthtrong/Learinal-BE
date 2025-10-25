const assert = require("assert");
const mongoose = require("mongoose");
const errorFormatter = require("../src/middleware/errorFormatter");

const runCase = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
};

const invokeFormatter = (error) =>
  new Promise((resolve) => {
    errorFormatter(error, {}, {}, (formatted) => resolve(formatted));
  });

runCase("fallback error -> InternalServerError", async () => {
  const err = new Error("Boom");
  const formatted = await invokeFormatter(err);

  assert.strictEqual(formatted.status, 500);
  assert.strictEqual(formatted.code, "InternalServerError");
  assert.strictEqual(formatted.message, "Boom");
  assert.strictEqual(formatted.__isFormatted, true);
});

runCase("mongoose ValidationError maps field details", async () => {
  const err = new mongoose.Error.ValidationError();
  err.addError(
    "email",
    new mongoose.Error.ValidatorError({
      message: "Email is required",
      path: "email",
    })
  );

  const formatted = await invokeFormatter(err);

  assert.strictEqual(formatted.status, 400);
  assert.strictEqual(formatted.code, "ValidationError");
  assert.deepStrictEqual(formatted.details, { email: "Email is required" });
});

runCase("duplicate key MongoServerError -> Conflict", async () => {
  const err = {
    name: "MongoServerError",
    code: 11000,
    index: "users_email_unique",
    keyValue: { email: "dup@example.com" },
  };

  const formatted = await invokeFormatter(err);

  assert.strictEqual(formatted.status, 409);
  assert.strictEqual(formatted.code, "Conflict");
  assert.deepStrictEqual(formatted.details, {
    index: "users_email_unique",
    keyValue: { email: "dup@example.com" },
  });
});

runCase("body parser error -> InvalidJSON", async () => {
  const err = {
    type: "entity.parse.failed",
    expose: true,
  };

  const formatted = await invokeFormatter(err);

  assert.strictEqual(formatted.status, 400);
  assert.strictEqual(formatted.code, "InvalidJSON");
  assert.strictEqual(formatted.message, "Malformed JSON payload");
  assert.strictEqual(formatted.details, undefined);
});

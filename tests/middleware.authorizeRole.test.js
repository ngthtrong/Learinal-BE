const assert = require("assert");
const authorizeRole = require("../src/middleware/authorizeRole");

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

const invokeMiddleware = (middleware, { req = {}, res = {} } = {}) =>
  new Promise((resolve) => {
    const mockReq = {
      headers: {},
      ...req,
    };

    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ type: "response", statusCode: this.statusCode, body });
      },
      ...res,
    };

    middleware(mockReq, mockRes, (result) => {
      resolve({ type: "next", value: result, req: mockReq });
    });
  });

runCase("without req.user -> 401", async () => {
  const middleware = authorizeRole("Admin");
  const outcome = await invokeMiddleware(middleware, { req: { headers: {} } });
  assert.strictEqual(outcome.type, "next");
  assert.ok(outcome.value instanceof Error);
  assert.strictEqual(outcome.value.status, 401);
  assert.strictEqual(outcome.value.code, "Unauthorized");
});

runCase("allow when role matches", async () => {
  const middleware = authorizeRole("Admin", "Expert");
  const outcome = await invokeMiddleware(middleware, {
    req: {
      user: { id: "user-1", role: "Learner" },
      headers: {
        "x-dev-user-role": "Admin",
      },
    },
  });

  assert.strictEqual(outcome.type, "next");
  assert.strictEqual(outcome.value, undefined);
  assert.strictEqual(outcome.req.user.role, "Admin");
});

runCase("reject when role not allowed", async () => {
  const middleware = authorizeRole("Admin");
  const outcome = await invokeMiddleware(middleware, {
    req: {
      user: { id: "user-2", role: "Learner" },
      headers: {
        "x-dev-user-role": "Learner",
      },
    },
  });

  assert.strictEqual(outcome.type, "next");
  assert.ok(outcome.value instanceof Error);
  assert.strictEqual(outcome.value.status, 403);
  assert.strictEqual(outcome.value.code, "Forbidden");
  assert.deepStrictEqual(outcome.value.details, {
    requiredRoles: ["Admin"],
    userRole: "Learner",
  });
});

runCase("no roles provided -> allow", async () => {
  const middleware = authorizeRole();
  const outcome = await invokeMiddleware(middleware, {
    req: {
      user: { id: "user-3", role: "Learner" },
      headers: {},
    },
  });

  assert.strictEqual(outcome.type, "next");
  assert.strictEqual(outcome.value, undefined);
});

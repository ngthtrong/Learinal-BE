const assert = require("assert");
const authenticateJWT = require("../src/middleware/authenticateJWT");

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

const invokeMiddleware = (middleware, { headers = {}, req = {}, res = {} } = {}) =>
  new Promise((resolve) => {
    const mockReq = {
      headers: { ...headers },
      ...req,
    };

    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ type: "response", payload, statusCode: this.statusCode });
      },
      ...res,
    };

    middleware(mockReq, mockRes, (result) => {
      resolve({ type: "next", value: result, req: mockReq });
    });
  });

runCase("missing bearer token -> 401", async () => {
  const outcome = await invokeMiddleware(authenticateJWT, { headers: {} });
  assert.strictEqual(outcome.type, "next");
  assert.ok(outcome.value instanceof Error);
  assert.strictEqual(outcome.value.status, 401);
  assert.strictEqual(outcome.value.code, "Unauthorized");
});

runCase("valid stub token populates req.user", async () => {
  const outcome = await invokeMiddleware(authenticateJWT, {
    headers: {
      authorization: "Bearer fake-token",
      "x-dev-user-id": "test-user",
      "x-dev-user-email": "user@example.com",
      "x-dev-user-role": "Admin",
    },
  });

  assert.strictEqual(outcome.type, "next");
  assert.strictEqual(outcome.value, undefined);
  const { user } = outcome.req;
  assert.deepStrictEqual(user, {
    id: "test-user",
    userId: "test-user",
    email: "user@example.com",
    role: "Admin",
    token: "fake-token",
    isStub: true,
  });
});

runCase("defaults when dev headers missing", async () => {
  const outcome = await invokeMiddleware(authenticateJWT, {
    headers: {
      authorization: "Bearer another-token",
    },
  });

  assert.strictEqual(outcome.type, "next");
  const { user } = outcome.req;
  assert.strictEqual(user.id, "stub-user");
  assert.strictEqual(user.role, "Learner");
  assert.strictEqual(user.email, null);
});

// Idempotency-Key infrastructure (in-memory implementation)
// Usage options:
// - requireIdempotencyKey: validate presence/format for mutating requests
// - idempotencyKey: capture and replay responses for the same key within TTL

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

class InMemoryIdempotencyStore {
  constructor() {
    this.map = new Map();
  }

  _now() {
    return Date.now();
  }

  get(key) {
    const rec = this.map.get(key);
    if (!rec) return null;
    if (rec.expiresAt && this._now() > rec.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return rec;
  }

  set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    const expiresAt = this._now() + Math.max(1, ttlSeconds) * 1000;
    this.map.set(key, { ...value, expiresAt });
  }

  delete(key) {
    this.map.delete(key);
  }
}

function getIdempotencyHeader(req) {
  return req.get("Idempotency-Key") || req.get("idempotency-key") || null;
}

function makeCompositeKey(req, keyHeader) {
  const userPart = req.user?.userId || req.user?.id || "anon";
  const method = req.method;
  const path = req.originalUrl || req.url || "";
  return `${method}:${path}:${userPart}:${keyHeader}`;
}

function requireIdempotencyKey({ headerOptionalFor = [] } = {}) {
  // headerOptionalFor: array of methods where header is optional (e.g., ["PUT","PATCH"]) — default requires for POST
  const optionalSet = new Set(
    (headerOptionalFor || []).map((m) => m.toUpperCase())
  );
  return function (req, _res, next) {
    const method = (req.method || "POST").toUpperCase();
    const requires = method === "POST" && !optionalSet.has(method);
    if (!requires) return next();
    const header = getIdempotencyHeader(req);
    if (!header || typeof header !== "string" || !header.trim()) {
      const err = new Error("Validation failed");
      err.status = 400;
      err.code = "ValidationError";
      err.details = { "Idempotency-Key": "required for POST" };
      return next(err);
    }
    return next();
  };
}

function idempotencyKey({
  store = new InMemoryIdempotencyStore(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
  captureMethods = ["POST"],
  includeHeaders = ["ETag", "Location"],
} = {}) {
  const methods = new Set(captureMethods.map((m) => m.toUpperCase()));

  return function (req, res, next) {
    if (!methods.has((req.method || "").toUpperCase())) {
      return next();
    }

    const keyHeader = getIdempotencyHeader(req);
    if (!keyHeader) {
      // If header is missing, skip capture/replay; route-level requireIdempotencyKey can enforce
      return next();
    }

    const compositeKey = makeCompositeKey(req, keyHeader);
    const existing = store.get(compositeKey);
    if (existing && existing.status === "completed") {
      // Replay stored response
      req.idempotency = {
        key: keyHeader,
        compositeKey,
        replayed: true,
        status: "replayed",
      };
      res.set("Idempotency-Key", keyHeader);
      res.set("Idempotency-Replayed", "true");
      if (existing.headers) {
        for (const h of includeHeaders) {
          const val = existing.headers[h.toLowerCase()];
          if (val) res.set(h, val);
        }
      }
      res.status(existing.statusCode || 200);
      return res.json(existing.body ?? {});
    }
    if (existing && existing.status === "in-progress") {
      const err = new Error(
        "Another request with the same Idempotency-Key is in progress"
      );
      err.status = 409;
      err.code = "Conflict";
      err.details = { retryAfterSeconds: 2 };
      return next(err);
    }

    // Mark in-progress and attach info to req
    store.set(
      compositeKey,
      { status: "in-progress", startedAt: Date.now() },
      ttlSeconds
    );
    req.idempotency = {
      key: keyHeader,
      compositeKey,
      replayed: false,
      status: "in-progress",
    };

    // Wrap res.json/res.send to capture output
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let bodySnapshot;

    res.json = function (body) {
      bodySnapshot = body;
      return originalJson(body);
    };
    res.send = function (body) {
      try {
        bodySnapshot =
          body && typeof body === "string" ? JSON.parse(body) : body;
      } catch (_) {
        // Non-JSON; store as-is
        bodySnapshot = body;
      }
      return originalSend(body);
    };

    res.on("finish", () => {
      try {
        const statusCode = res.statusCode;
        // Only cache successful 2xx responses
        if (statusCode >= 200 && statusCode < 300) {
          const headers = {};
          for (const h of includeHeaders) {
            const val = res.get(h);
            if (val) headers[h.toLowerCase()] = val;
          }
          store.set(
            compositeKey,
            {
              status: "completed",
              statusCode,
              body: bodySnapshot,
              headers,
              completedAt: Date.now(),
            },
            ttlSeconds
          );
        } else {
          // Non-successful; drop the in-progress record so client can retry later
          store.delete(compositeKey);
        }
      } catch (_) {
        // Ignore capture errors
      }
    });

    res.set("Idempotency-Key", keyHeader);
    return next();
  };
}

module.exports = {
  InMemoryIdempotencyStore,
  requireIdempotencyKey,
  idempotencyKey,
  makeCompositeKey,
};

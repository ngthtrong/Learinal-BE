const sanitizeInputs = require("../../src/middleware/sanitizeInputs");

describe("Input Sanitization Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
    };
    res = {};
    next = jest.fn();
  });

  describe("NoSQL Injection Prevention", () => {
    it("should remove MongoDB operators from request body", () => {
      req.body = {
        email: "test@example.com",
        $gt: "",
        $ne: "admin",
      };

      sanitizeInputs(req, res, next);

      expect(req.body).toEqual({
        email: "test@example.com",
      });
      expect(req.body.$gt).toBeUndefined();
      expect(req.body.$ne).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("should remove dot notation keys", () => {
      req.body = {
        email: "test@example.com",
        "user.role": "admin",
        "settings.level": 10,
      };

      sanitizeInputs(req, res, next);

      expect(req.body).toEqual({
        email: "test@example.com",
      });
      expect(req.body["user.role"]).toBeUndefined();
    });

    it("should prevent prototype pollution", () => {
      req.body = {
        email: "test@example.com",
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
        prototype: { isAdmin: true },
      };

      sanitizeInputs(req, res, next);

      expect(req.body).toEqual({
        email: "test@example.com",
      });
      // Note: __proto__ becomes an empty object due to JavaScript behavior,
      // but the dangerous properties are removed
      expect(req.body.constructor).toBeUndefined();
      expect(req.body.prototype).toBeUndefined();
    });

    it("should sanitize nested objects", () => {
      req.body = {
        user: {
          email: "test@example.com",
          $gt: "",
          profile: {
            name: "Test User",
            $ne: "admin",
          },
        },
      };

      sanitizeInputs(req, res, next);

      expect(req.body.user.$gt).toBeUndefined();
      expect(req.body.user.profile.$ne).toBeUndefined();
      expect(req.body.user.email).toBe("test@example.com");
      expect(req.body.user.profile.name).toBe("Test User");
    });

    it("should sanitize arrays", () => {
      req.body = {
        items: [
          { name: "Item 1", $gt: "" },
          { name: "Item 2", $ne: "admin" },
        ],
      };

      sanitizeInputs(req, res, next);

      expect(req.body.items[0].$gt).toBeUndefined();
      expect(req.body.items[1].$ne).toBeUndefined();
      expect(req.body.items[0].name).toBe("Item 1");
      expect(req.body.items[1].name).toBe("Item 2");
    });
  });

  describe("String Sanitization", () => {
    it("should remove null bytes from strings", () => {
      req.body = {
        name: "Test\0User",
        email: "test\0@example.com",
      };

      sanitizeInputs(req, res, next);

      expect(req.body.name).toBe("TestUser");
      expect(req.body.email).toBe("test@example.com");
    });

    it("should trim whitespace from strings", () => {
      req.body = {
        name: "  Test User  ",
        email: "   test@example.com   ",
      };

      sanitizeInputs(req, res, next);

      expect(req.body.name).toBe("Test User");
      expect(req.body.email).toBe("test@example.com");
    });
  });

  describe("Query Parameters", () => {
    it("should sanitize query parameters", () => {
      req.query = {
        page: "1",
        $gt: "100",
        "user.role": "admin",
      };

      sanitizeInputs(req, res, next);

      expect(req.query.page).toBe("1");
      expect(req.query.$gt).toBeUndefined();
      expect(req.query["user.role"]).toBeUndefined();
    });
  });

  describe("URL Parameters", () => {
    it("should sanitize URL parameters", () => {
      req.params = {
        id: "123",
        $gt: "",
      };

      sanitizeInputs(req, res, next);

      expect(req.params.id).toBe("123");
      expect(req.params.$gt).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle null body", () => {
      req.body = null;

      sanitizeInputs(req, res, next);

      expect(req.body).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it("should handle undefined query", () => {
      req.query = undefined;

      sanitizeInputs(req, res, next);

      expect(req.query).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("should handle non-object values", () => {
      req.body = {
        name: "Test",
        age: 25,
        active: true,
        score: null,
      };

      sanitizeInputs(req, res, next);

      expect(req.body.name).toBe("Test");
      expect(req.body.age).toBe(25);
      expect(req.body.active).toBe(true);
      expect(req.body.score).toBeNull();
    });

    it("should preserve empty objects and arrays", () => {
      req.body = {
        emptyObj: {},
        emptyArr: [],
      };

      sanitizeInputs(req, res, next);

      expect(req.body.emptyObj).toEqual({});
      expect(req.body.emptyArr).toEqual([]);
    });
  });

  describe("Real-World Attack Scenarios", () => {
    it("should prevent login bypass attempt", () => {
      req.body = {
        email: { $ne: null },
        password: { $ne: null },
      };

      sanitizeInputs(req, res, next);

      expect(req.body.email).toEqual({});
      expect(req.body.password).toEqual({});
    });

    it("should prevent privilege escalation", () => {
      req.body = {
        email: "user@example.com",
        role: { $set: "Admin" },
      };

      sanitizeInputs(req, res, next);

      expect(req.body.role).toEqual({});
    });

    it("should prevent regex injection", () => {
      req.body = {
        email: { $regex: ".*" },
      };

      sanitizeInputs(req, res, next);

      expect(req.body.email).toEqual({});
    });
  });
});

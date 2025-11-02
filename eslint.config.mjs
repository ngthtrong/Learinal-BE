import js from "@eslint/js";
import pluginImport from "eslint-plugin-import";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "*.config.js",
      "*.config.cjs",
      "eslint.config.mjs",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
    plugins: {
      import: pluginImport,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "error",
      "import/no-unresolved": "off",
      "import/no-extraneous-dependencies": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Allow Jest globals in test files and relax console usage there
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        jest: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  // Scripts can use console for CLI feedback
  {
    files: ["scripts/**/*.js", "test-email.js"],
    rules: {
      "no-console": "off",
    },
  },
];

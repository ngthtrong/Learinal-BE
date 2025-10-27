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
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
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
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];

// Next.js ships ESLint flat-config arrays directly (eslint-config-next).
// Import them as CommonJS and spread into our flat config.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**"],
  },
]

export default eslintConfig

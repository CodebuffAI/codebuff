import eslintConfigNext from "eslint-config-next";
import unusedImports from "eslint-plugin-unused-imports";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = [
  ...eslintConfigNext,
  {
    ignores: ["convex/_generated/**", "tailwind.config.ts"],
  },
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  eslintConfigPrettier,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "warn",
    },
  },
];

export default eslintConfig;

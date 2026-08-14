import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactCompiler from "eslint-plugin-react-compiler";

export default tseslint.config(
  { 
    // Ignore build artifacts and caches
    ignores: ["dist", ".vite"] 
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-compiler": reactCompiler,
    },
    rules: {
      // Load standard React hooks validation rules
      ...reactHooks.configs.recommended.rules,
      
      // Enforce React Compiler rules (triggers errors if rules of hooks are broken)
      "react-compiler/react-compiler": "error",
    },
  }
);

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // TypeScript's own type-checking already catches undefined identifiers;
      // core no-undef produces false positives on DOM globals (window, document).
      'no-undef': 'off',
    },
  },
);

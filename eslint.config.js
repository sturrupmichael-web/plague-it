// Code check: `npm run lint` (also run by the Tests workflow). It catches real mistakes
// (undefined names, unused variables, unreachable code), not formatting.
// The built index.html and _site/ aren't checked.

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['_site/', 'node_modules/', 'index.html', '.scratch/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  // Node scripts: the build and the tests.
  { files: ['*.mjs', 'tests/**/*.mjs'], languageOptions: { globals: { ...globals.node } } },
];

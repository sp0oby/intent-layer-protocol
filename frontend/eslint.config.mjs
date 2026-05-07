// Flat config (ESLint v9). Replaces the legacy .eslintrc.json after the
// Next 14 -> 16 upgrade — Next 16 dropped the `next lint` subcommand and
// requires direct ESLint usage with flat config.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];

export default config;

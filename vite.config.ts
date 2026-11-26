/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow passes
// the repository name in; local dev falls back to the current repo name.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'TravelPlanner';

export default defineConfig({
  base: `/${repo}/`,
  plugins: [react()],
  server: { port: 5173 },
  test: { include: ['src/**/*.test.ts', 'email-worker/src/**/*.test.ts'] },
});

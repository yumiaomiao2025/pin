import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'better-sqlite3',
        'drizzle-orm',
        'electron',
        ...builtinModules,
        ...builtinModules.map((moduleName) => `node:${moduleName}`),
      ],
    },
  },
});

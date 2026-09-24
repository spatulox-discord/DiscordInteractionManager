import { defineConfig } from 'tsup'

export default defineConfig([
    {
        entry: ['src/cli/MainCLI.ts'],  // ← Votre CLI
        format: ['cjs'],               // CLI = CJS seulement
        platform: 'node',              // Node.js CLI
        outDir: 'dist/',            // dist/cli/MainCLI.js
        sourcemap: false,
        minify: true,                   // CLI optimisé
        clean: true,
        // dependencies from package.json are left external by tsup
    }
])
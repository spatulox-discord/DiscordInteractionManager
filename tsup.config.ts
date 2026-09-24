import {cpSync} from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig([
    {
        entry: ['src/cli/MainCLI.ts'],
        format: ['cjs'],               // The CLI is only run, never imported
        platform: 'node',
        outDir: 'dist/',               // dist/MainCLI.js, the bin of package.json
        sourcemap: false,
        minify: true,
        clean: true,
        // dependencies from package.json are left external by tsup
        // The page of the web UI, served from dist/public
        onSuccess: async () => cpSync('src/web/public', 'dist/public', {recursive: true}),
    }
])

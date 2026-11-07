// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The MongoDB driver's URL parser requires "punycode/" (the npm package, not the Node built-in).
const punycode = fileURLToPath(new URL("./node_modules/punycode/punycode.js", import.meta.url));

const nitroOptions = { alias: { "punycode/": punycode } } as unknown as { preset?: string };

export default defineConfig({
  vite: {
    resolve: {
      // The MongoDB driver's URL parser requires "punycode/" (the npm package, not the Node built-in).
      alias: [{ find: /^punycode\/$/, replacement: punycode }],
    },
  },
  // `alias` is forwarded to nitro as-is; the wrapper's type lists only a subset of nitro options.
  nitro: nitroOptions,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

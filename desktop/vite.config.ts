import {defineConfig} from "vite";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: desktopRoot,
  base: "./",
  // One final Atlas dist: existing standalone UI plus a separately importable
  // original T3/Agent Host entry. The hosted entry is NOT auto-mounted by the
  // standalone index.html; the trusted owner explicitly imports/mounts it.
  build: {
    outDir: resolve(desktopRoot,"dist"),emptyOutDir: true,manifest:true,
    // Preserve the public mounted-Host exports of the secondary JS entry.
    // Without a strict entry signature Rollup may eliminate these exports,
    // leaving an asset that exists but cannot be imported by the T3 owner.
    rollupOptions:{preserveEntrySignatures:"strict",input:{
      desktop:resolve(desktopRoot,"index.html"),
      installedT3Host:resolve(desktopRoot,"src/atlas-react-surface.tsx")
    }}
  },
  server: {
    strictPort:true,port:1420,host:"127.0.0.1",
    fs:{allow:[resolve(desktopRoot,"..")]}
  },
  clearScreen:false
});

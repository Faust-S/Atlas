import {defineConfig} from "vite";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: desktopRoot,
  base: "./",
  build: {outDir: resolve(desktopRoot,"dist"),emptyOutDir: true},
  server: {
    strictPort:true,port:1420,host:"127.0.0.1",
    fs:{allow:[resolve(desktopRoot,"..")]}
  },
  clearScreen:false
});

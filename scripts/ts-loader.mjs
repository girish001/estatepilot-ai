import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && context.parentURL.includes("node_modules")) {
      return nextResolve(specifier, context);
    }
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier)) {
      const parentPath =
        context.parentURL && context.parentURL.startsWith("file://")
          ? path.dirname(fileURLToPath(context.parentURL))
          : process.cwd();
      for (const ext of [".ts", ".tsx", ".js", "/index.ts", "/index.js"]) {
        const candidate = path.resolve(parentPath, specifier + ext);
        if (fs.existsSync(candidate)) {
          return nextResolve(specifier + ext, context);
        }
      }
    }
    return nextResolve(specifier, context);
  }
});

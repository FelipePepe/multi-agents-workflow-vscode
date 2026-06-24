// @ts-check
const esbuild = require("esbuild");

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],  // vscode is provided by the host — never bundle it
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: !isWatch,
};

if (isWatch) {
  esbuild.context(options).then((ctx) => {
    ctx.watch();
    console.log("[esbuild] watching...");
  });
} else {
  esbuild.build(options).then(() => {
    console.log("[esbuild] built");
  });
}

// Rasterizes the SVG masters in assets/ into the PNG sources required by
// @capacitor/assets, then runs the generator for the Android platform.
// Regenerate everything with: npm run android:assets
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const rasterize = async (svgPath, pngPath, size) => {
  const svg = await readFile(svgPath);
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(pngPath);
  console.log(`wrote ${pngPath}`);
};

await rasterize("assets/icon.svg", "assets/icon-only.png", 1024);
await rasterize("assets/icon-foreground.svg", "assets/icon-foreground.png", 1024);

// Adaptive-icon background: flat brand surface color.
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: "#050816" },
}).png().toFile("assets/icon-background.png");
console.log("wrote assets/icon-background.png");

await rasterize("assets/splash.svg", "assets/splash.png", 2732);
await rasterize("assets/splash.svg", "assets/splash-dark.png", 2732);

execFileSync("npx", ["capacitor-assets", "generate", "--android"], {
  stdio: "inherit",
});

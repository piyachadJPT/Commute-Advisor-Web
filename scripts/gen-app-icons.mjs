// Renders the PNG icon set from src/app/icon.svg (plan §11.11).
// Run: npm run app-icons
//   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png  (manifest)
//   src/app/apple-icon.png (180 px, picked up by Next as the apple-touch-icon)
// The SVG is full-bleed and keeps its artwork inside the maskable safe zone, so one source
// serves "any" and "maskable".
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg");
mkdirSync("public/icons", { recursive: true });

const outputs = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-512.png", 512],
  ["src/app/apple-icon.png", 180],
];

for (const [path, size] of outputs) {
  await sharp(svg, { density: ((72 * size) / 512) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path);
  console.log(`wrote ${path} (${size}x${size})`);
}

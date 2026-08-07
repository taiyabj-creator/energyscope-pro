import fs from "fs";
import path from "path";

const distDir = path.resolve("dist");
const outputDir = path.resolve(".output/public");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const files = fs.readdirSync(distDir);

for (const file of files) {
  if (
    file === "sw.js" ||
    file.startsWith("workbox-") ||
    file.startsWith("registerSW")
  ) {
    fs.copyFileSync(
      path.join(distDir, file),
      path.join(outputDir, file)
    );

    console.log(`Copied ${file}`);
  }
}

console.log("PWA files copied successfully.");
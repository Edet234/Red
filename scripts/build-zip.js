const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const root = path.join(__dirname, "..");
const src = path.join(root, "extension");
const outDir = path.join(root, "public", "downloads");
const out = path.join(outDir, "spribe-sensor.zip");

fs.mkdirSync(outDir, { recursive: true });
const output = fs.createWriteStream(out);
const archive = archiver("zip", { zlib: { level: 9 } });
output.on("close", () => console.log(`zipped ${archive.pointer()} bytes -> ${out}`));
archive.on("error", (e) => { throw e; });
archive.pipe(output);
archive.directory(src, false);
archive.finalize();

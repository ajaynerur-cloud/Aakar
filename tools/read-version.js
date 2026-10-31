// Reads the Aakar version from app/index.html and writes it into package.json.
// Usage: node tools/read-version.js [path-to-html]
const fs = require('fs');
const file = process.argv[2] || 'app/index.html';
const html = fs.readFileSync(file, 'utf8');
const V = '(\\d+\\.\\d+\\.\\d+)';

// Most specific patterns first.
const patterns = [
  new RegExp(`<meta[^>]+name=["'](?:aakar-version|app-version|version)["'][^>]+content=["']v?${V}`, 'i'),
  new RegExp(`<meta[^>]+content=["']v?${V}["'][^>]+name=["'](?:aakar-version|app-version|version)["']`, 'i'),
  new RegExp(`(?:AAKAR_VERSION|APP_VERSION|APP_VER|AAKAR_VER)\\s*[=:]\\s*["'\`]v?${V}`, 'i'),
  new RegExp(`<title>[^<]*?v?${V}[^<]*</title>`, 'i'),
  new RegExp(`["']?version["']?\\s*[:=]\\s*["'\`]v?${V}["'\`]`, 'i'),
  new RegExp(`Aakar[\\s_\\-]*v?${V}`, 'i'),
];

let version = null, how = null;
for (const re of patterns) {
  const m = html.match(re);
  if (m) { version = m[1]; how = re.source; break; }
}

if (!version) {
  console.error(`::error::No version found in ${file}. Add e.g. <meta name="aakar-version" content="8.63.2"> to the <head>.`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const old = pkg.version;
pkg.version = version;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version from ${file}: ${version} (package.json was ${old})`);
console.log(`Matched pattern: ${how}`);
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `APP_VERSION=${version}\n`);

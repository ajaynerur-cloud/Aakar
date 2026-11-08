// Builds the Android project from ../app/index.html with Capacitor. Run from the mobile/ folder:
//   npm install && node prepare.js && cd android && ./gradlew assembleDebug
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '..'), app = path.join(root, 'app'), www = path.join(__dirname, 'www');
const run = (c) => { console.log('> ' + c); cp.execSync(c, { cwd: __dirname, stdio: 'inherit' }); };

const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const m = html.match(/<title>\s*Aakar\s+(\d+(?:\.\d+){1,3})/i);
const version = process.env.APP_VERSION || (m ? m[1] : '1.0.0');
const parts = version.split('.').map((x) => parseInt(x, 10) || 0);
const code = Number(process.env.VERSION_CODE) || (parts[0] * 1000000 + (parts[1] || 0) * 10000 + (parts[2] || 0) * 100 + (parts[3] || 0));
console.log('Aakar version', version, 'versionCode', code);

// 1) web assets
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www, { recursive: true });
fs.copyFileSync(path.join(app, 'index.html'), path.join(www, 'index.html'));
const occt = path.join(app, 'occt'); if (fs.existsSync(occt)) fs.cpSync(occt, path.join(www, 'occt'), { recursive: true });
fs.readdirSync(app).filter((f) => /\.json$/i.test(f)).forEach((f) => fs.copyFileSync(path.join(app, f), path.join(www, f)));
// WebView serves .mjs as text/plain on some devices; a .js twin lets module loaders fall back
if (fs.existsSync(path.join(www, 'occt'))) fs.readdirSync(path.join(www, 'occt')).filter((f) => /\.mjs$/.test(f)).forEach((f) => fs.copyFileSync(path.join(www, 'occt', f), path.join(www, 'occt', f.replace(/\.mjs$/, '.mjs.js'))));

// 2) capacitor config
fs.writeFileSync(path.join(__dirname, 'capacitor.config.json'), JSON.stringify({
  appId: 'com.aakar.mobile', appName: 'Aakar', webDir: 'www', backgroundColor: '#0d1118',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: true }
}, null, 2));

// 3) android project
if (!fs.existsSync(path.join(__dirname, 'android'))) run('npx cap add android'); else run('npx cap sync android');
run('npx cap copy android');

// 4) manifest: any orientation (tablet portrait + landscape), hardware accelerated, keyboard resizes the page
const man = path.join(__dirname, 'android/app/src/main/AndroidManifest.xml');
let x = fs.readFileSync(man, 'utf8');
x = x.replace(/<activity\b([^>]*)>/, (all, a) => {
  a = a.replace(/\s+android:(screenOrientation|hardwareAccelerated|windowSoftInputMode)="[^"]*"/g, '');
  return '<activity' + a + '\n            android:screenOrientation="fullUser"\n            android:hardwareAccelerated="true"\n            android:windowSoftInputMode="adjustResize">';
});
fs.writeFileSync(man, x);

// 5) version + big heap for large sketches
const gr = path.join(__dirname, 'android/app/build.gradle'); let g = fs.readFileSync(gr, 'utf8');
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + code).replace(/versionName\s+"[^"]*"/, 'versionName "' + version + '"');
fs.writeFileSync(gr, g);
const mf = path.join(__dirname, 'android/app/src/main/AndroidManifest.xml'); let mx = fs.readFileSync(mf, 'utf8');
if (!/android:largeHeap/.test(mx)) mx = mx.replace(/<application\b/, '<application android:largeHeap="true"'); fs.writeFileSync(mf, mx);

// 5b) Gradle download: the wrapper's default 10 s network timeout failed on GitHub runners. Use the zip the workflow pre-downloaded (GRADLE_ZIP) or a longer timeout.
const wp = path.join(__dirname, 'android/gradle/wrapper/gradle-wrapper.properties'); let w = fs.readFileSync(wp, 'utf8');
w = w.replace(/-all\.zip/, '-bin.zip').replace(/networkTimeout=\d+/, 'networkTimeout=300000'); if (!/networkTimeout/.test(w)) w += '\nnetworkTimeout=300000\n';
if (process.env.GRADLE_ZIP && fs.existsSync(process.env.GRADLE_ZIP)) w = w.replace(/distributionUrl=.*/, 'distributionUrl=file\\:' + process.env.GRADLE_ZIP.replace(/\\/g, '/'));
fs.writeFileSync(wp, w);
const gp = path.join(__dirname, 'android/gradle.properties'); let gx = fs.readFileSync(gp, 'utf8');
if (!/connectionTimeout/.test(gx)) gx += '\norg.gradle.internal.http.connectionTimeout=120000\norg.gradle.internal.http.socketTimeout=120000\norg.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8\n'; fs.writeFileSync(gp, gx);

// 6) launcher icon (uses the repo icon for every density)
const icon = path.join(root, 'assets', 'aakar-icon.png');
if (fs.existsSync(icon)) {
  const res = path.join(__dirname, 'android/app/src/main/res');
  fs.readdirSync(res).filter((d) => /^mipmap-/.test(d) && !/anydpi/.test(d)).forEach((d) => ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].forEach((n) => { if (fs.existsSync(path.join(res, d, n))) fs.copyFileSync(icon, path.join(res, d, n)); }));
}
console.log('Android project ready: mobile/android');

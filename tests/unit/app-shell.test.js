// The native shell's configuration — EPIC-6 stories E6-1 and E6-2.
//
// These assert the things that are easy to get wrong once and never notice, because
// nothing on the website exercises them and nobody looks at an Android project until it is
// on a phone: the app identity, and whether the native chrome still matches the design
// tokens after someone changes a colour in styles.css.
//
// They deliberately do NOT try to test that the app builds. That needs a JDK and the
// Android SDK and belongs in `npm run app:build`, not in the offline suite.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = (p) => resolve(process.cwd(), p);
const read = (p) => readFileSync(root(p), 'utf8');

// The single source of truth for both. --ink is the page background; --gold is the accent.
const INK = '#0B1520';
const GOLD = '#C9A24B';

describe('design tokens are the source for the native chrome', () => {
  it('the tokens this suite checks against are the ones styles.css actually defines', () => {
    // Without this, every assertion below could pass while the app looked nothing like the
    // site: they would all be agreeing with a constant that had drifted.
    const css = read('src/styles.css');
    expect(css).toContain('--ink:' + INK);
    expect(css).toContain('--gold:' + GOLD);
  });

  it('capacitor.config.json themes the splash, status bar and window to --ink', () => {
    const cfg = JSON.parse(read('capacitor.config.json'));
    expect(cfg.android.backgroundColor).toBe(INK);
    expect(cfg.plugins.SplashScreen.backgroundColor).toBe(INK);
    expect(cfg.plugins.StatusBar.backgroundColor).toBe(INK);
    expect(cfg.plugins.SplashScreen.spinnerColor).toBe(GOLD);
  });

  it('the asset generator uses the same two colours', () => {
    const script = read('scripts/make-app-assets.mjs');
    expect(script).toContain("INK = '" + INK + "'");
    expect(script).toContain("GOLD = '" + GOLD + "'");
  });

  it('the PWA manifest has not drifted from them either', () => {
    // The installed app, the home-screen PWA and the website are meant to be one thing.
    const manifest = JSON.parse(read('src/public/manifest.json'));
    expect(manifest.background_color).toBe(INK);
    expect(manifest.theme_color).toBe(INK);
  });

  it('ui/native.js sets the status bar to the same ink', () => {
    expect(read('src/ui/native.js')).toContain(INK);
  });
});

describe('app identity', () => {
  it('declares a stable reverse-domain id and the product name', () => {
    const cfg = JSON.parse(read('capacitor.config.json'));
    // The appId is the Play Store primary key. Changing it after publishing makes a
    // different app that existing installs will never update to.
    expect(cfg.appId).toBe('dev.dalalstreet.live');
    expect(cfg.appName).toBe('Dalal Street Live');
  });

  it('builds from dist, not src', () => {
    // webDir has to be the built single-file artefact. Pointing it at src/ would ship a
    // page whose module imports resolve to nothing inside the WebView.
    expect(JSON.parse(read('capacitor.config.json')).webDir).toBe('dist');
  });

  it('carries the identity through to the Android project', () => {
    const strings = read('android/app/src/main/res/values/strings.xml');
    expect(strings).toContain('<string name="app_name">Dalal Street Live</string>');
    expect(strings).toContain('dev.dalalstreet.live');
  });
});

describe('generated launcher assets', () => {
  const icons = [
    'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    'android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
    'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'
  ];

  it('exists at every density', () => {
    for (const p of icons) expect(existsSync(root(p)), p + ' is missing').toBe(true);
  });

  it('is not the stock Capacitor logo', () => {
    // The default icon ships silently and is only noticed on a home screen. Byte size is a
    // crude but sufficient tell: the generated mark and the Capacitor default differ, and
    // any icon under a few hundred bytes is a placeholder or an empty file.
    for (const p of icons){
      const bytes = readFileSync(root(p)).length;
      expect(bytes, p + ' looks like a placeholder').toBeGreaterThan(500);
    }
  });

  it('has an adaptive-icon foreground and background', () => {
    // Android 8+ masks the foreground to whatever shape the launcher uses. Without a
    // separate background layer the icon gets a white plate behind it.
    expect(existsSync(root('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'))).toBe(true);
    expect(existsSync(root('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'))).toBe(true);
    expect(existsSync(root('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png'))).toBe(true);
  });

  it('has portrait and landscape splashes, light and dark', () => {
    for (const p of [
      'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
      'android/app/src/main/res/drawable-land-xxxhdpi/splash.png',
      'android/app/src/main/res/drawable-port-night-xxxhdpi/splash.png'
    ]) expect(existsSync(root(p)), p + ' is missing').toBe(true);
  });
});

describe('Play Store release signing — E6-3', () => {
  const gradle = () => read('android/app/build.gradle');

  it('never hardcodes a keystore path, password or alias', () => {
    // The whole point of reading these from a gitignored file or the environment is that
    // they cannot end up in the repository. A committed password would be worse than a
    // lost key: anyone with the repo could ship an update that Play and every installed
    // device accept as genuine.
    const g = gradle();
    expect(g).not.toMatch(/storePassword\s+["'][^"']+["']/);
    expect(g).not.toMatch(/keyPassword\s+["'][^"']+["']/);
    expect(g).not.toMatch(/storeFile\s+file\(["'][^"']*\.jks["']\)/);
  });

  it('reads signing material from keystore.properties or the environment', () => {
    const g = gradle();
    expect(g).toContain('keystore.properties');
    for (const v of ['ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_PASSWORD',
                     'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']){
      expect(g, v + ' is not read from the environment').toContain(v);
    }
  });

  it('leaves the release build unsigned rather than failing when no key is present', () => {
    // A clean checkout has no key, and `assembleDebug` has to keep working for anyone who
    // just wants to sideload. Guarding the signingConfig assignment is what allows that.
    expect(gradle()).toMatch(/if\s*\(hasSigningKey\)\s*\{\s*signingConfig signingConfigs\.release/);
  });

  it('takes the version from the environment, so CI can guarantee it increases', () => {
    // Play refuses a versionCode it has already accepted. A literal 1 here means every
    // upload after the first is rejected.
    const g = gradle();
    expect(g).toContain('ANDROID_VERSION_CODE');
    expect(g).toMatch(/versionCode buildVersionCode/);
    expect(g).not.toMatch(/versionCode\s+1\b/);
  });

  it('gitignores every form signing material takes', () => {
    const ignore = read('.gitignore');
    for (const pattern of ['*.keystore', '*.jks', '*.p12', 'keystore.properties']){
      expect(ignore, pattern + ' is not ignored').toContain(pattern);
    }
  });

  it('the release workflow destroys the keystore even when the build fails', () => {
    const wf = read('.github/workflows/android-release.yml');
    expect(wf).toContain('if: always()');
    expect(wf).toMatch(/rm -f .*upload-keystore\.jks/);
    // Read-only: a workflow holding the signing key has no business writing to the repo.
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
    // Manual only. An automatic release build on every push would sign and publish
    // artefacts nobody asked for.
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s{2}push:/m);
  });
});

describe('Play Store listing graphics — E6-3', () => {
  it('uses the same two design tokens as everything else', () => {
    const script = read('scripts/make-play-assets.mjs');
    expect(script).toContain("INK = '" + INK + "'");
    expect(script).toContain("GOLD = '" + GOLD + "'");
  });

  it('asserts the dimensions Play enforces, rather than trusting them', () => {
    // Play rejects an icon that is not exactly 512x512 or a feature graphic that is not
    // exactly 1024x500, and it rejects either with an alpha channel. Finding that out on
    // upload wastes a round trip.
    const script = read('scripts/make-play-assets.mjs');
    expect(script).toMatch(/icon\.width !== 512/);
    expect(script).toMatch(/feature\.width !== 1024/);
    expect(script).toMatch(/icon\.hasAlpha/);
    expect(script).toMatch(/feature\.hasAlpha/);
    expect(script).toContain('flatten');
  });
});

describe('what the native shell must not break on the web', () => {
  it('the web bundle does not import the Capacitor runtime', () => {
    // ui/native.js reaches through window.Capacitor precisely so the plugins stay out of
    // the single-file artefact. An `import` would pull Capacitor's runtime into the page
    // GitHub Pages serves, for code that can never run there.
    //
    // Anchored to a statement at the start of a line, not a bare substring: native.js
    // explains the rule in a comment that quotes the very import it is forbidding, and a
    // loose match fails on the documentation rather than on the code.
    const native = read('src/ui/native.js');
    expect(native).not.toMatch(/^\s*import\s[^\n]*['"]@capacitor\//m);
  });

  it('the built artefact carries no Capacitor runtime either', () => {
    const dist = root('dist/index.html');
    if (!existsSync(dist)) return;   // build-output.test.js already reports a missing dist
    const html = readFileSync(dist, 'utf8');
    expect(html).not.toContain('@capacitor/core');
    expect(html).not.toContain('registerPlugin');
  });
});

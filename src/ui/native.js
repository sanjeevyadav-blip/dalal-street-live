// Behaviour that only applies inside the Capacitor native shell — EPIC-6.
//
// WHY THIS TALKS TO THE BRIDGE INSTEAD OF IMPORTING THE PLUGINS
//
// The obvious implementation is `import { Browser } from '@capacitor/browser'`. That is
// wrong here: this same bundle is the GitHub Pages site. Importing the plugins would pull
// Capacitor's runtime into a web build that has no native shell to talk to, growing the
// single-file artefact for code that can never run.
//
// Capacitor injects `window.Capacitor` into the WebView and exposes installed plugins at
// `window.Capacitor.Plugins`. Reaching through that global costs the web build nothing —
// it is a property check that is false in a browser — and behaves identically in the app.
// The cost is no type checking and no build-time guarantee the plugin is installed, so
// every call below is defensive and falls back to normal web behaviour.

/** True only inside the native shell. False on the website, including on a phone browser. */
export function isNativePlatform(){
  try {
    const cap = window.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    return Boolean(cap.isNative);
  } catch {
    return false;
  }
}

function plugin(name){
  try {
    const p = window.Capacitor && window.Capacitor.Plugins;
    return (p && p[name]) || null;
  } catch {
    return null;
  }
}

/**
 * Open external links in the system browser instead of inside the app's WebView.
 *
 * THE BUG THIS PREVENTS. The page has five `target="_blank"` links — news headlines, IPO
 * filing documents, and the SEBI reference. In a browser they open a tab. In a WebView
 * there are no tabs: the link either does nothing at all, or it navigates the WebView away
 * from the app to a news site, with no back button, no address bar and no way home short
 * of force-quitting. The app looks like it crashed into someone else's website.
 *
 * A delegated listener on the document catches them all, including the ones in blocks that
 * render long after startup — which is most of them, since news and IPO rows are built from
 * fetched data.
 */
let linkHandler = null;

export function wireExternalLinks(){
  if (!isNativePlatform()) return false;

  // Replace rather than stack. Calling this twice used to attach two listeners, so a single
  // tap opened the system browser twice — the second one landing on top of the first. It is
  // called once from bootstrap today, but "called once" is not a property worth relying on.
  if (linkHandler) document.removeEventListener('click', linkHandler, true);

  linkHandler = (ev) => {
    const anchor = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    // Only absolute http(s) destinations leave the app. In-page anchors and relative links
    // are the app navigating itself and must be left alone.
    if (!/^https?:\/\//i.test(href)) return;

    ev.preventDefault();
    const browser = plugin('Browser');
    if (browser && typeof browser.open === 'function'){
      // An in-app browser overlay: the system Chrome Custom Tab, which has its own close
      // button and returns to the app rather than replacing it.
      Promise.resolve(browser.open({ url: href, presentationStyle: 'popover' })).catch(() => {
        window.open(href, '_blank');
      });
    } else {
      window.open(href, '_blank');
    }
  };

  document.addEventListener('click', linkHandler, true);
  return true;
}

/**
 * Match the status bar to the page, so the app does not open with a white strip above a
 * near-black page. #0B1520 is --ink from the design tokens; capacitor.config.json sets the
 * same value for the splash screen and the native background.
 */
export function themeStatusBar(){
  if (!isNativePlatform()) return false;
  const bar = plugin('StatusBar');
  if (!bar) return false;
  try {
    // Style.Dark means dark CONTENT on a light bar in some versions and the reverse in
    // others, which is why the background colour is set explicitly rather than relying on
    // the style alone.
    if (typeof bar.setBackgroundColor === 'function') bar.setBackgroundColor({ color: '#0B1520' });
    if (typeof bar.setStyle === 'function') bar.setStyle({ style: 'DARK' });
    if (typeof bar.setOverlaysWebView === 'function') bar.setOverlaysWebView({ overlay: false });
  } catch {
    return false;
  }
  return true;
}

/** Dismiss the splash once the shell has painted, rather than on a fixed timer. */
export function hideSplash(){
  if (!isNativePlatform()) return false;
  const splash = plugin('SplashScreen');
  if (!splash || typeof splash.hide !== 'function') return false;
  try { splash.hide(); } catch { return false; }
  return true;
}

/**
 * Whether the service worker should register.
 *
 * Not in the native shell. The assets are already on the device, so the worker caches
 * nothing worth caching — and its network-first-with-cache-fallback rule means a stale
 * shell can outlive an app update, which is a genuinely confusing bug to chase. The PWA
 * remains fully live on the website, which is where it earns its keep.
 */
export function shouldRegisterServiceWorker(){
  return !isNativePlatform();
}

/** Everything the native shell needs, in one call. No-ops entirely on the web. */
export function initNativeShell(){
  if (!isNativePlatform()) return { native: false };
  return {
    native: true,
    links: wireExternalLinks(),
    statusBar: themeStatusBar(),
    splash: hideSplash()
  };
}

// The Capacitor native shell layer — EPIC-6.
//
// The important half of these tests is the WEB half. This same bundle is the GitHub Pages
// site, and every function here must be a complete no-op there — a native tweak that leaks
// into the website would break the thing that actually has users for the sake of the thing
// that does not exist yet.
//
// The native half is tested by faking `window.Capacitor`, which is exactly what Capacitor
// injects into the WebView. That is not a shortcut around a real test: the bridge IS the
// contract, and reaching through it rather than importing the plugins is a deliberate
// choice documented in src/ui/native.js.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isNativePlatform, wireExternalLinks, themeStatusBar, hideSplash,
  shouldRegisterServiceWorker, initNativeShell
} from '../../src/ui/native.js';

function fakeCapacitor(plugins = {}){
  window.Capacitor = { isNativePlatform: () => true, Plugins: plugins };
}

beforeEach(() => {
  delete window.Capacitor;
  document.body.innerHTML = '';
});

afterEach(() => {
  delete window.Capacitor;
  vi.restoreAllMocks();
});

describe('on the web, everything is inert', () => {
  it('reports it is not a native platform', () => {
    expect(isNativePlatform()).toBe(false);
  });

  it('registers the service worker, because the PWA is the point on the web', () => {
    expect(shouldRegisterServiceWorker()).toBe(true);
  });

  it('does not intercept link clicks', () => {
    expect(wireExternalLinks()).toBe(false);

    document.body.innerHTML = '<a id="ext" href="https://example.com/">news</a>';
    const link = document.getElementById('ext');
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    // Not prevented: the browser opens the tab, exactly as before.
    expect(ev.defaultPrevented).toBe(false);
  });

  it('touches neither the status bar nor the splash', () => {
    expect(themeStatusBar()).toBe(false);
    expect(hideSplash()).toBe(false);
    expect(initNativeShell()).toEqual({ native: false });
  });

  it('survives a Capacitor global that is present but malformed', () => {
    // A half-initialised bridge must read as "not native" rather than throwing during
    // bootstrap, which would take the whole page down.
    window.Capacitor = {};
    expect(isNativePlatform()).toBe(false);
    window.Capacitor = { isNativePlatform: () => { throw new Error('bridge died'); } };
    expect(isNativePlatform()).toBe(false);
  });
});

describe('inside the native shell', () => {
  it('reports it is native', () => {
    fakeCapacitor();
    expect(isNativePlatform()).toBe(true);
  });

  it('does not register the service worker', () => {
    // The assets are already on the device, and a cached shell can outlive an app update.
    fakeCapacitor();
    expect(shouldRegisterServiceWorker()).toBe(false);
  });

  it('opens an external link in the system browser instead of the WebView', () => {
    // THE bug this layer exists for. In a WebView, target="_blank" either does nothing or
    // navigates the app away to a news site with no back button and no address bar.
    const open = vi.fn(() => Promise.resolve());
    fakeCapacitor({ Browser: { open } });
    expect(wireExternalLinks()).toBe(true);

    document.body.innerHTML = '<a id="ext" href="https://www.bing.com/news/x">headline</a>';
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('ext').dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0].url).toBe('https://www.bing.com/news/x');
  });

  it('catches links in blocks rendered long after startup', () => {
    // Most external links on this page are news headlines and IPO filings, built from
    // fetched data minutes after bootstrap. A listener bound to the links themselves would
    // miss every one of them; this is delegated on the document for that reason.
    const open = vi.fn(() => Promise.resolve());
    fakeCapacitor({ Browser: { open } });
    wireExternalLinks();

    document.body.innerHTML = '<div id="late"></div>';
    document.getElementById('late').innerHTML = '<a id="fresh" href="https://example.com/filing.pdf">x</a>';
    document.getElementById('fresh').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('catches a click on an element nested inside the link', () => {
    // News rows wrap a title div inside the anchor, so the click target is never the <a>.
    const open = vi.fn(() => Promise.resolve());
    fakeCapacitor({ Browser: { open } });
    wireExternalLinks();

    document.body.innerHTML = '<a href="https://example.com/"><div id="inner">title</div></a>';
    document.getElementById('inner').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves in-app navigation alone', () => {
    // Only absolute http(s) destinations leave the app. Anchors and relative links are the
    // app navigating itself — hijacking those would break the page.
    const open = vi.fn(() => Promise.resolve());
    fakeCapacitor({ Browser: { open } });
    wireExternalLinks();

    for (const href of ['#section', '/index.html', 'relative.html', 'javascript:void(0)']){
      document.body.innerHTML = '<a id="a" href="' + href + '">x</a>';
      const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
      document.getElementById('a').dispatchEvent(ev);
      expect(ev.defaultPrevented, href + ' should not be intercepted').toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to window.open when the Browser plugin is missing', () => {
    // The bridge gives no build-time guarantee the plugin is installed.
    fakeCapacitor({});
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    wireExternalLinks();

    document.body.innerHTML = '<a id="a" href="https://example.com/">x</a>';
    document.getElementById('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(spy).toHaveBeenCalledWith('https://example.com/', '_blank');
  });

  it('themes the status bar to the design token', () => {
    const setBackgroundColor = vi.fn(), setStyle = vi.fn(), setOverlaysWebView = vi.fn();
    fakeCapacitor({ StatusBar: { setBackgroundColor, setStyle, setOverlaysWebView } });
    expect(themeStatusBar()).toBe(true);
    // #0B1520 is --ink. A white strip above a near-black page is the giveaway that a web
    // app has been wrapped rather than built.
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: '#0B1520' });
    expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' });
  });

  it('does not throw when a plugin method is missing or throws', () => {
    fakeCapacitor({ StatusBar: { setBackgroundColor: () => { throw new Error('no'); } } });
    expect(() => themeStatusBar()).not.toThrow();
    fakeCapacitor({ SplashScreen: {} });
    expect(hideSplash()).toBe(false);
  });

  it('hides the splash', () => {
    const hide = vi.fn();
    fakeCapacitor({ SplashScreen: { hide } });
    expect(hideSplash()).toBe(true);
    expect(hide).toHaveBeenCalled();
  });

  it('initNativeShell reports what it managed to wire', () => {
    fakeCapacitor({
      Browser: { open: vi.fn() },
      StatusBar: { setBackgroundColor: vi.fn(), setStyle: vi.fn(), setOverlaysWebView: vi.fn() },
      SplashScreen: { hide: vi.fn() }
    });
    expect(initNativeShell()).toEqual({ native: true, links: true, statusBar: true, splash: true });
  });
});

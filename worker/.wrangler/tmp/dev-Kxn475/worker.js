var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-NVHK1j/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// worker.js
var ALLOWED_HOSTS = /* @__PURE__ */ new Set(["query1.finance.yahoo.com", "query2.finance.yahoo.com", "news.google.com", "feeds.finance.yahoo.com", "www.bing.com", "www.nseindia.com"]);
var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
var ySess = null;
var yAt = 0;
var nseCookie = null;
var nseAt = 0;
async function getYahoo() {
  if (ySess && Date.now() - yAt < 18e5)
    return ySess;
  const c = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA } });
  const raw = c.headers.get("set-cookie") || "";
  const cookie = raw.split(",").map((s) => s.split(";")[0].trim()).filter(Boolean).join("; ");
  const cr = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, "Cookie": cookie, "Accept": "*/*" } });
  ySess = { cookie, crumb: (await cr.text()).trim() };
  yAt = Date.now();
  return ySess;
}
__name(getYahoo, "getYahoo");
function mergeCookies(raws) {
  const seen = {};
  const parts = [];
  raws.forEach(function(raw) {
    (raw || "").split(",").forEach(function(s) {
      const kv = s.split(";")[0].trim();
      const k = kv.split("=")[0];
      if (k && kv.indexOf("=") > 0 && !seen[k]) {
        seen[k] = 1;
        parts.push(kv);
      }
    });
  });
  return parts.join("; ");
}
__name(mergeCookies, "mergeCookies");
async function getNse() {
  if (nseCookie && Date.now() - nseAt < 6e5)
    return nseCookie;
  const base = { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none" };
  const a = await fetch("https://www.nseindia.com/", { headers: base, redirect: "follow" });
  const c1 = a.headers.get("set-cookie") || "";
  const b = await fetch("https://www.nseindia.com/option-chain", { headers: Object.assign({}, base, { "Cookie": mergeCookies([c1]), "Referer": "https://www.nseindia.com/" }), redirect: "follow" });
  const c2 = b.headers.get("set-cookie") || "";
  nseCookie = mergeCookies([c1, c2]);
  nseAt = Date.now();
  return nseCookie;
}
__name(getNse, "getNse");
var RATE = { windowMs: 6e4, maxRequests: 300 };
var buckets = /* @__PURE__ */ new Map();
function rateLimit(ip, now) {
  const cutoff = now - RATE.windowMs;
  let hits = buckets.get(ip);
  if (!hits) {
    hits = [];
    buckets.set(ip, hits);
  }
  while (hits.length && hits[0] <= cutoff)
    hits.shift();
  if (buckets.size > 5e3) {
    for (const [k, v] of buckets) {
      if (!v.length || v[v.length - 1] <= cutoff)
        buckets.delete(k);
    }
  }
  if (hits.length >= RATE.maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((hits[0] + RATE.windowMs - now) / 1e3) };
  }
  hits.push(now);
  return { allowed: true, remaining: RATE.maxRequests - hits.length };
}
__name(rateLimit, "rateLimit");
function clientLabel(ip) {
  let hash = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    hash ^= ip.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
}
__name(clientLabel, "clientLabel");
function logLine(fields) {
  try {
    console.log(JSON.stringify({ t: (/* @__PURE__ */ new Date()).toISOString(), ...fields }));
  } catch {
  }
}
__name(logLine, "logLine");
var ENDPOINTS = [
  [/\/v8\/finance\/chart\//, "chart"],
  [/\/v10\/finance\/quoteSummary\//, "quoteSummary"],
  [/\/finance\/timeseries\//, "timeseries"],
  [/\/v1\/test\/getcrumb/, "crumb"],
  [/\/api\/option-chain-contract-info/, "option-contract-info"],
  [/\/api\/option-chain-v3/, "option-chain"],
  [/\/api\/all-upcoming-issues/, "ipos"],
  [/\/news\/search/, "news"]
];
function endpointOf(p) {
  if (!p)
    return null;
  for (const [pattern, label] of ENDPOINTS) {
    if (pattern.test(p.pathname))
      return label;
  }
  return "other";
}
__name(endpointOf, "endpointOf");
var worker_default = {
  async fetch(request) {
    const started = Date.now();
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const client = clientLabel(ip);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") {
      logLine({ client, status: 405, reason: "method" });
      return new Response("Only GET", { status: 405, headers: CORS });
    }
    const limit = rateLimit(ip, started);
    if (!limit.allowed) {
      logLine({ client, status: 429, reason: "rate-limit", retryAfter: limit.retryAfter });
      return new Response("Rate limit exceeded", { status: 429, headers: Object.assign({}, CORS, {
        "Retry-After": String(limit.retryAfter),
        "Cache-Control": "no-store"
      }) });
    }
    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      logLine({ client, status: 400, reason: "missing-url" });
      return new Response("Missing url", { status: 400, headers: CORS });
    }
    let p;
    try {
      p = new URL(target);
    } catch (e) {
      logLine({ client, status: 400, reason: "bad-url" });
      return new Response("Bad URL", { status: 400, headers: CORS });
    }
    if (p.protocol !== "https:" || !ALLOWED_HOSTS.has(p.hostname)) {
      logLine({ client, status: 403, reason: "host-not-allowed", host: p.hostname });
      return new Response("Host not allowed", { status: 403, headers: CORS });
    }
    const h = { "User-Agent": UA, "Accept": "*/*" };
    let noCache = false;
    try {
      if (p.hostname === "query1.finance.yahoo.com" || p.hostname === "query2.finance.yahoo.com") {
        const s = await getYahoo();
        if (s.cookie)
          h["Cookie"] = s.cookie;
        if (s.crumb && !p.searchParams.has("crumb"))
          p.searchParams.set("crumb", s.crumb);
      }
      if (p.hostname === "www.nseindia.com" && p.pathname.indexOf("/api/") === 0) {
        h["Cookie"] = await getNse();
        h["Referer"] = "https://www.nseindia.com/option-chain";
        h["Accept"] = "application/json, text/plain, */*";
        h["Accept-Language"] = "en-US,en;q=0.9";
        h["X-Requested-With"] = "XMLHttpRequest";
        h["Sec-Fetch-Mode"] = "cors";
        h["Sec-Fetch-Site"] = "same-origin";
        noCache = true;
      }
      const opts = noCache ? { headers: h } : { headers: h, cf: { cacheTtl: 30, cacheEverything: true } };
      let up = await fetch(p.toString(), opts);
      if (up.status === 401 || up.status === 403) {
        if (p.hostname === "www.nseindia.com") {
          nseCookie = null;
          h["Cookie"] = await getNse();
        } else {
          ySess = null;
          const s2 = await getYahoo();
          h["Cookie"] = s2.cookie;
          p.searchParams.set("crumb", s2.crumb);
        }
        up = await fetch(p.toString(), { headers: h });
      }
      const body = await up.arrayBuffer();
      const o = Object.assign({}, CORS);
      o["Content-Type"] = up.headers.get("Content-Type") || "application/json";
      o["Cache-Control"] = noCache ? "no-store" : "public, max-age=30";
      o["X-RateLimit-Remaining"] = String(limit.remaining);
      logLine({
        client,
        status: up.status,
        host: p.hostname,
        endpoint: endpointOf(p),
        ms: Date.now() - started,
        bytes: body.byteLength,
        remaining: limit.remaining
      });
      return new Response(body, { status: up.status, headers: o });
    } catch (err) {
      logLine({
        client,
        status: 502,
        host: p.hostname,
        endpoint: endpointOf(p),
        ms: Date.now() - started,
        error: err.message
      });
      return new Response("Upstream failed: " + err.message, { status: 502, headers: CORS });
    }
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-NVHK1j/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-NVHK1j/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

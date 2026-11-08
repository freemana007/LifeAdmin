/*
 * A strict stand-in for the claude.ai artifact runtime, injected before the
 * demo page loads. It behaves like the real one where it matters:
 *  - data read back from the store is deep-frozen (read-only);
 *  - overlapping writes to the same document are rejected;
 *  - failures can be switched on: window.__mock.failWrites = "unavailable" | "invalid_argument"
 *    and window.__mock.sample = "ok" | "not_granted" | "rate_limited" | "absent".
 * The store lives in localStorage so it survives reloads, like a real account.
 */
(() => {
  const KEY = "__mockdb";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  const cfg = JSON.parse(localStorage.getItem("__mockcfg") || "{}");
  window.__mock = Object.assign({ failWrites: null, sample: "ok", writes: 0, imagesSent: 0 }, cfg);
  const freeze = (o) => {
    if (o && typeof o === "object") {
      Object.values(o).forEach(freeze);
      Object.freeze(o);
    }
    return o;
  };
  const err = (code) => Object.assign(new Error(code), { code });
  const busy = new Set();
  const write = async (path, fn) => {
    if (window.__mock.failWrites) throw err(window.__mock.failWrites);
    if (busy.has(path)) throw err("resource_exhausted");
    busy.add(path);
    try {
      await new Promise((r) => setTimeout(r, 15));
      const db = load();
      fn(db);
      save(db);
      window.__mock.writes++;
    } finally {
      busy.delete(path);
    }
  };
  const snap = (id, data) => ({ id, exists: data !== undefined, data: () => (data === undefined ? undefined : freeze(JSON.parse(JSON.stringify(data)))) });
  const col = (path) => ({
    doc: (id) => {
      const full = `${path}/${id}`;
      return {
        get: async () => snap(id, load()[full]),
        set: (d) => write(full, (db) => (db[full] = JSON.parse(JSON.stringify(d)))),
        delete: () => write(full, (db) => delete db[full]),
      };
    },
    get: async () => {
      const db = load();
      return { docs: Object.keys(db).filter((k) => k.startsWith(path + "/")).map((k) => snap(k.slice(path.length + 1), db[k])) };
    },
  });
  const sample = async () => ({ text: "" });
  sample.limits = async () => (window.__mock.sample === "ok" ? { images: { maxCount: 6, maxInputBytes: 5e6, mediaTypes: ["image/jpeg", "image/png"] } } : {});
  sample.json = async (prompt, opts = {}) => {
    if (window.__mock.sample !== "ok") throw { code: window.__mock.sample, message: window.__mock.sample };
    if (opts.images) {
      window.__mock.imagesSent = opts.images.length;
      return {
        docType: "bill", docTypeConfidence: "high", title: "Flogas – gas bill", provider: "Flogas",
        summary: "Your gas bill. Pay €96.10 by 1 December 2026.", actions: ["Pay €96.10 by 1 December 2026"],
        referenceNumbers: [{ label: "GPRN", value: "1234567" }], amountDue: { value: 96.1, currency: "EUR", confidence: "high", evidence: "Amount due €96.10" },
        renewalTerms: null, flags: [], transcript: "Flogas\nAmount due €96.10\nPlease pay by 01/12/2026",
        deadlines: [{ title: "Payment due – Flogas", kind: "payment", date: "2026-12-01", amount: 96.1, confidence: "high", evidence: "Please pay by 01/12/2026" }],
      };
    }
    if (/Reply with only JSON: \{"subject"/.test(prompt)) return { subject: "AI draft subject", body: "AI draft body", to: null };
    return { summary: "" }; // forces the offline reader for text, as a refusal would
  };
  const caps = {
    db: { collection: col },
    user: { id: async () => "u_test", me: async () => ({ id: "u_test", name: "Aoife Kelly" }) },
    get sample() {
      return window.__mock.sample === "absent" ? null : sample;
    },
  };
  window.claude = { use: async (n) => caps[n] ?? null };
})();

// Drop-in replacement for the Claude-artifact `window.storage` API,
// backed by the browser's localStorage.
//
// The original API:
//   await window.storage.get(key, shared?)    -> { key, value } | null
//   await window.storage.set(key, value, shared?) -> { key, value } | null
//   await window.storage.delete(key, shared?) -> { key, deleted: true } | null
//   await window.storage.list(prefix?, shared?) -> { keys, prefix } | null
//
// The `shared` flag is accepted for API compatibility but has no effect —
// localStorage is per-browser anyway. If you want true multi-user sharing,
// swap this file out for a small backend client (e.g. Supabase).

const NS = "mt:"; // namespace so we don't collide with other apps on the same origin

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.error("[storage]", e);
    return null;
  }
}

const storage = {
  async get(key /* , shared */) {
    return safe(() => {
      const raw = localStorage.getItem(NS + key);
      if (raw === null) {
        // The Claude API throws on missing keys; the original app's code
        // wraps every get in try/catch, so we just return null here.
        return null;
      }
      return { key, value: raw, shared: false };
    });
  },

  async set(key, value /* , shared */) {
    return safe(() => {
      localStorage.setItem(NS + key, String(value));
      return { key, value, shared: false };
    });
  },

  async delete(key /* , shared */) {
    return safe(() => {
      localStorage.removeItem(NS + key);
      return { key, deleted: true, shared: false };
    });
  },

  async list(prefix = "" /* , shared */) {
    return safe(() => {
      const keys = [];
      const fullPrefix = NS + prefix;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          keys.push(k.slice(NS.length));
        }
      }
      return { keys, prefix, shared: false };
    });
  },
};

// Install on window so App.jsx can use window.storage.* unchanged.
if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;

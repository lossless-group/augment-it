import { create as N } from "zustand";
function b(n, i) {
  let t;
  try {
    t = n();
  } catch {
    return;
  }
  return {
    getItem: (r) => {
      var e;
      const a = (l) => l === null ? null : JSON.parse(l, void 0), f = (e = t.getItem(r)) != null ? e : null;
      return f instanceof Promise ? f.then(a) : a(f);
    },
    setItem: (r, e) => t.setItem(r, JSON.stringify(e, void 0)),
    removeItem: (r) => t.removeItem(r)
  };
}
const y = (n) => (i) => {
  try {
    const t = n(i);
    return t instanceof Promise ? t : {
      then(o) {
        return y(o)(t);
      },
      catch(o) {
        return this;
      }
    };
  } catch (t) {
    return {
      then(o) {
        return this;
      },
      catch(o) {
        return y(o)(t);
      }
    };
  }
}, F = (n, i) => (t, o, r) => {
  let e = {
    storage: b(() => localStorage),
    partialize: (s) => s,
    version: 0,
    merge: (s, p) => ({
      ...p,
      ...s
    }),
    ...i
  }, a = !1;
  const f = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Set();
  let c = e.storage;
  if (!c)
    return n(
      (...s) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${e.name}', the given storage is currently unavailable.`
        ), t(...s);
      },
      o,
      r
    );
  const h = () => {
    const s = e.partialize({ ...o() });
    return c.setItem(e.name, {
      state: s,
      version: e.version
    });
  }, O = r.setState;
  r.setState = (s, p) => {
    O(s, p), h();
  };
  const m = n(
    (...s) => {
      t(...s), h();
    },
    o,
    r
  );
  r.getInitialState = () => m;
  let g;
  const w = () => {
    var s, p;
    if (!c) return;
    a = !1, f.forEach((d) => {
      var u;
      return d((u = o()) != null ? u : m);
    });
    const S = ((p = e.onRehydrateStorage) == null ? void 0 : p.call(e, (s = o()) != null ? s : m)) || void 0;
    return y(c.getItem.bind(c))(e.name).then((d) => {
      if (d)
        if (typeof d.version == "number" && d.version !== e.version) {
          if (e.migrate) {
            const u = e.migrate(
              d.state,
              d.version
            );
            return u instanceof Promise ? u.then((v) => [!0, v]) : [!0, u];
          }
          console.error(
            "State loaded from storage couldn't be migrated since no migrate function was provided"
          );
        } else
          return [!1, d.state];
      return [!1, void 0];
    }).then((d) => {
      var u;
      const [v, J] = d;
      if (g = e.merge(
        J,
        (u = o()) != null ? u : m
      ), t(g, !0), v)
        return h();
    }).then(() => {
      S == null || S(g, void 0), g = o(), a = !0, l.forEach((d) => d(g));
    }).catch((d) => {
      S == null || S(void 0, d);
    });
  };
  return r.persist = {
    setOptions: (s) => {
      e = {
        ...e,
        ...s
      }, s.storage && (c = s.storage);
    },
    clearStorage: () => {
      c == null || c.removeItem(e.name);
    },
    getOptions: () => e,
    rehydrate: () => w(),
    hasHydrated: () => a,
    onHydrate: (s) => (f.add(s), () => {
      f.delete(s);
    }),
    onFinishHydration: (s) => (l.add(s), () => {
      l.delete(s);
    })
  }, e.skipHydration || w(), g || m;
}, R = F, I = N()(
  R(
    (n, i) => ({
      // Records state
      records: [],
      selectedRecord: null,
      availableFields: [],
      // Perplexity configuration (for request-reviewer)
      perplexityConfig: {
        apiKey: "",
        prompt: "",
        useDeepResearch: !1,
        selectedModel: "sonar",
        customProperties: []
      },
      // Actions
      setSelectedRecord: (t) => n({ selectedRecord: t }),
      addRecords: (t) => {
        const o = i().records, r = t.map((l) => ({
          ...l,
          id: l.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })), e = t.length > 0 ? Object.keys(t[0]) : [], a = i().availableFields, f = [.../* @__PURE__ */ new Set([...a, ...e])];
        if (n({
          records: [...o, ...r],
          availableFields: f
        }), typeof window < "u") {
          const l = localStorage.getItem("shared-record-store");
          if (l) {
            const c = JSON.parse(l);
            c.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(c));
          }
        }
      },
      replaceAllRecords: (t) => {
        const o = t.map((e) => ({
          ...e,
          id: e.id || `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })), r = t.length > 0 ? Object.keys(t[0]) : [];
        if (n({
          records: o,
          availableFields: r,
          selectedRecord: null
        }), typeof window < "u") {
          const e = localStorage.getItem("shared-record-store");
          if (e) {
            const a = JSON.parse(e);
            a.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(a));
          }
        }
      },
      deleteRecord: (t) => {
        const o = i().records;
        if (n({ records: o.filter((r) => r.id !== t) }), typeof window < "u") {
          const r = localStorage.getItem("shared-record-store");
          if (r) {
            const e = JSON.parse(r);
            e.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(e));
          }
        }
      },
      deleteAllRecords: () => {
        if (n({ records: [], selectedRecord: null, availableFields: [] }), typeof window < "u") {
          const t = localStorage.getItem("shared-record-store");
          if (t) {
            const o = JSON.parse(t);
            o.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(o));
          }
        }
      },
      // Perplexity config actions
      updatePerplexityConfig: (t) => {
        if (n((o) => ({
          perplexityConfig: { ...o.perplexityConfig, ...t }
        })), typeof window < "u") {
          const o = localStorage.getItem("shared-record-store");
          if (o) {
            const r = JSON.parse(o);
            r.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(r));
          }
        }
      },
      // Record augmentation actions
      updateRecordAugmentation: (t, o) => {
        if (n((r) => ({
          records: r.records.map(
            (e) => e.id === t ? { ...e, augmentationResults: o } : e
          )
        })), typeof window < "u") {
          const r = localStorage.getItem("shared-record-store");
          if (r) {
            const e = JSON.parse(r);
            e.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(e));
          }
        }
      }
    }),
    {
      name: "shared-record-store",
      partialize: (n) => ({
        records: n.records,
        availableFields: n.availableFields,
        perplexityConfig: n.perplexityConfig
      }),
      onRehydrateStorage: () => (n) => {
        if (n && typeof window < "u") {
          const i = localStorage.getItem("shared-record-store");
          if (i) {
            const t = JSON.parse(i);
            t.version = Date.now(), localStorage.setItem("shared-record-store", JSON.stringify(t));
          }
        }
      }
    }
  )
);
if (typeof window < "u") {
  let n = 0;
  const i = () => {
    try {
      const o = localStorage.getItem("shared-record-store");
      if (o) {
        const r = JSON.parse(o), e = r.version || 0;
        if (e > n) {
          n = e;
          const a = I.getState();
          (JSON.stringify(r.state.records) !== JSON.stringify(a.records) || JSON.stringify(r.state.availableFields) !== JSON.stringify(a.availableFields) || JSON.stringify(r.state.perplexityConfig) !== JSON.stringify(a.perplexityConfig)) && I.setState({
            records: r.state.records || [],
            availableFields: r.state.availableFields || [],
            perplexityConfig: r.state.perplexityConfig || {
              apiKey: "",
              prompt: "",
              useDeepResearch: !1,
              selectedModel: "sonar",
              customProperties: []
            }
          });
        }
      }
    } catch (o) {
      console.warn("Error checking for store updates:", o);
    }
  }, t = setInterval(i, 500);
  window.addEventListener("beforeunload", () => {
    clearInterval(t);
  }), window.addEventListener("storage", (o) => {
    o.key === "shared-record-store" && i();
  });
}
export {
  I as useSharedRecordStore
};

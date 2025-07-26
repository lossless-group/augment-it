import { j as e } from "./jsx-runtime-CH8yh2Yd.mjs";
import { useState as f } from "react";
import { Trash2 as S, Zap as E, ChevronDown as j, ChevronUp as y, Building as n, Clock as P, MapPin as o, Mail as x, ExternalLink as z, DollarSign as N } from "lucide-react";
const M = ({
  record: r,
  onDelete: u,
  onEdit: O,
  onSelect: i,
  isSelected: g = !1,
  isProcessing: c = !1,
  variant: l = "collector"
}) => {
  var h;
  const [d, w] = f(!0), [p, C] = f(() => {
    const t = {};
    return Object.entries(r).forEach(([s, a]) => {
      a && a.toString().length > 100 && (t[s] = !0);
    }), t;
  }), v = (t) => {
    C((s) => ({
      ...s,
      [t]: !s[t]
    }));
  }, R = (t, s) => s == null ? "N/A" : typeof s == "number" && (t.toLowerCase().includes("revenue") || t.toLowerCase().includes("price") || t.toLowerCase().includes("cost")) ? new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(s) : s instanceof Date || typeof s == "string" && !isNaN(Date.parse(s)) ? new Date(s).toLocaleDateString() : s.toString(), D = (t) => t && t.toString().length > 100, m = (t, s) => {
    const a = R(t, s);
    return D(s) ? /* @__PURE__ */ e.jsx("div", { className: "flex-1", children: /* @__PURE__ */ e.jsxs("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ e.jsx("div", { className: `font-medium text-gray-900 ${p[t] ? "line-clamp-2" : ""}`, children: a }),
      /* @__PURE__ */ e.jsx(
        "button",
        {
          onClick: (A) => {
            A.stopPropagation(), v(t);
          },
          className: "text-white bg-gray-500 hover:bg-gray-700 rounded-full p-1 flex-shrink-0 transition-colors mt-0.5",
          children: p[t] ? /* @__PURE__ */ e.jsx(j, { className: "w-4 h-4" }) : /* @__PURE__ */ e.jsx(y, { className: "w-4 h-4" })
        }
      )
    ] }) }) : /* @__PURE__ */ e.jsx("span", { className: "font-medium text-gray-900", children: a });
  }, I = (t) => {
    const s = {
      technology: l === "collector" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-purple-100 text-purple-800",
      software: l === "collector" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-indigo-100 text-indigo-800",
      healthcare: l === "collector" ? "bg-red-50 border-red-200 text-red-700" : "bg-red-100 text-red-800",
      finance: l === "collector" ? "bg-green-50 border-green-200 text-green-700" : "bg-green-100 text-green-800",
      energy: l === "collector" ? "bg-yellow-50 border-yellow-200 text-yellow-700" : "bg-orange-100 text-orange-800",
      default: l === "collector" ? "bg-gray-50 border-gray-200 text-gray-700" : "bg-gray-100 text-gray-800"
    };
    return s[(t == null ? void 0 : t.toLowerCase()) || "default"] || s.default;
  }, F = (t) => {
    const s = l === "collector" ? {
      small: "bg-green-50 border-green-200 text-green-700",
      medium: "bg-yellow-50 border-yellow-200 text-yellow-700",
      large: "bg-red-50 border-red-200 text-red-700",
      default: "bg-gray-50 border-gray-200 text-gray-700"
    } : {
      small: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      large: "bg-blue-100 text-blue-800",
      default: "bg-gray-100 text-gray-800"
    };
    return s[(t == null ? void 0 : t.toLowerCase()) || "default"] || s.default;
  }, b = () => Object.entries(r).filter(
    ([t]) => !["name", "industry", "size", "location", "augmentationResults", "id"].includes(t) && r[t] !== null && r[t] !== void 0
  ), L = (t) => {
    const s = {
      name: n,
      industry: n,
      size: n,
      location: o,
      annual_revenue: N,
      revenue: N,
      website: z,
      contact_email: x,
      email: x,
      phone: x,
      address: o,
      city: o,
      state: o,
      country: o,
      employees: n,
      founded: P,
      description: n
    };
    return s[t] || s[t.toLowerCase()] || n;
  }, $ = l === "collector" ? `bg-white rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-lg ${g ? "border-blue-500 shadow-lg" : "border-gray-200 hover:border-gray-300"} ${c ? "opacity-75" : ""}` : `bg-white rounded-xl border border-gray-200 p-4 transition-all duration-200 ${g ? "ring-2 ring-purple-500" : "hover:shadow-md"} ${c ? "opacity-75" : ""}`;
  return /* @__PURE__ */ e.jsxs(
    "div",
    {
      className: $,
      onClick: () => i == null ? void 0 : i(r),
      children: [
        /* @__PURE__ */ e.jsxs("div", { className: l === "collector" ? "p-6 border-b border-gray-100" : "", children: [
          /* @__PURE__ */ e.jsxs("div", { className: "flex items-start justify-between mb-3", children: [
            /* @__PURE__ */ e.jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ e.jsx("h3", { className: "text-lg font-semibold text-gray-900 truncate", children: r.name || "Unnamed Record" }),
              r.location && /* @__PURE__ */ e.jsx("p", { className: "text-sm text-gray-600 truncate", children: r.location })
            ] }),
            l === "collector" && u && /* @__PURE__ */ e.jsx(
              "button",
              {
                onClick: (t) => {
                  t.stopPropagation(), u(r.id);
                },
                className: "ml-3 p-2 text-white bg-gray-400 hover:bg-red-500 rounded-lg transition-colors",
                title: "Delete record",
                children: /* @__PURE__ */ e.jsx(S, { className: "w-4 h-4" })
              }
            )
          ] }),
          /* @__PURE__ */ e.jsxs("div", { className: "flex flex-wrap gap-2 mb-3", children: [
            r.industry && /* @__PURE__ */ e.jsx("span", { className: `px-2 py-1 rounded-full text-xs font-medium ${l === "collector" ? "border " : ""}${I(r.industry)}`, children: r.industry }),
            r.size && /* @__PURE__ */ e.jsx("span", { className: `px-2 py-1 rounded-full text-xs font-medium ${l === "collector" ? "border " : ""}${F(r.size)}`, children: r.size })
          ] }),
          l === "collector" ? /* @__PURE__ */ e.jsx("div", { className: "space-y-2", children: b().map(([t, s]) => {
            const a = L(t);
            return /* @__PURE__ */ e.jsxs("div", { className: "flex items-center gap-2 text-sm text-gray-600", children: [
              /* @__PURE__ */ e.jsx(a, { className: "w-4 h-4 flex-shrink-0" }),
              /* @__PURE__ */ e.jsxs("span", { className: "font-medium capitalize", children: [
                t.replace(/_/g, " "),
                ":"
              ] }),
              m(t, s)
            ] }, t);
          }) }) : /* @__PURE__ */ e.jsx("div", { className: "space-y-2 mb-3", children: b().map(([t, s]) => /* @__PURE__ */ e.jsxs("div", { className: "flex justify-between text-sm", children: [
            /* @__PURE__ */ e.jsxs("span", { className: "text-gray-600 capitalize mr-2", children: [
              t.replace(/_/g, " "),
              ":"
            ] }),
            m(t, s)
          ] }, t)) })
        ] }),
        ((h = r.augmentationResults) == null ? void 0 : h.customProperties) && Object.keys(r.augmentationResults.customProperties).length > 0 && l === "reviewer" && /* @__PURE__ */ e.jsxs(e.Fragment, { children: [
          /* @__PURE__ */ e.jsxs("div", { className: "relative my-4", children: [
            /* @__PURE__ */ e.jsx("div", { className: "absolute inset-0 flex items-center", children: /* @__PURE__ */ e.jsx("div", { className: "w-full border-t border-gray-300" }) }),
            /* @__PURE__ */ e.jsx("div", { className: "relative flex justify-center text-xs", children: /* @__PURE__ */ e.jsx("span", { className: "bg-white px-2 text-gray-500 font-medium", children: "AI Enhanced Data" }) })
          ] }),
          /* @__PURE__ */ e.jsx("div", { className: "bg-green-50 border border-green-200 rounded-lg p-3 mb-3", children: /* @__PURE__ */ e.jsx("div", { className: "space-y-0", children: Object.entries(r.augmentationResults.customProperties).map(([t, s], a) => /* @__PURE__ */ e.jsxs("div", { children: [
            /* @__PURE__ */ e.jsxs("div", { className: "flex justify-between text-xs py-1", children: [
              /* @__PURE__ */ e.jsxs("span", { className: "text-green-700 font-medium capitalize mr-2", children: [
                t.replace(/_/g, " "),
                ":"
              ] }),
              m(t, s)
            ] }),
            a < Object.entries(r.augmentationResults.customProperties).length - 1 && /* @__PURE__ */ e.jsx("div", { className: "border-b border-green-200 my-1" })
          ] }, t)) }) })
        ] }),
        r.augmentationResults && l === "reviewer" && /* @__PURE__ */ e.jsxs("div", { className: "pt-2 border-t border-gray-100", children: [
          /* @__PURE__ */ e.jsxs(
            "button",
            {
              onClick: () => w(!d),
              className: "flex items-center gap-2 w-full text-left bg-white hover:bg-white border border-purple-200 rounded-lg p-2 transition-colors",
              children: [
                /* @__PURE__ */ e.jsx(E, { className: "w-4 h-4 text-purple-600" }),
                /* @__PURE__ */ e.jsx("span", { className: "text-xs text-purple-600 font-medium", children: "AI Enhanced" }),
                d ? /* @__PURE__ */ e.jsx(j, { className: "w-4 h-4 text-purple-600 ml-auto" }) : /* @__PURE__ */ e.jsx(y, { className: "w-4 h-4 text-purple-600 ml-auto" })
              ]
            }
          ),
          !d && r.augmentationResults.result && /* @__PURE__ */ e.jsxs("div", { className: "mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg", children: [
            /* @__PURE__ */ e.jsx("h4", { className: "text-xs font-medium text-purple-700 mb-2", children: "AI Analysis Summary:" }),
            /* @__PURE__ */ e.jsx("div", { className: "text-xs text-purple-800 max-h-32 overflow-y-auto", children: /* @__PURE__ */ e.jsx("pre", { className: "whitespace-pre-wrap font-sans", children: r.augmentationResults.result }) })
          ] })
        ] }),
        c && /* @__PURE__ */ e.jsx("div", { className: "absolute inset-0 bg-white bg-opacity-75 rounded-xl flex items-center justify-center", children: /* @__PURE__ */ e.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ e.jsx("div", { className: "w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" }),
          /* @__PURE__ */ e.jsx("span", { className: "text-sm text-purple-600 font-medium", children: "Processing..." })
        ] }) })
      ]
    }
  );
};
export {
  M as RecordCard
};

import { j as r } from "./jsx-runtime-CH8yh2Yd.mjs";
import t from "react";
class d extends t.Component {
  constructor(e) {
    super(e), this.state = { hasError: !1 };
  }
  static getDerivedStateFromError(e) {
    return { hasError: !0, error: e };
  }
  render() {
    return this.state.hasError ? this.props.fallback || /* @__PURE__ */ r.jsxs("div", { className: "p-4 border border-red-200 rounded-lg bg-red-50", children: [
      /* @__PURE__ */ r.jsx("h3", { className: "text-lg font-medium text-red-800 mb-2", children: "Component Error" }),
      /* @__PURE__ */ r.jsx("p", { className: "text-sm text-red-600", children: "A required UI component could not be loaded. Please ensure all shared components are properly installed." }),
      this.state.error && /* @__PURE__ */ r.jsx("pre", { className: "mt-2 text-xs text-red-500 whitespace-pre-wrap", children: this.state.error.message })
    ] }) : this.props.children;
  }
}
export {
  d as ErrorBoundary
};

import { importShared } from './__federation_fn_import-CPTB00SE.js';

var jsxRuntime = {exports: {}};

var reactJsxRuntime_production = {};

/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var hasRequiredReactJsxRuntime_production;

function requireReactJsxRuntime_production () {
	if (hasRequiredReactJsxRuntime_production) return reactJsxRuntime_production;
	hasRequiredReactJsxRuntime_production = 1;
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
	  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	function jsxProd(type, config, maybeKey) {
	  var key = null;
	  void 0 !== maybeKey && (key = "" + maybeKey);
	  void 0 !== config.key && (key = "" + config.key);
	  if ("key" in config) {
	    maybeKey = {};
	    for (var propName in config)
	      "key" !== propName && (maybeKey[propName] = config[propName]);
	  } else maybeKey = config;
	  config = maybeKey.ref;
	  return {
	    $$typeof: REACT_ELEMENT_TYPE,
	    type: type,
	    key: key,
	    ref: void 0 !== config ? config : null,
	    props: maybeKey
	  };
	}
	reactJsxRuntime_production.Fragment = REACT_FRAGMENT_TYPE;
	reactJsxRuntime_production.jsx = jsxProd;
	reactJsxRuntime_production.jsxs = jsxProd;
	return reactJsxRuntime_production;
}

var hasRequiredJsxRuntime;

function requireJsxRuntime () {
	if (hasRequiredJsxRuntime) return jsxRuntime.exports;
	hasRequiredJsxRuntime = 1;
	{
	  jsxRuntime.exports = requireReactJsxRuntime_production();
	}
	return jsxRuntime.exports;
}

var jsxRuntimeExports = requireJsxRuntime();

await importShared('react');

var T = { exports: {} }, R = {};
/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var $;
function re() {
  if ($) return R;
  $ = 1;
  var l = Symbol.for("react.transitional.element"), _ = Symbol.for("react.fragment");
  function f(m, a, s) {
    var d = null;
    if (s !== void 0 && (d = "" + s), a.key !== void 0 && (d = "" + a.key), "key" in a) {
      s = {};
      for (var E in a)
        E !== "key" && (s[E] = a[E]);
    } else s = a;
    return a = s.ref, {
      $$typeof: l,
      type: m,
      key: d,
      ref: a !== void 0 ? a : null,
      props: s
    };
  }
  return R.Fragment = _, R.jsx = f, R.jsxs = f, R;
}
var D;
function ne() {
  return D || (D = 1, T.exports = re() ), T.exports;
}
var ae = ne();

const g = ({
  children: t,
  onClick: r,
  variant: e = "primary",
  disabled: a = false
}) => {
  const s = "px-4 py-2 rounded font-medium transition-colors", o = {
    primary: "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100"
  };
  return /* @__PURE__ */ ae.jsx(
    "button",
    {
      className: `${s} ${o[e]}`,
      onClick: r,
      disabled: a,
      children: t
    }
  );
};

const {useState:f} = await importShared('react');

const t = await importShared('react');

class d extends t.Component {
  constructor(e) {
    super(e), this.state = { hasError: false };
  }
  static getDerivedStateFromError(e) {
    return { hasError: true, error: e };
  }
  render() {
    return this.state.hasError ? this.props.fallback || /* @__PURE__ */ ae.jsxs("div", { className: "p-4 border border-red-200 rounded-lg bg-red-50", children: [
      /* @__PURE__ */ ae.jsx("h3", { className: "text-lg font-medium text-red-800 mb-2", children: "Component Error" }),
      /* @__PURE__ */ ae.jsx("p", { className: "text-sm text-red-600", children: "A required UI component could not be loaded. Please ensure all shared components are properly installed." }),
      this.state.error && /* @__PURE__ */ ae.jsx("pre", { className: "mt-2 text-xs text-red-500 whitespace-pre-wrap", children: this.state.error.message })
    ] }) : this.props.children;
  }
}

const CardB = ({
  title = "Card B Component",
  description = "This is a federated component from micro-frontend-2"
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-b", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-content", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: description }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Demonstrates Module Federation capabilities with clean, modern styling and seamless integration." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(g, { onClick: () => alert("Card B button clicked!"), children: "Card B Action" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(g, { variant: "secondary", onClick: () => alert("Secondary action triggered!"), children: "Learn More" })
    ] })
  ] }) });
};

export { CardB as default, jsxRuntimeExports as j };

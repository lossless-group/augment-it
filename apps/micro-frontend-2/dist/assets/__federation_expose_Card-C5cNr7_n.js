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
var I;
function re() {
  if (I) return R;
  I = 1;
  var c = Symbol.for("react.transitional.element"), d = Symbol.for("react.fragment");
  function i(f, o, s) {
    var b = null;
    if (s !== void 0 && (b = "" + s), o.key !== void 0 && (b = "" + o.key), "key" in o) {
      s = {};
      for (var E in o)
        E !== "key" && (s[E] = o[E]);
    } else s = o;
    return o = s.ref, {
      $$typeof: c,
      type: f,
      key: b,
      ref: o !== void 0 ? o : null,
      props: s
    };
  }
  return R.Fragment = d, R.jsx = i, R.jsxs = i, R;
}
var D;
function ne() {
  return D || (D = 1, T.exports = re() ), T.exports;
}
var ae = ne();
const se = ({
  children: c,
  onClick: d,
  variant: i = "primary",
  disabled: f = false
}) => {
  const o = "px-4 py-2 rounded font-medium transition-colors", s = {
    primary: "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100"
  };
  return /* @__PURE__ */ ae.jsx(
    "button",
    {
      className: `${o} ${s[i]}`,
      onClick: d,
      disabled: f,
      children: c
    }
  );
};

const CardB = ({
  title = "Card B Component",
  description = "This is a federated component from micro-frontend-2"
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "card-b", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-content", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: description }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Demonstrates Module Federation capabilities with clean, modern styling and seamless integration." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "card-actions", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(se, { onClick: () => alert("Card B button clicked!"), children: "Card B Action" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(se, { variant: "secondary", onClick: () => alert("Secondary action triggered!"), children: "Learn More" })
    ] })
  ] }) });
};

export { CardB as default, jsxRuntimeExports as j };

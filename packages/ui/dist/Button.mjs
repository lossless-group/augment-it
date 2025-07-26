import { j as n } from "./jsx-runtime-CH8yh2Yd.mjs";
const g = ({
  children: t,
  onClick: r,
  variant: e = "primary",
  disabled: a = !1
}) => {
  const s = "px-4 py-2 rounded font-medium transition-colors", o = {
    primary: "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100"
  };
  return /* @__PURE__ */ n.jsx(
    "button",
    {
      className: `${s} ${o[e]}`,
      onClick: r,
      disabled: a,
      children: t
    }
  );
};
export {
  g as Button
};

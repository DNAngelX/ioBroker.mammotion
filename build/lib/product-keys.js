"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var product_keys_exports = {};
__export(product_keys_exports, {
  ALIYUN_PRODUCT_KEYS: () => ALIYUN_PRODUCT_KEYS,
  LUBA_PRO_PRODUCT_KEYS: () => LUBA_PRO_PRODUCT_KEYS,
  NAVIGATION_RECEIVER_PRODUCT_KEYS: () => NAVIGATION_RECEIVER_PRODUCT_KEYS,
  PRODUCT_KEY_GROUPS: () => PRODUCT_KEY_GROUPS,
  YUKA_MINI_PRODUCT_KEYS: () => YUKA_MINI_PRODUCT_KEYS,
  YUKA_ML_PRODUCT_KEYS: () => YUKA_ML_PRODUCT_KEYS,
  YUKA_PRODUCT_KEYS: () => YUKA_PRODUCT_KEYS,
  isAliyunProductKey: () => isAliyunProductKey,
  resolveProductKeyGroup: () => resolveProductKeyGroup
});
module.exports = __toCommonJS(product_keys_exports);
var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K;
const PRODUCT_KEY_GROUPS = {
  Cm900ProductKey: ["zkRuTK9KsXG", "6DbgVh2Qs5m"],
  Luba2MiniProductKey: ["a1L5ZfJIxGl", "a1dCWYFLROK"],
  LubaLAProductKey: ["CDYuKXTYrSP"],
  LubaLDProductKey: ["a1jDMfG2Fgj", "a1vtZq9LUFS"],
  LubaMBProductKey: ["a1pb9toor70"],
  LubaMDProductKey: ["a1T6VTFTc0C", "a14iRDqMepW"],
  LubaProductKey: ["a1UBFdq6nNz", "a1x0zHD3Xop", "a1pvCnb3PPu", "a1kweSOPylG", "a1JFpmAV5Ur", "a1BmXWlsdbA", "a1jOhAYOIG8", "a1K4Ki2L5rK", "a1ae1QnXZGf", "a1nf9kRBWoH", "a1ZU6bdGjaM"],
  LubaVAProductKey: ["a1Ce85210Be", "a1BBOJnnjb9"],
  LubaVProductKey: ["a1iMygIwxFC", "a1LLmy1zc0j"],
  LubaVProProductKey: ["a1mb8v6tnAa", "a1pHsTqyoPR"],
  RTKNBProductKey: ["a1NfZqdSREf", "a1ZuQVL7UiN"],
  RTKProductKey: ["a1qXkZ5P39W", "a1Nc68bGZzX"],
  YukaMiniProductKey: ["a1BqmEWMRbX", "a1biqVGvxrE"],
  YukaMLProductKey: ["a1OWGO8WXbh", "a1s6znKxGvI"],
  YukaMN100ProductKey: ["NnbeYtaEUGE"],
  YukaMVProductKey: ["a1jFe8HzcDb", "a16cz0iXgUJ", "USpE46bNTC7", "pdA6uJrBfjz"],
  YukaPlusProductKey: ["a1lNESu9VST", "a1zAEzmvWDa"],
  YukaProductKey: ["a1kT0TlYEza", "a1IQV0BrnXb"]
};
function resolveProductKeyGroup(productKey) {
  if (!productKey) {
    return null;
  }
  for (const [group, keys] of Object.entries(PRODUCT_KEY_GROUPS)) {
    if (keys.includes(productKey)) {
      return group;
    }
  }
  return null;
}
const LUBA_PRO_PRODUCT_KEYS = new Set((_a = PRODUCT_KEY_GROUPS.LubaVProProductKey) != null ? _a : []);
const NAVIGATION_RECEIVER_PRODUCT_KEYS = /* @__PURE__ */ new Set([
  ...(_b = PRODUCT_KEY_GROUPS.LubaVProductKey) != null ? _b : [],
  ...(_c = PRODUCT_KEY_GROUPS.LubaVProProductKey) != null ? _c : [],
  ...(_d = PRODUCT_KEY_GROUPS.Luba2MiniProductKey) != null ? _d : [],
  ...(_e = PRODUCT_KEY_GROUPS.YukaProductKey) != null ? _e : [],
  ...(_f = PRODUCT_KEY_GROUPS.YukaPlusProductKey) != null ? _f : [],
  ...(_g = PRODUCT_KEY_GROUPS.YukaMiniProductKey) != null ? _g : [],
  ...(_h = PRODUCT_KEY_GROUPS.YukaMVProductKey) != null ? _h : [],
  ...(_i = PRODUCT_KEY_GROUPS.YukaMN100ProductKey) != null ? _i : [],
  ...(_j = PRODUCT_KEY_GROUPS.YukaMLProductKey) != null ? _j : [],
  ...(_k = PRODUCT_KEY_GROUPS.LubaLAProductKey) != null ? _k : [],
  ...(_l = PRODUCT_KEY_GROUPS.LubaLDProductKey) != null ? _l : [],
  ...(_m = PRODUCT_KEY_GROUPS.LubaVAProductKey) != null ? _m : [],
  ...(_n = PRODUCT_KEY_GROUPS.LubaMDProductKey) != null ? _n : [],
  ...(_o = PRODUCT_KEY_GROUPS.LubaMBProductKey) != null ? _o : []
]);
const YUKA_MINI_PRODUCT_KEYS = new Set((_p = PRODUCT_KEY_GROUPS.YukaMiniProductKey) != null ? _p : []);
const YUKA_ML_PRODUCT_KEYS = new Set((_q = PRODUCT_KEY_GROUPS.YukaMLProductKey) != null ? _q : []);
const YUKA_PRODUCT_KEYS = /* @__PURE__ */ new Set([
  ...(_r = PRODUCT_KEY_GROUPS.YukaProductKey) != null ? _r : [],
  ...(_s = PRODUCT_KEY_GROUPS.YukaPlusProductKey) != null ? _s : [],
  ...(_t = PRODUCT_KEY_GROUPS.YukaMVProductKey) != null ? _t : [],
  ...(_u = PRODUCT_KEY_GROUPS.YukaMN100ProductKey) != null ? _u : [],
  ...(_v = PRODUCT_KEY_GROUPS.YukaMiniProductKey) != null ? _v : [],
  ...(_w = PRODUCT_KEY_GROUPS.YukaMLProductKey) != null ? _w : []
]);
const ALIYUN_PRODUCT_KEYS = /* @__PURE__ */ new Set([
  ...(_x = PRODUCT_KEY_GROUPS.LubaProductKey) != null ? _x : [],
  ...(_y = PRODUCT_KEY_GROUPS.LubaVProductKey) != null ? _y : [],
  ...(_z = PRODUCT_KEY_GROUPS.LubaVProProductKey) != null ? _z : [],
  ...(_A = PRODUCT_KEY_GROUPS.Luba2MiniProductKey) != null ? _A : [],
  ...(_B = PRODUCT_KEY_GROUPS.YukaProductKey) != null ? _B : [],
  ...(_C = PRODUCT_KEY_GROUPS.YukaPlusProductKey) != null ? _C : [],
  ...(_D = PRODUCT_KEY_GROUPS.YukaMiniProductKey) != null ? _D : [],
  ...(_E = PRODUCT_KEY_GROUPS.RTKProductKey) != null ? _E : [],
  "a1jFe8HzcDb",
  "a16cz0iXgUJ",
  ...(_F = PRODUCT_KEY_GROUPS.LubaLDProductKey) != null ? _F : [],
  ...(_G = PRODUCT_KEY_GROUPS.LubaVAProductKey) != null ? _G : [],
  ...(_H = PRODUCT_KEY_GROUPS.YukaMLProductKey) != null ? _H : [],
  ...(_I = PRODUCT_KEY_GROUPS.LubaMDProductKey) != null ? _I : [],
  ...(_J = PRODUCT_KEY_GROUPS.LubaMBProductKey) != null ? _J : [],
  ...(_K = PRODUCT_KEY_GROUPS.RTKNBProductKey) != null ? _K : []
]);
function isAliyunProductKey(productKey) {
  return !!productKey && ALIYUN_PRODUCT_KEYS.has(productKey);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALIYUN_PRODUCT_KEYS,
  LUBA_PRO_PRODUCT_KEYS,
  NAVIGATION_RECEIVER_PRODUCT_KEYS,
  PRODUCT_KEY_GROUPS,
  YUKA_MINI_PRODUCT_KEYS,
  YUKA_ML_PRODUCT_KEYS,
  YUKA_PRODUCT_KEYS,
  isAliyunProductKey,
  resolveProductKeyGroup
});
//# sourceMappingURL=product-keys.js.map

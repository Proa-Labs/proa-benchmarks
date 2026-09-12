"use strict";

exports.__esModule = true;
exports.default = void 0;
var _ = _interopRequireWildcard(require("marko/html"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
var _default = exports.default = _._template("OGm9o6p", input => {
  const $scope0_reason = _._scope_reason();
  const $scope0_id = _._scope_id();
  _._html("<html lang=en><head><title>SSR Benchmark Page</title><meta name=viewport content=\"width=device-width, initial-scale=1\"></head><body><header class=hero-section><h1 class=title>SSR Framework Benchmark</h1><p class=subtitle>Comparing SSR frameworks</p></header><main class=main-content>");
  _._for_of(input.sections, section => {
    const $scope1_id = _._scope_id();
    _._html(`<section class=card-section${_._attr("data-section", section.dataSection)}><h2 class=section-title>${_._escape(section.title)}${_._el_resume($scope1_id, "b", _._serialize_guard($scope0_reason, /* input.sections */0))}</h2><div class=card-grid>`);
    _._for_of(section.cards, card => {
      const $scope2_id = _._scope_id();
      _._html(`<article class=card${_._attr("data-card-id", card.dataCardId)}><div class=card-header><img src=/images/benchmark.png alt="Benchmark chart" class=card-image></div><div class=card-body><h3 class=card-title>${_._escape(card.title)}${_._el_resume($scope2_id, "b", _._serialize_guard($scope0_reason, /* input.sections */0))}</h3><p class=card-description>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><ul class=feature-list>`);
      _._for_of(card.features, feature => {
        const $scope3_id = _._scope_id();
        _._html(`<li class=feature-item>${_._escape(feature)}${_._el_resume($scope3_id, "a", _._serialize_guard($scope0_reason, /* input.sections */0))}</li>`);
        _._serialize_if($scope0_reason, /* input.sections */0) && _._scope($scope3_id, {});
      }, 0, $scope2_id, "c", _._serialize_guard($scope0_reason, /* input.sections */0), _._serialize_guard($scope0_reason, /* input.sections */0), _._serialize_guard($scope0_reason, /* input.sections */0), "</ul>", 1);
      _._html(`<button class=btn-primary type=button>View Details</button></div></article>${_._el_resume($scope2_id, "a", _._serialize_guard($scope0_reason, /* input.sections */0))}`);
      _._serialize_if($scope0_reason, /* input.sections */0) && _._scope($scope2_id, {});
    }, 0, $scope1_id, "c", _._serialize_guard($scope0_reason, /* input.sections */0), _._serialize_guard($scope0_reason, /* input.sections */0), _._serialize_guard($scope0_reason, /* input.sections */0), "</div>", 1);
    _._html(`</section>${_._el_resume($scope1_id, "a", _._serialize_guard($scope0_reason, /* input.sections */0))}`);
    _._serialize_if($scope0_reason, /* input.sections */0) && _._scope($scope1_id, {});
  }, 0, $scope0_id, "a", _._serialize_guard($scope0_reason, /* input.sections */0), _._serialize_guard($scope0_reason, /* input.sections */0), _._serialize_guard($scope0_reason, /* input.sections */0), "</main>", 1);
  _._html("<footer class=footer><p>Rendered with Marko</p></footer>"), _._trailers("</body></html>");
  _._serialize_if($scope0_reason, /* input.sections */0) && _._scope($scope0_id, {});
});
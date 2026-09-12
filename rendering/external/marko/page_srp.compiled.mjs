import { CONDITION_CLASSES, CONDITION_LABELS, fmtCurrency, fmtCount, fmtFeedbackPct, fmtDiscount, fmtDateRange, fmtTimeLeft } from "./helpers_srp.mjs";
import * as _ from "marko/html";
export default _._template("mNbBRlM", input => {
  const $scope0_reason = _._scope_reason();
  const $scope0_id = _._scope_id();
  const $input_nowUnix__closures = new Set();
  _._html(`<html lang=en><head><title>Search results | Northstar Market</title><meta name=viewport content="width=device-width, initial-scale=1"></head><body class="bg-white text-gray-900"><header class=border-b><div class="px-6 py-3 flex items-center gap-4"><a href="/" class="text-2xl font-bold text-blue-700">Northstar Market</a><form class="flex-1 flex"><input${_._attr_input_value($scope0_id, "a", input.query)} type=search class="flex-1 px-3 py-2 border rounded-l">${_._el_resume($scope0_id, "a", _._serialize_guard($scope0_reason, /* input.query */3))}<button type=submit class="px-4 py-2 bg-blue-600 text-white rounded-r">Search</button></form></div><nav class="px-6 py-2 text-sm text-gray-600 flex gap-2"><a href="/">Home</a> <span>›</span><a href=/electronics>Electronics</a> <span>›</span><span>${_._escape(input.query)}${_._el_resume($scope0_id, "b", _._serialize_guard($scope0_reason, /* input.query */3))}</span></nav></header><div class="px-6 py-3 flex items-center justify-between border-b"><p class=text-lg><strong>${_._escape(fmtCount(input.totalResults))}${_._el_resume($scope0_id, "c", _._serialize_guard($scope0_reason, /* input.totalResults */4))}</strong> results for <strong>"${_._sep(_._serialize_guard($scope0_reason, /* input.query */3))}${_._escape(input.query)}${_._el_resume($scope0_id, "d", _._serialize_guard($scope0_reason, /* input.query */3))}"</strong></p><div class="flex items-center gap-3 text-sm"><label>Sort: <select class="border rounded px-2 py-1"><option>Best Match</option><option>Price + Shipping: lowest first</option><option>Price + Shipping: highest first</option><option>Time: newly listed</option><option>Time: ending soonest</option></select></label></div></div><main class="flex gap-6 px-6 py-4"><aside class="w-64 shrink-0">`);
  _._for_of(input.facets, section => {
    const $scope3_id = _._scope_id();
    _._html(`<div class=mb-5><h3 class="font-semibold text-sm mb-2 uppercase tracking-wide text-gray-700">${_._escape(section.title)}${_._el_resume($scope3_id, "a", _._serialize_guard($scope0_reason, /* input.facets */5))}</h3><ul class=space-y-1>`);
    _._for_of(section.options, opt => {
      const $scope4_id = _._scope_id();
      _._html(`<li${_._attr_class(opt.selected ? "flex justify-between items-center text-sm py-0.5 font-semibold text-blue-700" : "flex justify-between items-center text-sm py-0.5 text-gray-700 hover:text-blue-700")}><label class="flex items-center gap-2 cursor-pointer"><input${_._attr_input_checked($scope4_id, "b", opt.selected)} type=checkbox>${_._el_resume($scope4_id, "b", _._serialize_guard($scope0_reason, /* input.facets */5))}<span>${_._escape(opt.label)}${_._el_resume($scope4_id, "c", _._serialize_guard($scope0_reason, /* input.facets */5))}</span></label><span class=text-gray-500>(${_._sep(_._serialize_guard($scope0_reason, /* input.facets */5))}${_._escape(fmtCount(opt.count))}${_._el_resume($scope4_id, "d", _._serialize_guard($scope0_reason, /* input.facets */5))})</span></li>${_._el_resume($scope4_id, "a", _._serialize_guard($scope0_reason, /* input.facets */5))}`);
      _._serialize_if($scope0_reason, /* input.facets */5) && _._scope($scope4_id, {});
    }, 0, $scope3_id, "b", _._serialize_guard($scope0_reason, /* input.facets */5), _._serialize_guard($scope0_reason, /* input.facets */5), _._serialize_guard($scope0_reason, /* input.facets */5), "</ul>", 1);
    _._html("</div>");
    _._serialize_if($scope0_reason, /* input.facets */5) && _._scope($scope3_id, {});
  }, 0, $scope0_id, "e", _._serialize_guard($scope0_reason, /* input.facets */5), _._serialize_guard($scope0_reason, /* input.facets */5), _._serialize_guard($scope0_reason, /* input.facets, input.listings */0), "</aside>", 1);
  _._html("<section class=flex-1><ul class=\"grid grid-cols-1 md:grid-cols-3 gap-4\">");
  _._for_of(input.listings, l => {
    const $scope1_id = _._scope_id();
    _._html(`<li class="border rounded-lg p-3 hover:shadow-md flex flex-col"${_._attr("data-item-id", l.itemId)}><a${_._attr("href", l.itemId)} class="block aspect-square bg-gray-100 mb-3 overflow-hidden rounded"><img${_._attr("src", l.imageId)}${_._attr("srcset", l.imageId)}${_._attr("alt", l.title)} loading=lazy class="w-full h-full object-cover">${_._el_resume($scope1_id, "c", _._serialize_guard($scope0_reason, /* input.listings */6))}</a>${_._el_resume($scope1_id, "b", _._serialize_guard($scope0_reason, /* input.listings */6))}`);
    _._if(() => {
      if (l.sponsored) {
        const $scope8_id = _._scope_id();
        _._html("<span class=\"text-xs uppercase text-gray-400 tracking-wider mb-1\">Sponsored</span>");
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope8_id, {});
        return 0;
      }
    }, $scope1_id, "d", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), 0, 1);
    _._html(`<h3 class="text-sm font-medium leading-snug mb-1 line-clamp-2"><a${_._attr("href", l.itemId)} class=hover:underline>${_._escape(l.title)}${_._el_resume($scope1_id, "f", _._serialize_guard($scope0_reason, /* input.listings */6))}</a>${_._el_resume($scope1_id, "e", _._serialize_guard($scope0_reason, /* input.listings */6))}</h3>`);
    _._if(() => {
      if (l.subtitle) {
        const $scope5_id = _._scope_id();
        _._html(`<p class="text-xs text-gray-500 mb-1">${_._escape(l.subtitle)}${_._el_resume($scope5_id, "a", _._serialize_guard($scope0_reason, /* input.listings */6))}</p>`);
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope5_id, {
          _: _._scope_with_id($scope1_id)
        });
        return 0;
      }
    }, $scope1_id, "g", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), 0, 1);
    _._html(`<div class=mb-2><span${_._attr_class(CONDITION_CLASSES[l.condition])}>${_._escape(CONDITION_LABELS[l.condition])}${_._el_resume($scope1_id, "i", _._serialize_guard($scope0_reason, /* input.listings */6))}</span>${_._el_resume($scope1_id, "h", _._serialize_guard($scope0_reason, /* input.listings */6))}</div><div class="flex items-baseline gap-2 mb-1"><span class="text-lg font-bold text-gray-900">${_._escape(fmtCurrency(l.priceCents))}${_._el_resume($scope1_id, "j", _._serialize_guard($scope0_reason, /* input.listings */6))}</span>`);
    _._if(() => {
      if (l.originalPriceCents != null) {
        const $scope6_id = _._scope_id();
        _._html(`<span class="text-sm line-through text-gray-400">${_._escape(fmtCurrency(l.originalPriceCents))}${_._el_resume($scope6_id, "a", _._serialize_guard($scope0_reason, /* input.listings */6))}</span><span class="text-xs font-semibold text-red-600">${_._escape(fmtDiscount(l.originalPriceCents, l.priceCents))}${_._el_resume($scope6_id, "b", _._serialize_guard($scope0_reason, /* input.listings */6))}</span>`);
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope6_id, {
          _: _._scope_with_id($scope1_id)
        });
        return 0;
      }
    }, $scope1_id, "k", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6));
    _._html("</div><p class=\"text-xs text-gray-600 mb-1\">");
    _._if(() => {
      if (l.freeShipping) {
        const $scope9_id = _._scope_id();
        _._html("<span class=\"text-green-700 font-medium\">Free shipping</span>");
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope9_id, {});
        return 0;
      } else {
        const $scope7_id = _._scope_id();
        _._html(`+ ${_._sep(_._serialize_guard($scope0_reason, /* input.listings */6))}${_._escape(fmtCurrency(l.shippingCents))}${_._el_resume($scope7_id, "a", _._serialize_guard($scope0_reason, /* input.listings */6))} shipping`);
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope7_id, {
          _: _._scope_with_id($scope1_id)
        });
        return 1;
      }
    }, $scope1_id, "l", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), "</p>");
    _._html(`<p class="text-xs text-gray-600 mb-1">Get it by ${_._sep(_._serialize_guard($scope0_reason, /* input.listings */6))}${_._escape(fmtDateRange(l.deliveryMinUnix, l.deliveryMaxUnix))}${_._el_resume($scope1_id, "m", _._serialize_guard($scope0_reason, /* input.listings */6))}</p>`);
    _._if(() => {
      if (l.bidCount > 0) {
        const $scope2_id = _._scope_id();
        _._html(`<p class="text-xs text-orange-600 mb-1">${_._escape(l.bidCount)}${_._el_resume($scope2_id, "a", _._serialize_guard($scope0_reason, /* input.listings */6))} bids · ${_._sep(_._serialize_guard($scope0_reason, /* input.listings, input.nowUnix */1))}${_._escape(fmtTimeLeft(l.endUnix, input.nowUnix))}${_._el_resume($scope2_id, "b", _._serialize_guard($scope0_reason, /* input.listings, input.nowUnix */1))} left</p>`);
        _._serialize_if($scope0_reason, /* input.listings, input.nowUnix */1) && _._subscribe($input_nowUnix__closures, _._scope($scope2_id, {
          _: _._scope_with_id($scope1_id),
          Cm: _._serialize_if($scope0_reason, /* input.nowUnix */7) && 0
        }));
        return 0;
      }
    }, $scope1_id, "n", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), 0, 1);
    _._html(`<p class="text-xs text-gray-600 mb-1">${_._escape(fmtCount(l.soldCount))}${_._el_resume($scope1_id, "o", _._serialize_guard($scope0_reason, /* input.listings */6))}+ sold · ${_._sep(_._serialize_guard($scope0_reason, /* input.listings */6))}${_._escape(fmtCount(l.watchingCount))}${_._el_resume($scope1_id, "p", _._serialize_guard($scope0_reason, /* input.listings */6))} watching</p><div class="mt-auto pt-2 border-t text-xs text-gray-600"><p><strong>${_._escape(l.sellerName)}${_._el_resume($scope1_id, "q", _._serialize_guard($scope0_reason, /* input.listings */6))}</strong> · <span>${_._escape(fmtFeedbackPct(l.sellerFeedbackPctX10))}${_._el_resume($scope1_id, "r", _._serialize_guard($scope0_reason, /* input.listings */6))}</span> (${_._sep(_._serialize_guard($scope0_reason, /* input.listings */6))}${_._escape(fmtCount(l.sellerFeedbackCount))}${_._el_resume($scope1_id, "s", _._serialize_guard($scope0_reason, /* input.listings */6))})</p><p class=text-gray-500>${_._escape(l.location)}${_._el_resume($scope1_id, "t", _._serialize_guard($scope0_reason, /* input.listings */6))}</p><div class="flex gap-2 mt-1">`);
    _._if(() => {
      if (l.topRatedSeller) {
        const $scope10_id = _._scope_id();
        _._html("<span class=\"text-purple-700 font-semibold\">Top Rated Plus</span>");
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope10_id, {});
        return 0;
      }
    }, $scope1_id, "u", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), 0, 1);
    _._if(() => {
      if (l.freeReturns) {
        const $scope11_id = _._scope_id();
        _._html("<span class=text-green-700>Free returns</span>");
        _._serialize_if($scope0_reason, /* input.listings */6) && _._scope($scope11_id, {});
        return 0;
      }
    }, $scope1_id, "v", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), 0, 1);
    _._html(`</div></div></li>${_._el_resume($scope1_id, "a", _._serialize_guard($scope0_reason, /* input.listings */6))}`);
    _._serialize_if($scope0_reason, /* input.listings, input.nowUnix */1) && _._scope($scope1_id, {
      a2: _._serialize_if($scope0_reason, /* input.listings */6) && l?.subtitle,
      a4: _._serialize_if($scope0_reason, /* input.listings */6) && l?.priceCents,
      a5: _._serialize_if($scope0_reason, /* input.listings */6) && l?.originalPriceCents,
      a7: _._serialize_if($scope0_reason, /* input.listings */6) && l?.shippingCents,
      ab: _._serialize_if($scope0_reason, /* input.listings */6) && l?.bidCount,
      ac: l?.endUnix,
      _: _._scope_with_id($scope0_id)
    });
  }, 0, $scope0_id, "f", _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.listings */6), _._serialize_guard($scope0_reason, /* input.facets, input.listings */0), "</ul>", 1);
  _._html("<nav class=\"mt-6 flex justify-center gap-2 text-sm\"><button class=\"px-3 py-1 border rounded\">\u2039 Previous</button><button class=\"px-3 py-1 border rounded bg-blue-600 text-white\">1</button><button class=\"px-3 py-1 border rounded\">2</button><button class=\"px-3 py-1 border rounded\">3</button><button class=\"px-3 py-1 border rounded\">4</button><button class=\"px-3 py-1 border rounded\">5</button><button class=\"px-3 py-1 border rounded\">Next \u203A</button></nav></section></main><footer class=\"border-t mt-8 px-6 py-4 text-xs text-gray-500\"><p>\xA9 Demo Marketplace \xB7 This is a benchmark page only.</p></footer>"), _._trailers("</body></html>");
  _._serialize_if($scope0_reason, /* input.query, input.totalResults, input.facets, input.listings, input.nowUnix */2) && _._scope($scope0_id, {
    m: _._serialize_if($scope0_reason, /* input.listings */6) && input.nowUnix,
    Bm: _._serialize_if($scope0_reason, /* input.nowUnix */7) && $input_nowUnix__closures
  });
});
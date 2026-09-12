import { CAPTION_LABELS, CAPTION_CLASSES, fmtCurrency, fmtCount, fmtFeedbackPct, fmtAbbrev, itemUrl, emptyStarCount, repeatArray } from "./helpers_srp_real.mjs";
import * as _2 from "marko/html";
export default _2._template("Wmh1HOw", input => {
  const $scope0_reason = _2._scope_reason();
  const $scope0_id = _2._scope_id();
  _2._for_of(input.listings, l => {
    const $scope1_id = _2._scope_id();
    _2._html(`<li${_2._attr("id", "item" + l.itemId)}${_2._attr("data-listingid", l.itemId)} class="s-card s-card--horizontal"><div class="su-card-container su-card-container--horizontal"><div class=su-card-container__media><div class="su-media-container s-card__media-wrapper"><div class=su-media-multi-image><div class=su-media-multi-image__primary><div class=su-media-container><div class=su-image><a class="s-card__link image-treatment"${_2._attr("href", itemUrl(l.itemId))} target=_blank style="--aspect-ratio: 1;"><img class=s-card__image fetchpriority=high loading=eager${_2._attr("src", "/images/synthetic/field-recorder.svg#" + l.imageHash)}${_2._attr("alt", l.title)} style=width:auto>${_2._el_resume($scope1_id, "c", _2._serialize_guard($scope0_reason, /* input.listings */0))}</a>${_2._el_resume($scope1_id, "b", _2._serialize_guard($scope0_reason, /* input.listings */0))}</div></div></div></div><div class="su-media__action su-media__action--top-right"><span class="s-card__watchheart on-image s-card__watchheart--watch"><a${_2._attr("aria-label", "watch " + l.title)} class=s-card__watchheart-click href=#><span class=s-card__watchheart-icon><svg class="icon icon--16" focusable=false aria-hidden=true><use href=#icon-heart-16></use></svg><svg class="icon icon--16" focusable=false aria-hidden=true><use href=#icon-heart-filled-16></use></svg></span></a>${_2._el_resume($scope1_id, "d", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span></div></div></div><div class=su-card-container__content><div class=su-card-container__header><div class=s-card__caption>`);
    _2._if(() => {
      if (l.caption) {
        const $scope2_id = _2._scope_id();
        _2._html(`<span${_2._attr_class(CAPTION_CLASSES[l.caption])}${_2._attr("aria-label", CAPTION_LABELS[l.caption])}>${_2._escape(CAPTION_LABELS[l.caption])}${_2._el_resume($scope2_id, "b", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span>${_2._el_resume($scope2_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0))}`);
        _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope2_id, {
          _: _2._scope_with_id($scope1_id)
        });
        return 0;
      }
    }, $scope1_id, "e", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), "</div>", 1);
    _2._html(`<a class=s-card__link target=_blank tabindex=-1${_2._attr("href", itemUrl(l.itemId))}><div role=heading aria-level=3 class=s-card__title><span class="su-styled-text primary default">${_2._escape(l.title)}${_2._el_resume($scope1_id, "g", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span></div></a>${_2._el_resume($scope1_id, "f", _2._serialize_guard($scope0_reason, /* input.listings */0))}<div class=s-card__subtitle-row><div class=s-card__subtitle>`);
    _2._for_of(l.subtitleParts, (part, idx) => {
      const $scope3_id = _2._scope_id();
      _2._html(`<span class="su-styled-text secondary default">${_2._escape(part)}${_2._el_resume($scope3_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0))}`);
      _2._if(() => {
        if (idx < l.subtitleParts.length - 1) {
          const $scope7_id = _2._scope_id();
          _2._html(" \xB7 ");
          _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope7_id, {});
          return 0;
        }
      }, $scope3_id, "b", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0));
      _2._html("</span>");
      _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope3_id, {
        _: _2._scope_with_id($scope1_id)
      });
    }, 0, $scope1_id, "h", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), "</div>", 1);
    _2._html("</div><div class=s-card__product-reviews><div class=s-card__reviews><a href=#UserReviews><div class=x-star-rating>");
    _2._for_of(repeatArray(l.starsFull), (_, i) => {
      const $scope8_id = _2._scope_id();
      _2._html("<svg class=\"icon icon--16\" focusable=false aria-hidden=true><use href=#icon-star-filled-16></use></svg>");
      _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope8_id, {});
    }, 0, $scope1_id, "i", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), 0, 1);
    _2._if(() => {
      if (l.hasHalfStar) {
        const $scope9_id = _2._scope_id();
        _2._html("<svg class=\"icon icon--16-colored\" focusable=false aria-hidden=true><use href=#icon-star-half-16-colored></use></svg>");
        _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope9_id, {});
        return 0;
      }
    }, $scope1_id, "j", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), 0, 1);
    _2._for_of(repeatArray(emptyStarCount(l.starsFull, l.hasHalfStar)), (_, i) => {
      const $scope10_id = _2._scope_id();
      _2._html("<svg class=\"icon icon--16\" focusable=false aria-hidden=true><use href=#icon-star-empty-16></use></svg>");
      _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope10_id, {});
    }, 0, $scope1_id, "k", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), 0, 1);
    _2._html(`</div><span class=s-card__reviews-count><span aria-hidden=false>${_2._escape(fmtCount(l.reviewCount))}${_2._el_resume($scope1_id, "l", _2._serialize_guard($scope0_reason, /* input.listings */0))} product ratings</span></span></a></div></div></div><div class="su-card-container__attributes su-card-container__attributes--has-secondary"><div class=su-card-container__attributes__primary><div class=s-card__attribute-row><span class="su-styled-text primary bold large-1 s-card__price">${_2._escape(fmtCurrency(l.priceCents))}${_2._el_resume($scope1_id, "m", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span>`);
    _2._if(() => {
      if (l.originalPriceCents != null) {
        const $scope4_id = _2._scope_id();
        _2._html(`<span class="su-spacer --spacing-100"></span><span class="su-styled-text secondary strikethrough large">${_2._escape(fmtCurrency(l.originalPriceCents))}${_2._el_resume($scope4_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span>`);
        _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope4_id, {
          _: _2._scope_with_id($scope1_id)
        });
        return 0;
      }
    }, $scope1_id, "n", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0));
    _2._html(`</div><div class=s-card__attribute-row><span class="su-styled-text secondary large">${_2._escape(l.format)}${_2._el_resume($scope1_id, "o", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span></div><div class=s-card__attribute-row><span class="su-styled-text secondary large">`);
    _2._if(() => {
      if (l.deliveryCents === 0) {
        const $scope11_id = _2._scope_id();
        _2._html("Free delivery");
        _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope11_id, {});
        return 0;
      } else {
        const $scope5_id = _2._scope_id();
        _2._html(`+${_2._sep(_2._serialize_guard($scope0_reason, /* input.listings */0))}${_2._escape(fmtCurrency(l.deliveryCents))}${_2._el_resume($scope5_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0))} delivery`);
        _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope5_id, {
          _: _2._scope_with_id($scope1_id)
        });
        return 1;
      }
    }, $scope1_id, "p", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), "</span>");
    _2._html(`</div><div class=s-card__attribute-row><span class="su-styled-text secondary large">Located in ${_2._sep(_2._serialize_guard($scope0_reason, /* input.listings */0))}${_2._escape(l.location)}${_2._el_resume($scope1_id, "q", _2._serialize_guard($scope0_reason, /* input.listings */0))}</span></div><div class=s-card__attribute-row><span class="su-styled-text primary bold large">${_2._escape(fmtCount(l.watcherCount))}${_2._el_resume($scope1_id, "r", _2._serialize_guard($scope0_reason, /* input.listings */0))} watchers</span></div>`);
    _2._if(() => {
      if (l.couponPct != null) {
        const $scope6_id = _2._scope_id();
        _2._html(`<div class=s-card__attribute-row><span class="su-styled-text negative bold large">Extra ${_2._sep(_2._serialize_guard($scope0_reason, /* input.listings */0))}${_2._escape(l.couponPct)}${_2._el_resume($scope6_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0))}% off with coupon</span></div>`);
        _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope6_id, {
          _: _2._scope_with_id($scope1_id)
        });
        return 0;
      }
    }, $scope1_id, "s", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), 0, 1);
    _2._html(`</div><div class=su-card-container__attributes__secondary><div class=s-card__attribute-row><span class="su-styled-text primary large">${_2._escape(l.sellerName)}${_2._el_resume($scope1_id, "t", _2._serialize_guard($scope0_reason, /* input.listings */0))} </span><span class="su-styled-text primary large">${_2._escape(fmtFeedbackPct(l.sellerFeedbackPctX10))}${_2._el_resume($scope1_id, "u", _2._serialize_guard($scope0_reason, /* input.listings */0))} positive (${_2._sep(_2._serialize_guard($scope0_reason, /* input.listings */0))}${_2._escape(fmtAbbrev(l.sellerFeedbackCount))}${_2._el_resume($scope1_id, "v", _2._serialize_guard($scope0_reason, /* input.listings */0))})</span></div></div></div></div></div></li>${_2._el_resume($scope1_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0))}`);
    _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope1_id, {
      a1: l?.caption,
      a3: l?.subtitleParts?.length,
      a9: l?.originalPriceCents,
      ab: l?.deliveryCents,
      ae: l?.couponPct
    });
  }, 0, $scope0_id, "a", _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), _2._serialize_guard($scope0_reason, /* input.listings */0), 0, 1);
  _2._serialize_if($scope0_reason, /* input.listings */0) && _2._scope($scope0_id, {});
});
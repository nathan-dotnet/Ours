import type { ViewStyle } from 'react-native';

/**
 * Soft Romantic Neumorphism shadow tokens.
 *
 * True neumorphism pairs a light shadow (top-left) with a dark shadow (bottom-right) on a
 * surface that's nearly the same color as its background, so the surface reads as pressed out of
 * (or into) the page rather than "a card floating on top of it". React Native's View only
 * supports one shadow per element (shadowColor/Offset/Opacity/Radius on iOS, elevation on
 * Android — no dual light+dark shadow, no inset), so these approximate the effect with a single
 * soft, diffused, blue-tinted shadow (tinted to match the palette's ink, not neutral black/gray,
 * which is what keeps it reading as "soft" rather than "a generic drop shadow") plus generous
 * corner rounding. That single-shadow approximation is a deliberate, documented simplification —
 * not a missing feature — given plain React Native style props are used here instead of pulling
 * in a shadow-rendering library for a purely cosmetic effect.
 *
 * Plain style objects (not NativeWind classes) because shadowColor/Offset/Opacity/Radius and
 * elevation aren't representable as Tailwind utilities in this project's NativeWind setup —
 * spread these alongside each surface's existing className.
 */

const SHADOW_TINT = '#1F2A3C'; // the same navy as the `ink` palette token — see tailwind.config.js

/** The default "raised card" shadow — Money/Calendar/Vault list cards, dashboard tiles, form cards. */
export const softRaised: ViewStyle = {
  shadowColor: SHADOW_TINT,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.14,
  shadowRadius: 14,
  elevation: 5,
};

/** A lighter touch for small/nested surfaces (stat tiles inside a card, chips, icon badges) where a full-strength shadow would look noisy stacked on top of another shadow. */
export const softRaisedSubtle: ViewStyle = {
  shadowColor: SHADOW_TINT,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.10,
  shadowRadius: 7,
  elevation: 2,
};

/** For the primary (rose-filled) button — a slightly stronger, more saturated lift since it's the page's main call to action. */
export const softRaisedAccent: ViewStyle = {
  shadowColor: SHADOW_TINT,
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.22,
  shadowRadius: 10,
  elevation: 6,
};

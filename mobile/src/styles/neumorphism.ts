import type { ViewStyle } from 'react-native';

/**
 * Shadow tokens — kept as a single small file so every surface in the app shares one elevation
 * scale. Originally a "Soft Romantic Neumorphism" look (heavy dual-toned shadows on every card);
 * the Money redesign moved the app toward a flatter, bordered "modern fintech" language instead
 * (see Card.tsx — borders do the grouping work shadows used to do), so these are now genuinely
 * subtle elevation, used sparingly, not the default treatment for every surface. The three export
 * names are kept as-is (rather than renamed) so every existing importer across the app keeps
 * compiling unchanged; only the values changed.
 *
 * Plain style objects (not NativeWind classes) because shadowColor/Offset/Opacity/Radius and
 * elevation aren't representable as Tailwind utilities in this project's NativeWind setup —
 * spread these alongside each surface's existing className, only where real elevation (a floating
 * primary button, a modal) is warranted.
 */

const SHADOW_TINT = '#1F2A3C'; // the same navy as the `ink`/`textPrimary` palette token — see tailwind.config.js

/** A subtle lift for the rare surface that should float above the page (e.g. a modal sheet). Most cards should use Card.tsx's border instead of this. */
export const softRaised: ViewStyle = {
  shadowColor: SHADOW_TINT,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 2,
};

/** Barely-there elevation for small/nested surfaces (chips, icon badges) where even `softRaised` would look noisy. */
export const softRaisedSubtle: ViewStyle = {
  shadowColor: SHADOW_TINT,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 3,
  elevation: 1,
};

/** The primary (accent-filled) button's own slightly stronger lift — still subtle, just enough to read as "the one thing to tap". */
export const softRaisedAccent: ViewStyle = {
  shadowColor: SHADOW_TINT,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.12,
  shadowRadius: 8,
  elevation: 3,
};

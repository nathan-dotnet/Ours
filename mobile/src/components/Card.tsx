import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { softRaisedSubtle } from '../styles/neumorphism';

interface CardProps extends ViewProps {
  children: ReactNode;
  /** For the rare surface that should float above the page — a subtle shadow instead of the default border-only grouping. Most cards should NOT set this; see the module doc comment. */
  elevated?: boolean;
}

/**
 * The one shared "grouped surface" primitive for the modern-fintech Money redesign — a thin
 * border and a flat `surface` fill do the grouping work the old neumorphic shadow used to do
 * (see the redesign's "use borders for grouping instead of shadows everywhere"). Cards should
 * only wrap content that genuinely benefits from being visually grouped; plenty of Money content
 * now sits directly on the page with just a MoneySectionHeader above it, no card at all.
 */
export function Card({ children, elevated = false, className = '', style, ...rest }: CardProps) {
  return (
    <View
      className={`rounded-xl border border-border bg-surface p-4 ${className}`}
      style={elevated ? [softRaisedSubtle, style] : style}
      {...rest}
    >
      {children}
    </View>
  );
}

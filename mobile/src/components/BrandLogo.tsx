import { Image, Text, View } from 'react-native';
import { getAccountBrand } from '../utils/accountBrand';

interface BrandLogoProps {
  icon: string;
  accountType: string;
  size?: number;
}

/** A known institution renders as its real logo image (see accountBrand.ts); anything else falls back to a plain emoji. */
export function BrandLogo({ icon, accountType, size = 40 }: BrandLogoProps) {
  const brand = getAccountBrand(icon, accountType);

  if (!brand.isKnownBrand || !brand.logo) {
    return <Text style={{ fontSize: size * 0.7 }}>{brand.emoji}</Text>;
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden' }}
      className="items-center justify-center bg-blush"
    >
      <Image source={brand.logo} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={brand.label} />
    </View>
  );
}

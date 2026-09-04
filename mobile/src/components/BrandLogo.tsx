import { Text, View } from 'react-native';
import { getAccountBrand } from '../utils/accountBrand';

interface BrandLogoProps {
  icon: string;
  accountType: string;
  size?: number;
}

/** A known institution renders as a colored wordmark badge in that brand's real color (see accountBrand.ts); anything else falls back to a plain emoji. */
export function BrandLogo({ icon, accountType, size = 40 }: BrandLogoProps) {
  const brand = getAccountBrand(icon, accountType);

  if (!brand.isKnownBrand) {
    return <Text style={{ fontSize: size * 0.7 }}>{brand.emoji}</Text>;
  }

  return (
    <View
      style={{ width: size, height: size, backgroundColor: brand.backgroundColor, borderRadius: size * 0.28 }}
      className="items-center justify-center"
    >
      <Text style={{ color: brand.textColor, fontSize: brand.wordmark.length > 3 ? size * 0.24 : size * 0.32 }} className="font-bold" numberOfLines={1}>
        {brand.wordmark}
      </Text>
    </View>
  );
}

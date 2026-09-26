const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

// Android's adaptive-icon mask exposes a smaller safe zone than Expo's generated 108 dp
// foreground viewport. Inset the drawable by 14 dp on every edge so the existing mark and
// wordmark remain wholly inside the mask on circular, squircle, and themed launchers.
const FOREGROUND_INSET_DP = 14;
const INSET_DRAWABLE_NAME = 'ours_launcher_foreground_inset';

const insetDrawableXml = `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:insetLeft="${FOREGROUND_INSET_DP}dp"
    android:insetTop="${FOREGROUND_INSET_DP}dp"
    android:insetRight="${FOREGROUND_INSET_DP}dp"
    android:insetBottom="${FOREGROUND_INSET_DP}dp">
    <bitmap
        android:gravity="fill"
        android:src="@mipmap/ic_launcher_foreground" />
</inset>
`;

function withAdaptiveIconForegroundInset(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const drawableDir = path.join(resDir, 'drawable');
      const adaptiveIconDir = path.join(resDir, 'mipmap-anydpi-v26');

      await fs.mkdir(drawableDir, { recursive: true });
      await fs.writeFile(path.join(drawableDir, `${INSET_DRAWABLE_NAME}.xml`), insetDrawableXml, 'utf8');

      for (const filename of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
        const iconPath = path.join(adaptiveIconDir, filename);
        const iconXml = await fs.readFile(iconPath, 'utf8');
        const updatedIconXml = iconXml.replace(
          '<foreground android:drawable="@mipmap/ic_launcher_foreground"/>',
          `<foreground android:drawable="@drawable/${INSET_DRAWABLE_NAME}"/>`,
        );

        if (updatedIconXml === iconXml) {
          throw new Error(`Expected Expo's adaptive icon foreground in ${filename}, but it was not found.`);
        }
        await fs.writeFile(iconPath, updatedIconXml, 'utf8');
      }

      return config;
    },
  ]);
}

module.exports = withAdaptiveIconForegroundInset;

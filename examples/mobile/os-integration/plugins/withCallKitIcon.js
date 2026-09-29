const { withDangerousMod } = require('expo/config-plugins');
const path = require('node:path');
const fs = require('node:fs');

// The CallKit call screen has a button that opens the app, drawn from
// CXProviderConfiguration.iconTemplateImageData. Left unset it shows a blank
// placeholder, and expo-callkit-telecom has no option for it, so the image goes
// into the asset catalog here and the patched CallManager loads it by name.
//
// A template image: CallKit uses only the alpha channel and tints it itself.
const IMAGE_SET = 'CallKitIcon';
const SOURCE = 'assets/images/callkit-icon.png';

const withCallKitIcon = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
      const dir = path.join(
        platformProjectRoot,
        projectName,
        'Images.xcassets',
        `${IMAGE_SET}.imageset`
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(projectRoot, SOURCE), path.join(dir, 'callkit-icon.png'));
      fs.writeFileSync(
        path.join(dir, 'Contents.json'),
        `${JSON.stringify(
          {
            images: [{ filename: 'callkit-icon.png', idiom: 'universal' }],
            info: { author: 'xcode', version: 1 },
            properties: { 'template-rendering-intent': 'template' },
          },
          null,
          2
        )}\n`
      );
      return cfg;
    },
  ]);

module.exports = withCallKitIcon;

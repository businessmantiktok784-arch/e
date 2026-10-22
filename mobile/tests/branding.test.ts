import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')) as { expo: { icon: string; plugins: unknown[]; android: { adaptiveIcon: { foregroundImage: string; backgroundImage: string; monochromeImage: string } } } };

test('Earth Talk splash and launcher assets referenced by Expo configuration are valid square PNGs', () => {
  const referenced = [app.expo.icon, './assets/images/splash-icon.png', './assets/images/splash-icon-dark.png', app.expo.android.adaptiveIcon.foregroundImage, app.expo.android.adaptiveIcon.backgroundImage, app.expo.android.adaptiveIcon.monochromeImage, './assets/images/favicon.png'];
  for (const asset of referenced) {
    const bytes = fs.readFileSync(path.join(root, asset));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${asset} must be PNG`);
    assert.equal(bytes.readUInt32BE(16), 1024, `${asset} width`);
    assert.equal(bytes.readUInt32BE(20), 1024, `${asset} height`);
  }
  const splash = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  assert.ok(Array.isArray(splash));
  const splashOptions = splash[1] as { imageWidth?: number; dark?: { image?: string; backgroundColor?: string } };
  assert.equal(splashOptions.imageWidth, 190);
  assert.equal(splashOptions.dark?.image, './assets/images/splash-icon-dark.png');
  assert.equal(splashOptions.dark?.backgroundColor, '#141B17');
});

import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Android Maps SDK keys are public app credentials; restrict them in Google Cloud by package and signing certificate. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return {
    ...config,
    name: config.name ?? 'Earth Talk',
    slug: config.slug ?? 'earth-talk-mobile',
    android: {
      ...config.android,
      package: config.android?.package ?? 'org.earthtalk.mobile',
      ...(androidMapsKey ? { config: { ...config.android?.config, googleMaps: { apiKey: androidMapsKey } } } : {}),
    },
    extra: { ...config.extra, androidMapsConfigured: Boolean(androidMapsKey) },
  };
};

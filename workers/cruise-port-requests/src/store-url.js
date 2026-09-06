const IOS_STORE_ID_PATTERN = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?app\/(?:[^/]+\/)?id(\d{6,20})\/?$/i;
const ANDROID_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z\d_]*(?:\.[A-Za-z][A-Za-z\d_]*)+$/;

function parseHttpsUrl(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseIosAppStoreId(value) {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname !== 'apps.apple.com') return null;
  return url.pathname.match(IOS_STORE_ID_PATTERN)?.[1] || null;
}

export function parseAndroidPlayPackage(value) {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details') {
    return null;
  }

  const packageValues = url.searchParams.getAll('id');
  if (packageValues.length !== 1) return null;

  const packageName = packageValues[0];
  return ANDROID_PACKAGE_PATTERN.test(packageName) ? packageName : null;
}

export function parseStoreIdentity(platform, storeUrl) {
  if (platform === 'ios') {
    const identifier = parseIosAppStoreId(storeUrl);
    return identifier
      ? {
          platform,
          identifier,
          requestKey: `ios:${identifier}`,
          canonicalStoreUrl: `https://apps.apple.com/app/id${identifier}`
        }
      : null;
  }

  if (platform === 'android') {
    const identifier = parseAndroidPlayPackage(storeUrl);
    return identifier
      ? {
          platform,
          identifier,
          requestKey: `android:${identifier}`,
          canonicalStoreUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(identifier)}`
        }
      : null;
  }

  return null;
}

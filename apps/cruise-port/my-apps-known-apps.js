const createKnownApp = ({
    key,
    name,
    category,
    iosStoreIds = [],
    androidPackages = [],
    iosHref = null,
    androidHref = null,
    androidVerified = false
}) => Object.freeze({
    key,
    name,
    category,
    match: Object.freeze({
        iosStoreIds: Object.freeze([...iosStoreIds]),
        androidPackages: Object.freeze([...androidPackages])
    }),
    launch: Object.freeze({
        ios: iosHref ? Object.freeze({ kind: 'https', href: iosHref }) : null,
        android: androidHref
            ? Object.freeze({ kind: 'https', href: androidHref, verified: androidVerified === true })
            : null
    })
});

// iOS targets are verified direct links. Android hrefs remain candidates unless verified is true.
export const MY_APPS_KNOWN_APPS = Object.freeze([
    createKnownApp({
        key: 'spotify',
        name: 'Spotify',
        category: 'music-streaming',
        iosStoreIds: ['324684580'],
        androidPackages: ['com.spotify.music'],
        iosHref: 'https://open.spotify.com/',
        androidHref: 'https://open.spotify.com/'
    }),
    createKnownApp({
        key: 'youtube',
        name: 'YouTube',
        category: 'music-streaming',
        iosStoreIds: ['544007664'],
        androidPackages: ['com.google.android.youtube'],
        iosHref: 'https://www.youtube.com/',
        androidHref: 'https://www.youtube.com/',
        androidVerified: true
    }),
    createKnownApp({
        key: 'dropbox',
        name: 'Dropbox',
        category: 'cloud-storage',
        iosStoreIds: ['327630330'],
        androidPackages: ['com.dropbox.android'],
        iosHref: 'https://www.dropbox.com/home',
        androidHref: 'https://www.dropbox.com/home'
    }),
    createKnownApp({
        key: 'notion',
        name: 'Notion',
        category: 'notes',
        iosStoreIds: ['1232780281'],
        androidPackages: ['notion.id'],
        iosHref: 'https://www.notion.so/',
        androidHref: 'https://www.notion.so/'
    }),
    createKnownApp({
        key: 'chatgpt',
        name: 'ChatGPT',
        category: 'ai',
        iosStoreIds: ['6448311069'],
        androidPackages: ['com.openai.chatgpt'],
        iosHref: 'https://chatgpt.com/#native'
    }),
    createKnownApp({
        key: 'claude',
        name: 'Claude',
        category: 'ai',
        iosStoreIds: ['6473753684'],
        androidPackages: ['com.anthropic.claude'],
        iosHref: 'https://claude.ai/new',
        androidHref: 'https://claude.ai/new'
    }),
    createKnownApp({
        key: 'grok',
        name: 'Grok',
        category: 'ai',
        iosStoreIds: ['6670324846'],
        androidPackages: ['ai.x.grok'],
        iosHref: 'https://grok.com/',
        androidHref: 'https://grok.com/'
    }),
    createKnownApp({
        key: 'perplexity',
        name: 'Perplexity',
        category: 'ai',
        iosStoreIds: ['1668000334'],
        androidPackages: ['ai.perplexity.app.android'],
        iosHref: 'https://www.perplexity.ai/open',
        androidHref: 'https://www.perplexity.ai/open'
    }),
    createKnownApp({
        key: 'suno',
        name: 'Suno',
        category: 'ai',
        iosStoreIds: ['6480136315'],
        androidPackages: ['com.suno.android'],
        iosHref: 'https://suno.com/create',
        androidHref: 'https://suno.com/create'
    }),
    createKnownApp({
        key: 'box',
        name: 'Box',
        category: 'cloud-storage',
        iosStoreIds: ['290853822'],
        androidPackages: ['com.box.android'],
        iosHref: 'https://app.box.com/folder/0',
        androidHref: 'https://app.box.com/folder/0'
    }),
    createKnownApp({
        key: 'google-drive',
        name: 'Google Drive',
        category: 'cloud-storage',
        iosStoreIds: ['507874739'],
        androidPackages: ['com.google.android.apps.docs'],
        iosHref: 'https://drive.google.com/drive',
        androidHref: 'https://drive.google.com/drive',
        androidVerified: true
    }),
    createKnownApp({
        key: 'mega',
        name: 'MEGA',
        category: 'cloud-storage',
        iosStoreIds: ['706857885'],
        androidPackages: ['mega.privacy.android.app'],
        iosHref: 'https://mega.nz/',
        androidHref: 'https://mega.nz/'
    }),
    createKnownApp({
        key: 'onedrive',
        name: 'Microsoft OneDrive',
        category: 'cloud-storage',
        iosStoreIds: ['477537958'],
        androidPackages: ['com.microsoft.skydrive'],
        iosHref: 'https://onedrive.live.com/',
        androidHref: 'https://onedrive.live.com/'
    }),
    createKnownApp({
        key: 'pcloud',
        name: 'pCloud',
        category: 'cloud-storage',
        iosStoreIds: ['692002098'],
        androidPackages: ['com.pcloud.pcloud'],
        iosHref: 'https://my.pcloud.com/app-open.html',
        androidHref: 'https://my.pcloud.com/app-open.html'
    }),
    createKnownApp({
        key: 'adobe-express',
        name: 'Adobe Express',
        category: 'creative',
        iosStoreIds: ['1051937863'],
        androidPackages: ['com.adobe.spark.post'],
        iosHref: 'https://express.adobe.com/new',
        androidHref: 'https://express.adobe.com/new'
    }),
    createKnownApp({
        key: 'canva',
        name: 'Canva',
        category: 'creative',
        iosStoreIds: ['897446215'],
        androidPackages: ['com.canva.editor'],
        iosHref: 'https://www.canva.com/design',
        androidHref: 'https://www.canva.com/design',
        androidVerified: true
    }),
    createKnownApp({
        key: 'picsart',
        name: 'Picsart',
        category: 'creative',
        iosStoreIds: ['587366035'],
        androidPackages: ['com.picsart.studio'],
        iosHref: 'https://picsart.com/open',
        androidHref: 'https://picsart.com/open'
    }),
    createKnownApp({
        key: 'vn-video-editor',
        name: 'VN Video Editor',
        category: 'creative',
        iosStoreIds: ['1343581380'],
        androidPackages: ['com.frontrow.vlog'],
        iosHref: 'https://www.vlognow.me/',
        androidHref: 'https://www.vlognow.me/'
    }),
    createKnownApp({
        key: 'songsterr',
        name: 'Songsterr',
        category: 'instrument-practice',
        iosStoreIds: ['399211291'],
        androidPackages: ['com.songsterr'],
        iosHref: 'https://www.songsterr.com/',
        androidHref: 'https://www.songsterr.com/'
    }),
    createKnownApp({
        key: 'bandlab',
        name: 'BandLab',
        category: 'music-production',
        iosStoreIds: ['968585775'],
        androidPackages: ['com.bandlab.bandlab'],
        iosHref: 'https://www.bandlab.com/',
        androidHref: 'https://www.bandlab.com/'
    }),
    createKnownApp({
        key: 'amazon-music',
        name: 'Amazon Music',
        category: 'music-streaming',
        iosStoreIds: ['510855668'],
        androidPackages: ['com.amazon.mp3'],
        iosHref: 'https://music.amazon.com/',
        androidHref: 'https://music.amazon.com/'
    }),
    createKnownApp({
        key: 'audiomack',
        name: 'Audiomack',
        category: 'music-streaming',
        iosStoreIds: ['921765888'],
        androidPackages: ['com.audiomack'],
        iosHref: 'https://audiomack.com/',
        androidHref: 'https://audiomack.com/'
    }),
    createKnownApp({
        key: 'deezer',
        name: 'Deezer',
        category: 'music-streaming',
        iosStoreIds: ['292738169'],
        androidPackages: ['deezer.android.app'],
        iosHref: 'https://www.deezer.com/universal-link',
        androidHref: 'https://www.deezer.com/universal-link'
    }),
    createKnownApp({
        key: 'line-music',
        name: 'LINE MUSIC',
        category: 'music-streaming',
        iosStoreIds: ['966142320'],
        androidPackages: ['jp.linecorp.linemusic.android'],
        iosHref: 'https://music.line.me/launch',
        androidHref: 'https://music.line.me/launch'
    }),
    createKnownApp({
        key: 'pandora',
        name: 'Pandora',
        category: 'music-streaming',
        iosStoreIds: ['284035177'],
        androidPackages: ['com.pandora.android'],
        iosHref: 'https://www.pandora.com/',
        androidHref: 'https://www.pandora.com/'
    }),
    createKnownApp({
        key: 'rakuten-music',
        name: '楽天ミュージック',
        category: 'music-streaming',
        iosStoreIds: ['1073815664'],
        androidPackages: ['jp.co.rakuten.music'],
        iosHref: 'https://music.rakuten.co.jp/link/top/',
        androidHref: 'https://music.rakuten.co.jp/link/top/'
    }),
    createKnownApp({
        key: 'soundcloud',
        name: 'SoundCloud',
        category: 'music-streaming',
        iosStoreIds: ['336353151'],
        androidPackages: ['com.soundcloud.android'],
        iosHref: 'https://soundcloud.com/',
        androidHref: 'https://soundcloud.com/'
    }),
    createKnownApp({
        key: 'tidal',
        name: 'TIDAL',
        category: 'music-streaming',
        iosStoreIds: ['913943275'],
        androidPackages: ['com.aspiro.tidal'],
        iosHref: 'https://tidal.com/',
        androidHref: 'https://tidal.com/'
    }),
    createKnownApp({
        key: 'youtube-music',
        name: 'YouTube Music',
        category: 'music-streaming',
        iosStoreIds: ['1017492454'],
        androidPackages: ['com.google.android.apps.youtube.music'],
        iosHref: 'https://music.youtube.com/',
        androidHref: 'https://music.youtube.com/',
        androidVerified: true
    }),
    createKnownApp({
        key: 'evernote',
        name: 'Evernote',
        category: 'notes',
        iosStoreIds: ['281796108'],
        androidPackages: ['com.evernote'],
        iosHref: 'https://www.evernote.com/client/web',
        androidHref: 'https://www.evernote.com/client/web'
    }),
    createKnownApp({
        key: 'flat',
        name: 'Flat',
        category: 'sheet-music',
        iosStoreIds: ['1177592149'],
        androidPackages: ['com.tutteo.flat'],
        iosHref: 'https://flat.io/my-library',
        androidHref: 'https://flat.io/my-library'
    }),
    createKnownApp({
        key: 'discord',
        name: 'Discord',
        category: 'social',
        iosStoreIds: ['985746746'],
        androidPackages: ['com.discord'],
        iosHref: 'https://discord.com/app',
        androidHref: 'https://discord.com/app'
    }),
    createKnownApp({
        key: 'instagram',
        name: 'Instagram',
        category: 'social',
        iosStoreIds: ['389801252'],
        androidPackages: ['com.instagram.android'],
        iosHref: 'https://www.instagram.com/',
        androidHref: 'https://www.instagram.com/'
    }),
    createKnownApp({
        key: 'messenger',
        name: 'Messenger',
        category: 'social',
        iosStoreIds: ['454638411'],
        androidPackages: ['com.facebook.orca'],
        iosHref: 'https://m.me/',
        androidHref: 'https://m.me/'
    }),
    createKnownApp({
        key: 'slack',
        name: 'Slack',
        category: 'social',
        iosStoreIds: ['618783545'],
        androidPackages: ['com.Slack'],
        iosHref: 'https://app.slack.com/app/open',
        androidHref: 'https://app.slack.com/app/open'
    }),
    createKnownApp({
        key: 'threads',
        name: 'Threads',
        category: 'social',
        iosStoreIds: ['6446901002'],
        androidPackages: ['com.instagram.barcelona'],
        iosHref: 'https://www.threads.com/',
        androidHref: 'https://www.threads.com/'
    }),
    createKnownApp({
        key: 'tiktok',
        name: 'TikTok',
        category: 'social',
        iosStoreIds: ['1235601864', '835599320'],
        androidPackages: ['com.zhiliaoapp.musically'],
        iosHref: 'https://www.tiktok.com/',
        androidHref: 'https://www.tiktok.com/'
    }),
    createKnownApp({
        key: 'x-twitter',
        name: 'X',
        category: 'social',
        iosStoreIds: ['333903271'],
        androidPackages: ['com.twitter.android'],
        iosHref: 'https://x.com/',
        androidHref: 'https://x.com/',
        androidVerified: true
    }),
    createKnownApp({
        key: 'moises',
        name: 'Moises',
        category: 'transcription',
        iosStoreIds: ['1515796612'],
        androidPackages: ['ai.moises'],
        iosHref: 'https://app.moises.ai/',
        androidHref: 'https://app.moises.ai/'
    })
]);

const KNOWN_APPS_BY_KEY = new Map(MY_APPS_KNOWN_APPS.map((app) => [app.key, app]));
const KNOWN_APPS_BY_IOS_ID = new Map(
    MY_APPS_KNOWN_APPS.flatMap((app) => app.match.iosStoreIds.map((id) => [id, app]))
);
const KNOWN_APPS_BY_ANDROID_PACKAGE = new Map(
    MY_APPS_KNOWN_APPS.flatMap((app) => app.match.androidPackages.map((packageName) => [packageName, app]))
);

export function getKnownApp(appKey) {
    return typeof appKey === 'string' ? KNOWN_APPS_BY_KEY.get(appKey) || null : null;
}

export function findKnownAppByIosStoreId(storeId) {
    return typeof storeId === 'string' ? KNOWN_APPS_BY_IOS_ID.get(storeId) || null : null;
}

export function findKnownAppByAndroidPackage(packageName) {
    return typeof packageName === 'string'
        ? KNOWN_APPS_BY_ANDROID_PACKAGE.get(packageName) || null
        : null;
}

function parseHttpsUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        return url;
    } catch (_) {
        return null;
    }
}

export function parseIosAppStoreId(value) {
    const url = parseHttpsUrl(value);
    if (!url || url.hostname !== 'apps.apple.com') return null;
    const match = url.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?app\/(?:[^/]+\/)?id(\d{6,20})\/?$/i);
    return match?.[1] || null;
}

export function parseAndroidPlayPackage(value) {
    const url = parseHttpsUrl(value);
    if (!url || url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details') return null;
    const packageValues = url.searchParams.getAll('id');
    if (packageValues.length !== 1) return null;
    const packageName = packageValues[0];
    return /^[A-Za-z][A-Za-z\d_]*(?:\.[A-Za-z][A-Za-z\d_]*)+$/.test(packageName)
        ? packageName
        : null;
}

export function recognizeStoreUrl(value) {
    const iosStoreId = parseIosAppStoreId(value);
    if (iosStoreId) return { platform: 'ios', identifier: iosStoreId };
    const androidPackage = parseAndroidPlayPackage(value);
    if (androidPackage) return { platform: 'android', identifier: androidPackage };
    return null;
}

export function recognizeKnownAppUrl(value) {
    const store = recognizeStoreUrl(value);
    if (!store) return null;
    const app = store.platform === 'ios'
        ? findKnownAppByIosStoreId(store.identifier)
        : findKnownAppByAndroidPackage(store.identifier);
    return app ? { ...store, app } : null;
}

export function resolveKnownAppTarget(appKey, platform) {
    const app = getKnownApp(appKey);
    if (!app || !Object.hasOwn(app.launch, platform)) return null;
    return app.launch[platform]?.href || null;
}

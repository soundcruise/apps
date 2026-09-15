(function installSoundCruiseProductionSyncConfig(global) {
  'use strict';

  // General production release. Worker admission and runtime control remain
  // authoritative, and Standard editions do not load this configuration.
  const config = Object.freeze({
    enabled: true,
    environment: 'production',
    endpoint: 'https://sound-cruise-sync.cruise-port-requests.workers.dev',
    portUrl: '/apps/cruise-port/#sync-center'
  });

  global.__SOUND_CRUISE_SYNC_CENTER__ = config;
  global.__SOUND_CRUISE_MULTI_APP_SYNC__ = config;
})(globalThis);

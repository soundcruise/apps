import { ACCOUNT_API_APP_IDS } from './account-validation.js';

export const ACCOUNT_ADMISSION_PROVENANCE = Object.freeze({
  QA: 'qa',
  PRODUCTION: 'production'
});

export function productionAccountAppIds(env = {}) {
  if (typeof env.SYNC_ACCOUNT_PUBLIC_APP_IDS !== 'string') return null;
  const values = env.SYNC_ACCOUNT_PUBLIC_APP_IDS.split(',').map((value) => value.trim());
  const dataPlaneIds = new Set([...ACCOUNT_API_APP_IDS, 'port']);
  if (!values.length || values.some((value) => !dataPlaneIds.has(value)) ||
      new Set(values).size !== values.length) return null;
  return new Set(values);
}

export function publicAccountAdmissionEnabled(env, control) {
  return env?.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED === 'true' &&
    control?.rolloutMode === 'open' && productionAccountAppIds(env) !== null;
}

export function publicAccountAppAllowed(env, appId) {
  return env?.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED === 'true' &&
    productionAccountAppIds(env)?.has(appId) === true;
}

export function productionAccountAppAllowed(env, appId) {
  return productionAccountAppIds(env)?.has(appId) === true;
}

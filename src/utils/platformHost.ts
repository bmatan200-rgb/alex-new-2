export const PLATFORM_DOMAIN = 'mbtorim.co.il';
export const isPlatformRoot = (host: string) => host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}`;
export const isPlatformHost = (host: string) => isPlatformRoot(host) || host.endsWith(`.${PLATFORM_DOMAIN}`);

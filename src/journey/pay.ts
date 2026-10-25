// Paying for a ride: Wayli sells nothing, so it points to HopOn (Rav-Pass), an official payment app licensed by the
// Ministry of Transport. The link goes to its store page (an app opened straight from a web page is not reliable
// across phones; the store offers "Open" when it is installed). Listings checked 2026-10-25:
// https://play.google.com/store/apps/details?id=co.hopon.client and https://apps.apple.com/il/app/id807807458
const ANDROID = 'https://play.google.com/store/apps/details?id=co.hopon.client';
const IOS = 'https://apps.apple.com/il/app/id807807458';

export const payLink = (): string => (/iPhone|iPad|iPod/.test(navigator.userAgent) ? IOS : ANDROID);

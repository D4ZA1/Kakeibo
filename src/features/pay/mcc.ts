/** Merchant category code → our category id. Extend as real codes show up; '0000' is a personal QR. */
// prettier-ignore
export const MCC_TO_CATEGORY: Record<string, string> = {
  '5411': 'food', '5499': 'food', '5812': 'food', '5813': 'food', '5814': 'food',
  '5045': 'tech', '5732': 'tech', '5734': 'tech', '5815': 'entertain', '5816': 'entertain',
  '4111': 'travel', '4121': 'travel', '4131': 'travel', '4511': 'travel', '5541': 'travel', '5542': 'travel', '7011': 'travel',
  '5912': 'health', '8011': 'health', '8021': 'health', '8062': 'health', '8099': 'health',
  '5611': 'clothes', '5621': 'clothes', '5651': 'clothes', '5661': 'clothes', '5691': 'clothes', '5699': 'clothes',
  '4814': 'services', '4899': 'services', '4900': 'services', '7230': 'services', '7299': 'services',
  '7832': 'entertain', '7922': 'entertain', '7996': 'entertain',
  '8211': 'education', '8220': 'education', '8299': 'education',
  '8398': 'charity',
  '5200': 'home', '5251': 'home', '5712': 'home', '5722': 'home',
};

/**
 * Merchant QRs go to the UPI app as a `upi://pay` intent. Personal payees don't: Google Pay, PhonePe
 * and Paytm refuse intents to personal VPAs from other apps, but accept the same link shared as a
 * QR image (shareQrImage). Spike results: docs/upi-native-module.md.
 */
export const isMerchantCode = (mc?: string) => Boolean(mc) && mc !== '0000';

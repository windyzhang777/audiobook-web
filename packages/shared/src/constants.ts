export const PAGE_SIZE = 50;

export const ONE_MINUTE = 60 * 1000;
export const FIVE_MINUTES = 60 * 1000;
export const ONE_HOUR = 60 * 60 * 1000;
export const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Maps franc 3-letter ISO 639-3 code (e.g., 'cmn', 'eng') to 2-letter BCP 47 codes + region (e.g., 'en-US', 'zh-CN')
 */
export const localeByLang: Record<string, string> = {
  cmn: 'zh-CN', // Mandarin -> Chinese (Simplified)
  eng: 'en-US', // English -> English (US)
  fra: 'fr-FR', // French -> French (France)
  default: 'en-US', // Fallback
};

/**
 * Maps 2-letter BCP 47 codes + region (e.g., 'en-US', 'zh-CN') to Google Cloud Voice name  (e.g., 'en-US-Neural2-F')
 * All selected are WaveNet/Neural2 (1M chars free/month).
 */
export const voiceByLocale: Record<string, string> = {
  'zh-CN': 'zh-CN-Wavenet-A',
  'en-US': 'en-US-Neural2-F',
  'fr-FR': 'fr-FR-Wavenet-C',
  'es-ES': 'es-ES-Neural2-C',
  default: 'en-US-Neural2-F', // Fallback
};

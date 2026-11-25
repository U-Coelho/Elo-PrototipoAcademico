const DEFAULT_IMAGE = 'assets/campaign-4.svg';
const PRESET_IMAGE = /^assets\/campaign-[1-6]\.svg$/;
const STORED_IMAGE = /^\/api\/project-images\/[a-zA-Z0-9_-]+\?v=\d+$/;

export const isStoredProjectImage = value => typeof value === 'string' && STORED_IMAGE.test(value);
export const projectImage = value =>
  typeof value === 'string' && (PRESET_IMAGE.test(value) || isStoredProjectImage(value)) ? value : DEFAULT_IMAGE;

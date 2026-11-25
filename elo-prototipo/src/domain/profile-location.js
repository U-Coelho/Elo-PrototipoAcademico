export const BRAZIL_STATES = Object.freeze([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);

export function validProfileLocation(location) {
  return location?.countryCode === 'BR' && BRAZIL_STATES.includes(location.region)
    && typeof location.city === 'string' && location.city.length <= 100
    && location.city === location.city.trim() && /^[\p{L}][\p{L}\p{M} .’'-]*$/u.test(location.city);
}

export function formatProfileLocation(location) {
  return validProfileLocation(location) ? `${location.city}, ${location.region}` : '';
}

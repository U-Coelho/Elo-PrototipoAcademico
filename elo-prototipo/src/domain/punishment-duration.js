const periods={'1h':3600000,'1d':86400000,'7d':604800000,'30d':2592000000};
export function punishmentExpiry(duration,customUntil,now=Date.now()) {
  if(duration==='indefinite')return null;
  const expires=duration==='custom'?new Date(customUntil).getTime():Object.hasOwn(periods,duration)?Number(now)+periods[duration]:NaN;
  if(!Number.isFinite(expires)||expires<=Number(now))throw new Error('Selecione um prazo válido no futuro.');
  return new Date(expires).toISOString();
}

/** Read-only presentation of confirmed receipts returned by the API.
 * Never derives a history from a campaign total, opening balance or payout.
 * Authorization and financial writes remain responsibilities of the backend.
 */
export function buildRevenueReport({
  ledger = [], contributions = [], campaigns = [], creatorId,
  campaignId = null, days = 7, now = new Date(), timeZone = 'America/Sao_Paulo',
} = {}) {
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  if (![7, 30].includes(days)) fail('INVALID_REPORT_DAYS', 'Escolha um período de 7 ou 30 dias.');
  if (typeof creatorId !== 'string' || !creatorId.trim() || creatorId.length > 160) fail('INVALID_REPORT_CREATOR', 'Informe a personagem criadora do relatório.');
  if (![ledger, contributions, campaigns].every(Array.isArray)) fail('INVALID_REPORT_DATA', 'Os dados de arrecadação estão incompletos.');
  const instant = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(instant.getTime())) fail('INVALID_REPORT_DATE', 'A data do relatório é inválida.');
  let dateFormatter;
  try {
    if (typeof timeZone !== 'string' || !timeZone) throw new Error();
    dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { fail('INVALID_REPORT_TIME_ZONE', 'O fuso horário do relatório é inválido.'); }
  const dateKey = date => {
    const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  };
  const endDate = dateKey(instant);
  // Iterate calendar dates in UTC, not 24-hour intervals in the chosen timezone.
  // This preserves 7/30 day buckets even across daylight-saving transitions.
  const calendarDay = new Date(`${endDate}T12:00:00.000Z`);
  calendarDay.setUTCDate(calendarDay.getUTCDate() - days + 1);
  const points = Array.from({ length: days }, () => {
    const date = calendarDay.toISOString().slice(0, 10);
    calendarDay.setUTCDate(calendarDay.getUTCDate() + 1);
    return { date, label: `${date.slice(8, 10)}/${date.slice(5, 7)}`, amountCents: 0, count: 0 };
  });
  const startDate = points[0].date;
  const ownedCampaigns = new Map(campaigns.filter(c => c && typeof c.id === 'string' && c.creatorId === creatorId).map(c => [c.id, c]));
  // After content retention expires, authorized receipts still provide the
  // financial reference. Never reconstruct an amount from campaign totals.
  for(const c of contributions)if(c?.creatorId===creatorId&&c.status==='confirmed'&&typeof c.campaignId==='string'&&!ownedCampaigns.has(c.campaignId))
    ownedCampaigns.set(c.campaignId,{id:c.campaignId,creatorId,title:c.campaignTitle||'Projeto removido'});
  if (campaignId !== null && campaignId !== undefined && (typeof campaignId !== 'string' || !ownedCampaigns.has(campaignId))) {
    fail('INVALID_REPORT_CAMPAIGN', 'Selecione um projeto desta personagem criadora.');
  }
  const confirmed = new Map(contributions.filter(c => c && typeof c.id === 'string' && c.status === 'confirmed' && c.creatorId === creatorId).map(c => [c.id, c]));
  const validAmount = value => Number.isSafeInteger(value) && value > 0;
  const candidates = [];
  for (const entry of ledger) {
    if (!entry || entry.ownerId !== creatorId || !validAmount(entry.amountCents)) continue;
    const refund=entry.type==='refund' && entry.direction==='out';
    if (!refund && (entry.type!=='contribution' || entry.direction!=='in')) continue;
    const contribution = confirmed.get(entry.contributionId);
    const campaign = ownedCampaigns.get(entry.campaignId);
    if (!contribution || !campaign || contribution.campaignId !== entry.campaignId || contribution.amountCents !== entry.amountCents) continue;
    if (refund && (contribution.refundStatus!=='completed' || !entry.refundId || entry.refundId!==contribution.refundId)) continue;
    if (campaignId != null && entry.campaignId !== campaignId) continue;
    if (typeof entry.createdAt !== 'string') continue;
    const created = new Date(entry.createdAt);
    if (!Number.isFinite(created.getTime()) || created.getTime() > instant.getTime()) continue;
    candidates.push({
      id: typeof entry.id === 'string' ? entry.id : contribution.id,
      contributionId: contribution.id, campaignId: campaign.id,
      campaignTitle: typeof campaign.title === 'string' ? campaign.title : contribution.campaignTitle || 'Projeto',
      description: typeof entry.description === 'string' ? entry.description : 'Apoio recebido',
      amountCents: entry.amountCents, createdAt: created.toISOString(), date: dateKey(created),
      direction: entry.direction, type: entry.type,
    });
  }
  candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const seen = new Set();
  const entries = [];
  const buckets = new Map(points.map(p => [p.date, p]));
  const safeAdd = (a, b) => { const total = a + b; if (!Number.isSafeInteger(total)) fail('REPORT_AMOUNT_OVERFLOW', 'O total do período excede o limite de precisão do relatório.'); return total; };
  let totalCents = 0, refundedCents = 0, refundCount = 0;
  for (const entry of candidates) {
    // Deduplicate before date filtering: retries must not move an old receipt
    // into a later reporting period. All candidates already belong to creatorId.
    const key=`${entry.type}:${entry.contributionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = buckets.get(entry.date);
    if (!bucket) continue;
    if (entry.type==='refund') {
      refundedCents=safeAdd(refundedCents,entry.amountCents);refundCount++;
      continue;
    }
    bucket.amountCents = safeAdd(bucket.amountCents, entry.amountCents);
    bucket.count += 1;
    totalCents = safeAdd(totalCents, entry.amountCents);
    entries.push(entry);
  }
  entries.reverse();
  return { days, timeZone, startDate, endDate, points, totalCents, refundedCents, netCents:totalCents-refundedCents, refundCount,
    paymentCount: entries.length, hasData: entries.length > 0, entries };
}

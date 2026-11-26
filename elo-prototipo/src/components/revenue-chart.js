const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const currency = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const axisCurrency = cents => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
  notation: cents >= 100_000 ? 'compact' : 'standard',
  maximumFractionDigits: cents >= 10_000 ? 0 : 2,
}).format(cents / 100);
const fullDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('/') : String(date || '');
const identifier = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '-') || 'revenue-chart';

function maximumFor(maximum) {
  const amount = Math.max(100, maximum);
  const target = amount / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const unit = target / magnitude;
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * magnitude;
  return Math.ceil(amount / step) * step;
}

function tableMarkup(points) {
  return `<details class="revenue-chart__data"><summary>Consultar valores por dia</summary><div class="revenue-chart__table-wrap" tabindex="0" role="region" aria-label="Valores diários da arrecadação"><table><caption class="sr-only">Arrecadação confirmada por dia no período selecionado</caption><thead><tr><th scope="col">Dia</th><th scope="col">Pagamentos</th><th scope="col">Arrecadação</th></tr></thead><tbody>${points.map(point => `<tr data-chart-table-index="${point.index}"><th scope="row">${escapeHtml(fullDate(point.date))}</th><td>${point.count}</td><td>${escapeHtml(currency(point.amountCents))}</td></tr>`).join('')}</tbody></table></div></details>`;
}

export function renderRevenueChart(report, { id = 'revenue-chart' } = {}) {
  const name = identifier(id);
  const points = (report?.points || []).map((point, index) => ({
    index, date: String(point.date || ''), label: String(point.label || ''),
    amountCents: Number.isSafeInteger(point.amountCents) && point.amountCents >= 0 ? point.amountCents : 0,
    count: Number.isSafeInteger(point.count) && point.count >= 0 ? point.count : 0,
  }));
  const hasData = Boolean(report?.hasData && points.some(point => point.amountCents > 0));
  const table = tableMarkup(points);
  if (!hasData) {
    return `<div class="revenue-chart revenue-chart--empty" data-revenue-chart data-point-count="0"><div class="revenue-chart__empty" role="status"><svg aria-hidden="true" viewBox="0 0 40 40"><path d="M6 8v24h28M12 25l7-8 6 4 9-12"/><circle cx="19" cy="17" r="2"/><circle cx="25" cy="21" r="2"/></svg><strong>Nenhum apoio confirmado neste período</strong><p>Os valores aparecem após a confirmação de um apoio.</p></div>${table}</div>`;
  }

  const width = 960, height = 260, top = 16, baseline = 242, plotHeight = baseline - top;
  const maxY = maximumFor(Math.max(...points.map(point => point.amountCents)));
  const x = index => points.length === 1 ? width / 2 : index * width / (points.length - 1);
  const y = cents => baseline - cents / maxY * plotHeight;
  const coordinates = points.map(point => `${x(point.index).toFixed(2)},${y(point.amountCents).toFixed(2)}`);
  const line = coordinates.map((coordinate, index) => `${index ? 'L' : 'M'}${coordinate}`).join(' ');
  const area = `M${x(0).toFixed(2)},${baseline} ${coordinates.map(coordinate => `L${coordinate}`).join(' ')} L${x(points.length - 1).toFixed(2)},${baseline} Z`;
  const ticks = Array.from({ length: 5 }, (_, index) => ({ value: maxY * (4 - index) / 4, y: y(maxY * (4 - index) / 4) }));
  const labelIndexes = [...new Set([0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1])];
  const selectionId = `${name}-selection`, instructionsId = `${name}-instructions`;
  return `<div class="revenue-chart" data-revenue-chart data-point-count="${points.length}" tabindex="0" role="group" aria-label="Gráfico de arrecadação diária em reais" aria-describedby="${instructionsId} ${selectionId}">
    <div class="revenue-chart__visual">
      <div class="revenue-chart__y-axis" aria-hidden="true">${ticks.map(tick => `<span style="top:${(tick.y / height * 100).toFixed(3)}%" title="${escapeHtml(currency(Math.round(tick.value)))}">${escapeHtml(axisCurrency(Math.round(tick.value)))}</span>`).join('')}</div>
      <div class="revenue-chart__plot" data-chart-plot>
        <svg class="revenue-chart__svg" aria-hidden="true" focusable="false" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <g class="revenue-chart__grid">${ticks.map(tick => `<line x1="0" y1="${tick.y.toFixed(2)}" x2="${width}" y2="${tick.y.toFixed(2)}"/>`).join('')}</g>
          <path class="revenue-chart__area" d="${area}"/>
          <path class="revenue-chart__line" d="${line}"/>
          <g class="revenue-chart__points">${points.map(point => {
            const countLabel = `${point.count} pagamento${point.count === 1 ? '' : 's'} confirmado${point.count === 1 ? '' : 's'}`;
            const tooltip = `${fullDate(point.date)} · ${currency(point.amountCents)} · ${countLabel}`;
            return `<circle class="revenue-chart__point" data-chart-index="${point.index}" data-tooltip="${escapeHtml(tooltip)}" data-date="${escapeHtml(point.date)}" data-amount-cents="${point.amountCents}" cx="${x(point.index).toFixed(2)}" cy="${y(point.amountCents).toFixed(2)}" r="4.5"><title>${escapeHtml(tooltip)}</title></circle>`;
          }).join('')}</g>
        </svg>
      </div>
      <div class="revenue-chart__x-axis" aria-hidden="true">${labelIndexes.map((index, position) => `<span class="${position === 0 ? 'is-first' : position === labelIndexes.length - 1 ? 'is-last' : ''}" style="left:${(index / Math.max(1, points.length - 1) * 100).toFixed(3)}%">${escapeHtml(points[index].label)}</span>`).join('')}</div>
    </div>
    <div class="revenue-chart__tooltip" data-chart-tooltip role="tooltip" aria-hidden="true" hidden></div>
    <div class="revenue-chart__support"><p id="${instructionsId}" class="revenue-chart__instructions">Passe sobre os pontos ou use as setas do teclado para consultar um dia.</p><p id="${selectionId}" class="revenue-chart__selection" data-chart-selection aria-live="polite" aria-atomic="true">Selecione um dia para ver o valor confirmado.</p></div>
    ${table}
  </div>`;
}

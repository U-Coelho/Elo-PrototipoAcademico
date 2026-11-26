const MAX_AMOUNT_CENTS = 100_000_000;
const plainText = (value, min, max) => typeof value === 'string'
  && value.trim().length >= min && value.trim().length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  && !/<\/?[a-z][^>]*>/i.test(value);

function invalid() {
  const error = new Error('Informe até 10 metas adicionais, com títulos de 3 a 100 caracteres, descrições de até 600 caracteres e valores únicos acima da meta principal, sem HTML.');
  error.code = 'INVALID_MILESTONES';
  throw error;
}

export function normalizeMilestones(value = [], goalCents) {
  if (!Array.isArray(value) || value.length > 10) invalid();
  const amounts = new Set();
  const milestones = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid();
    const description = item.description === undefined ? '' : item.description;
    const amountCents = item.amountCents;
    if (!plainText(item.title, 3, 100) || !plainText(description, 0, 600)
      || !Number.isSafeInteger(goalCents) || goalCents <= 0
      || !Number.isSafeInteger(amountCents) || amountCents <= goalCents
      || amountCents > MAX_AMOUNT_CENTS || amounts.has(amountCents)) invalid();
    amounts.add(amountCents);
    milestones.push({ id: `milestone-${amountCents}`, title: item.title.trim(), description: description.trim(), amountCents });
  }
  return milestones.sort((first, second) => first.amountCents - second.amountCents);
}

export function validMilestones(value, goalCents) {
  if (!Array.isArray(value)) return false;
  try {
    return normalizeMilestones(value, goalCents).every((item, index) => {
      const original = value[index];
      return original.id === item.id && original.title === item.title
        && original.description === item.description && original.amountCents === item.amountCents;
    });
  } catch { return false; }
}

import type { SanctionKind } from '@api';

/** BR-37 / BR-42: disciplinary measures, mildest first. */
export const SANCTION_META: Record<SanctionKind, { label: string; icon: string }> = {
  notice: { label: 'Upozorenje', icon: '⚠️' },
  warning: { label: 'Opomena', icon: '🟨' },
  suspension: { label: 'Preskakanje kola', icon: '🟥' },
};

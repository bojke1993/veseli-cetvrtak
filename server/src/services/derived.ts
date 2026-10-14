import type { DB } from '../db/kysely.js';
import type { DerivedProvider } from '../deps.js';
import { computeDerived } from '../domain/derived.js';
import type { DerivedRoundInput, DerivedState } from '../domain/derived-types.js';

export async function loadDerivedInputs(db: DB): Promise<DerivedRoundInput[]> {
  const rounds = await db
    .selectFrom('rounds')
    .select(['id', 'number', 'season_code', 'status', 'source'])
    .orderBy('number')
    .execute();
  const picks = await db
    .selectFrom('picks')
    .select(['round_id', 'slot', 'kind', 'member_id', 'cooldown_for_member_id', 'result'])
    .orderBy('round_id')
    .orderBy('slot')
    .execute();
  const byRound = new Map<number, DerivedRoundInput['picks']>();
  for (const p of picks) {
    const list = byRound.get(p.round_id) ?? [];
    list.push({
      slot: p.slot,
      kind: p.kind,
      memberId: p.member_id,
      cooldownForMemberId: p.cooldown_for_member_id,
      result: p.result,
    });
    byRound.set(p.round_id, list);
  }
  return rounds.map((r) => ({
    roundId: r.id,
    number: r.number,
    seasonCode: r.season_code,
    status: r.status,
    source: r.source,
    picks: byRound.get(r.id) ?? [],
  }));
}

/** Memoized computeDerived() over the whole history; invalidate() after any round/pick change. */
export class DerivedService implements DerivedProvider {
  private cached: Promise<DerivedState> | null = null;

  constructor(private readonly db: DB) {}

  get(): Promise<DerivedState> {
    if (!this.cached) {
      const p = loadDerivedInputs(this.db).then(computeDerived);
      p.catch(() => {
        if (this.cached === p) this.cached = null;
      });
      this.cached = p;
    }
    return this.cached;
  }

  invalidate(): void {
    this.cached = null;
  }
}

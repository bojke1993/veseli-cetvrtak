import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ActualWinRequest,
  AdminTasksResponse,
  AuditResponse,
  BlameResponse,
  ChangePasswordRequest,
  CorrectionRequest,
  CorrectionResponse,
  CreateGameRequest,
  CreatePlayerRequest,
  CreateProposalRequest,
  CreateRoundRequest,
  CurrentRoundResponse,
  GameDaysResponse,
  GamesResponse,
  ImportColumn,
  ImportCommitRequest,
  ImportCommitResponse,
  ImportPreviewResponse,
  LoginRequest,
  ManualResolveRequest,
  MeResponse,
  MemberStatsResponse,
  MembersResponse,
  MembersStatsResponse,
  OverviewResponse,
  PlayerSearchResponse,
  ResetPasswordResponse,
  RoundDetailDto,
  RoundResponse,
  RoundsQuery,
  RoundsResponse,
  SeasonsResponse,
  SetPickRequest,
  StatsQuery,
  SyncRunsResponse,
  UpdateMemberRequest,
  UpdateRoundRequest,
} from '@api';
import { api, qs } from './client';

// ---------- Query keys ----------

export const keys = {
  me: ['me'] as const,
  members: ['members'] as const,
  round: (id: number) => ['round', id] as const,
  currentRound: ['round', 'current'] as const,
  rounds: (q: RoundsQuery) => ['rounds', q] as const,
  gameDays: ['games', 'days'] as const,
  games: (day: string) => ['games', 'day', day] as const,
  playerSearch: (q: string, day?: string, roundId?: number) => ['players', 'search', q, day ?? null, roundId ?? null] as const,
  seasons: ['stats', 'seasons'] as const,
  overview: (q: StatsQuery) => ['stats', 'overview', q] as const,
  membersStats: (q: StatsQuery) => ['stats', 'members', q] as const,
  memberStats: (id: number, q: StatsQuery) => ['stats', 'member', id, q] as const,
  blame: (q: StatsQuery) => ['stats', 'blame', q] as const,
  audit: (q: { roundId?: number; actor?: number | 'system' }) => ['audit', q] as const,
  adminTasks: ['admin', 'tasks'] as const,
  syncRuns: ['admin', 'sync-runs'] as const,
};

// ---------- Queries ----------

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: ({ signal }) => api.get<MeResponse>('/auth/me', signal), staleTime: 60_000 });
}

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: ({ signal }) => api.get<MembersResponse>('/members', signal), staleTime: 60_000 });
}

export function useCurrentRound() {
  return useQuery({ queryKey: keys.currentRound, queryFn: ({ signal }) => api.get<CurrentRoundResponse>('/rounds/current', signal) });
}

export function useRound(id: number | null) {
  return useQuery({
    queryKey: keys.round(id ?? 0),
    queryFn: ({ signal }) => api.get<RoundResponse>(`/rounds/${id}`, signal),
    enabled: id !== null && Number.isFinite(id),
  });
}

export function useRounds(q: RoundsQuery) {
  return useQuery({
    queryKey: keys.rounds(q),
    queryFn: ({ signal }) => api.get<RoundsResponse>(`/rounds${qs(q)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useGameDays(enabled = true) {
  return useQuery({ queryKey: keys.gameDays, queryFn: ({ signal }) => api.get<GameDaysResponse>('/games/days', signal), enabled });
}

export function useGames(day: string | null) {
  return useQuery({
    queryKey: keys.games(day ?? ''),
    queryFn: ({ signal }) => api.get<GamesResponse>(`/games${qs({ day })}`, signal),
    enabled: !!day,
  });
}

export function usePlayerSearch(q: string, day?: string, roundId?: number) {
  const term = q.trim();
  return useQuery({
    queryKey: keys.playerSearch(term, day, roundId),
    queryFn: ({ signal }) => api.get<PlayerSearchResponse>(`/players/search${qs({ q: term, day, roundId })}`, signal),
    enabled: term.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useSeasons() {
  return useQuery({ queryKey: keys.seasons, queryFn: ({ signal }) => api.get<SeasonsResponse>('/stats/seasons', signal), staleTime: 10 * 60_000 });
}

export function useOverview(q: StatsQuery) {
  return useQuery({
    queryKey: keys.overview(q),
    queryFn: ({ signal }) => api.get<OverviewResponse>(`/stats/overview${qs(q)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useMembersStats(q: StatsQuery) {
  return useQuery({
    queryKey: keys.membersStats(q),
    queryFn: ({ signal }) => api.get<MembersStatsResponse>(`/stats/members${qs(q)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useMemberStats(id: number, q: StatsQuery) {
  return useQuery({
    queryKey: keys.memberStats(id, q),
    queryFn: ({ signal }) => api.get<MemberStatsResponse>(`/stats/members/${id}${qs(q)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useBlame(q: StatsQuery) {
  return useQuery({
    queryKey: keys.blame(q),
    queryFn: ({ signal }) => api.get<BlameResponse>(`/stats/blame${qs(q)}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAudit(q: { roundId?: number; actor?: number | 'system' }, enabled = true) {
  return useQuery({
    queryKey: keys.audit(q),
    queryFn: ({ signal }) => api.get<AuditResponse>(`/audit${qs(q)}`, signal),
    enabled,
  });
}

export function useAdminTasks(enabled: boolean) {
  return useQuery({
    queryKey: keys.adminTasks,
    queryFn: ({ signal }) => api.get<AdminTasksResponse>('/admin/tasks', signal),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useSyncRuns(enabled: boolean) {
  return useQuery({
    queryKey: keys.syncRuns,
    queryFn: ({ signal }) => api.get<SyncRunsResponse>('/admin/sync-runs', signal),
    enabled,
  });
}

// ---------- Mutations ----------

/** Refreshes everything that depends on rounds. */
export function invalidateRoundData(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['round'] });
  void qc.invalidateQueries({ queryKey: ['rounds'] });
  void qc.invalidateQueries({ queryKey: ['stats'] });
  void qc.invalidateQueries({ queryKey: ['members'] });
  void qc.invalidateQueries({ queryKey: ['admin'] });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

/** Writes a fresh round detail into every cache entry holding that round. */
export function putRoundInCache(qc: QueryClient, round: RoundDetailDto) {
  qc.setQueryData<RoundResponse>(keys.round(round.id), { round });
  qc.setQueryData<CurrentRoundResponse>(keys.currentRound, (old) => (old && old.round?.id === round.id ? { ...old, round } : old));
}

function hasRound(x: unknown): x is { round: RoundDetailDto } {
  return typeof x === 'object' && x !== null && 'round' in x && typeof (x as { round: unknown }).round === 'object' && (x as { round: unknown }).round !== null;
}

/** Mutation acting on a round: caches a returned round and invalidates dependent data. */
function useRoundMutation<V, R = unknown>(fn: (v: V) => Promise<R>, opts: { invalidate?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (hasRound(data)) putRoundInCache(qc, data.round);
      if (opts.invalidate !== false) invalidateRoundData(qc);
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api.post<unknown>('/auth/login', body),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: keys.adminTasks });
      await qc.refetchQueries({ queryKey: keys.me });
      invalidateRoundData(qc);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>('/auth/logout'),
    onSuccess: () => {
      qc.setQueryData<MeResponse>(keys.me, { me: null });
      qc.removeQueries({ queryKey: ['admin'] });
      qc.removeQueries({ queryKey: ['audit'] });
      invalidateRoundData(qc);
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => api.post<unknown>('/auth/change-password', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useCreateRound() {
  return useRoundMutation((body: CreateRoundRequest) => api.post<RoundResponse>('/rounds', body));
}

export function useUpdateRound(roundId: number) {
  return useRoundMutation((body: UpdateRoundRequest) => api.patch<RoundResponse>(`/rounds/${roundId}`, body));
}

export function useSetPick(roundId: number) {
  return useRoundMutation(({ slot, body }: { slot: number; body: SetPickRequest }) =>
    api.put<RoundResponse>(`/rounds/${roundId}/picks/${slot}`, body),
  );
}

export function useDeletePick(roundId: number) {
  return useRoundMutation((slot: number) => api.del<RoundResponse>(`/rounds/${roundId}/picks/${slot}`));
}

export function useLockRound(roundId: number) {
  return useRoundMutation(() => api.post<RoundResponse>(`/rounds/${roundId}/lock`));
}

export function useUnlockRound(roundId: number) {
  return useRoundMutation((reason: string) => api.post<RoundResponse>(`/rounds/${roundId}/unlock`, { reason }));
}

export function useCorrection(roundId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CorrectionRequest) => api.post<CorrectionResponse>(`/rounds/${roundId}/corrections`, body),
    onSuccess: (data, vars) => {
      if (!vars.dryRun) {
        if (data?.round) putRoundInCache(qc, data.round);
        invalidateRoundData(qc);
      }
    },
  });
}

export function useManualResolve(roundId: number) {
  return useRoundMutation(({ slot, body }: { slot: number; body: ManualResolveRequest }) =>
    api.post<RoundResponse>(`/rounds/${roundId}/picks/${slot}/resolve`, body),
  );
}

export function useActualWin(roundId: number) {
  return useRoundMutation((body: ActualWinRequest) => api.post<RoundResponse>(`/rounds/${roundId}/actual-win`, body));
}

export function useDeleteRound(roundId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmNumber: number) => api.del<unknown>(`/rounds/${roundId}`, { confirmNumber }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.round(roundId) });
      invalidateRoundData(qc);
    },
  });
}

export function useCreateProposal(roundId: number) {
  return useRoundMutation((body: CreateProposalRequest) => api.post<unknown>(`/rounds/${roundId}/proposals`, body));
}

export function useVote() {
  return useRoundMutation(({ proposalId, on }: { proposalId: number; on: boolean }) =>
    on ? api.post<unknown>(`/proposals/${proposalId}/vote`) : api.del<unknown>(`/proposals/${proposalId}/vote`),
  );
}

export function useAcceptProposal() {
  return useRoundMutation((proposalId: number) => api.post<unknown>(`/proposals/${proposalId}/accept`));
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateMemberRequest }) => api.patch<unknown>(`/members/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.members });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: number) => api.post<ResetPasswordResponse>(`/members/${id}/reset-password`),
  });
}

export function useTransferAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<unknown>(`/members/${id}/transfer-admin`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.members });
      void qc.invalidateQueries({ queryKey: keys.me });
      qc.removeQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'sync/players' | 'sync/schedule' | 'recalc') => api.post<unknown>(`/admin/${action}`),
    onSettled: (_d, _e, action) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      if (action === 'recalc') invalidateRoundData(qc);
      else void qc.invalidateQueries({ queryKey: ['games'] });
    },
  });
}

export function useCreatePlayer() {
  return useMutation({ mutationFn: (body: CreatePlayerRequest) => api.post<unknown>('/players', body) });
}

export function useCreateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGameRequest) => api.post<unknown>('/games', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['games'] }),
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping?: Record<ImportColumn, string | null> }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (mapping) fd.append('mapping', JSON.stringify(mapping));
      return api.post<ImportPreviewResponse>('/import/preview', fd);
    },
  });
}

export function useImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportCommitRequest) => api.post<ImportCommitResponse>('/import/commit', body),
    onSuccess: () => invalidateRoundData(qc),
  });
}

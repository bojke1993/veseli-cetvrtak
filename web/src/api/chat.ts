import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ChatMessageDto,
  ChatMessagesResponse,
  ChatPresenceDto,
  ChatStateResponse,
  SendChatMessageResponse,
} from '@api';
import { api, qs } from './client';

/** BR-41 / FR-31: members-only chat. */
export const chatKeys = {
  all: ['chat'] as const,
  messages: ['chat', 'messages'] as const,
  state: ['chat', 'state'] as const,
};

/** Merges messages by id, oldest first (SSE and the send response may deliver the same one). */
export function mergeMessages(a: ChatMessageDto[], b: ChatMessageDto[]): ChatMessageDto[] {
  const byId = new Map<number, ChatMessageDto>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

export function addMessageToCache(qc: QueryClient, message: ChatMessageDto) {
  qc.setQueryData<ChatMessagesResponse>(chatKeys.messages, (old) =>
    old ? { ...old, messages: mergeMessages(old.messages, [message]) } : old,
  );
}

export function removeMessageFromCache(qc: QueryClient, id: number) {
  qc.setQueryData<ChatMessagesResponse>(chatKeys.messages, (old) =>
    old ? { ...old, messages: old.messages.filter((m) => m.id !== id) } : old,
  );
}

export function setPresenceInCache(qc: QueryClient, presence: ChatPresenceDto[]) {
  qc.setQueryData<ChatStateResponse>(chatKeys.state, (old) => (old ? { ...old, presence } : old));
}

export function useChatMessages(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.messages,
    queryFn: ({ signal }) => api.get<ChatMessagesResponse>('/chat/messages', signal),
    enabled,
    // Kept current by the chat stream; refetched after a reconnect.
    staleTime: Infinity,
  });
}

export function useChatState(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.state,
    queryFn: ({ signal }) => api.get<ChatStateResponse>('/chat/state', signal),
    enabled,
    staleTime: 60_000,
  });
}

/** Loads the page before the oldest cached message and prepends it. */
export function useOlderMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (before: number) => api.get<ChatMessagesResponse>(`/chat/messages${qs({ before })}`),
    onSuccess: (page) => {
      qc.setQueryData<ChatMessagesResponse>(chatKeys.messages, (old) =>
        old ? { messages: mergeMessages(page.messages, old.messages), hasMore: page.hasMore } : page,
      );
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<SendChatMessageResponse>('/chat/messages', { body }),
    onSuccess: ({ message }) => {
      addMessageToCache(qc, message);
      qc.setQueryData<ChatStateResponse>(chatKeys.state, (old) =>
        old ? { ...old, unread: 0, readId: Math.max(old.readId, message.id) } : old,
      );
    },
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/chat/messages/${id}`),
    onSuccess: (_data, id) => removeMessageFromCache(qc, id),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<ChatStateResponse>('/chat/read', { id }),
    onSuccess: (state) => qc.setQueryData(chatKeys.state, state),
  });
}

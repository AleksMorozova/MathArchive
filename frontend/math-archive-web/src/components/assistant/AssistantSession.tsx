import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { askAssistant, getAssistantStatus } from '../../api/aiApi';
import { ApiError } from '../../api/apiErrors';
import type { AssistantAnswer } from '../../types/assistant';

export type ChatMessage = { id: number; role: 'student'; text: string } |
  { id: number; role: 'assistant'; answer: AssistantAnswer } | { id: number; role: 'error'; text: string };
export function assistantErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      Disabled: 'AI-помічник тимчасово вимкнений. Навчальні матеріали доступні.',
      AgentDisabled: 'Ця можливість тимчасово вимкнена. Спробуй знайти матеріал.',
      DailyBudget: 'Денний ліміт AI вичерпано. Спробуй завтра або переглянь матеріали.',
      RateLimited: 'Забагато запитів. Зачекай хвилину та спробуй ще раз.',
      TimedOut: 'Помічник не встиг відповісти. Спробуй ще раз трохи пізніше.',
      RequestBudget: 'Не вдалося завершити цей запит. Спробуй запитати про одну задачу або тему.',
      IncompleteResponse: 'Відповідь не вдалося завершити. Спробуй уточнити тему.',
      VerificationFailed: 'Не вдалося надійно перевірити відповідь. Уточни запитання або переглянь матеріали.',
    };
    const category = error.problem?.title;
    if (category && messages[category]) return messages[category];
    if (error.status === 429) return messages.RateLimited;
    if (error.status === 408 || error.status === 504) return messages.TimedOut;
  }
  return 'AI-помічник зараз недоступний. Спробуй пізніше — навчальні матеріали працюють.';
}
function useSession() {
  const status = useQuery({ queryKey: ['assistant', 'status'], queryFn: ({ signal }) => getAssistantStatus(signal), staleTime: 15000, refetchInterval: 30000, retry: false });
  const available = status.isSuccess && !status.isError && status.data.enabled && Date.now() - status.dataUpdatedAt < 45000;
  const [question, setQuestion] = useState('');
  const [grade, setGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const sequence = useRef(0);
  const cancelled = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const answer = useMutation({ mutationFn: async (input: { question: string; grade?: number; topic?: string }) => {
    controller.current = new AbortController(); cancelled.current = false;
    return askAssistant(input.question, input.grade, input.topic, controller.current.signal);
  }, retry: false,
  onSuccess: result => { const id = ++sequence.current; setMessages(previous => [...previous, { id, role: 'assistant', answer: result }]); },
  onError: error => { const id = ++sequence.current; const text = cancelled.current ? 'Запит скасовано. Можеш поставити інше запитання.' : assistantErrorMessage(error); setMessages(previous => [...previous, { id, role: 'error', text }]); },
  onSettled: () => { busy.current = false; } });
  const submit = () => {
    const text = question.trim();
    if (!available || busy.current || answer.isPending || !text || text.length > (status.data?.maxPromptLength ?? 2000)) return;
    busy.current = true;
    const id = ++sequence.current;
    setMessages(previous => [...previous, { id, role: 'student', text }]);
    setQuestion('');
    answer.mutate({ question: text, grade: grade ? Number(grade) : undefined, topic: topic.trim() || undefined });
  };
  const cancel = () => { cancelled.current = true; controller.current?.abort(); };
  return { status, available, question, setQuestion, grade, setGrade, topic, setTopic, messages, submit, cancel, pending: answer.isPending, maxPromptLength: status.data?.maxPromptLength ?? 2000 };
}
const SessionContext = createContext<ReturnType<typeof useSession> | null>(null);
export function AssistantSessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export function useAssistantSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Assistant chat requires AssistantSessionProvider');
  return session;
}

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, X, Loader2, FileText, ListTodo, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/UIComponents';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface AIPanelProps {
  open: boolean;
  onClose: () => void;
  context?: { projectId?: string; findingId?: string };
}

export const AIPanel: React.FC<AIPanelProps> = ({ open, onClose, context }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickResult, setQuickResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, quickResult]);

  const sendChat = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await api.ai.chat(
        [...messages, { role: 'user', content: text }].map((x) => ({ role: x.role, content: x.content })),
        context,
      );
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      toast.error(t('ai_request_failed'));
      setMessages((m) => [...m, { role: 'assistant', content: t('ai_could_not_respond') }]);
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (label: string, fn: () => Promise<{ summary?: string; suggestions?: string; report?: string; analysis?: string }>) => {
    setQuickResult(null);
    setLoading(true);
    try {
      const res = await fn();
      const text = res.summary || res.suggestions || res.report || res.analysis || '';
      setQuickResult(text);
      setMessages((m) => [...m, { role: 'assistant', content: text }]);
    } catch (e) {
      toast.error(t('ai_request_failed'));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[90] w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <span className="font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" /> {t('ai_assistant')}
        </span>
        <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {context?.projectId && (
        <div className="p-3 border-b border-slate-700/50 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => runAction(t('summary'), () => api.ai.projectSummary(context.projectId!))}
          >
            <FileText className="w-3.5 h-3.5 mr-1" /> {t('summary')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => runAction(t('suggest_tasks'), () => api.ai.suggestTasks(context.projectId!))}
          >
            <ListTodo className="w-3.5 h-3.5 mr-1" /> {t('suggest_tasks')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => runAction(t('status_report'), () => api.ai.statusReport(context.projectId!))}
          >
            <FileText className="w-3.5 h-3.5 mr-1" /> {t('status_report')}
          </Button>
        </div>
      )}
      {context?.findingId && (
        <div className="p-3 border-b border-slate-700/50">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => runAction(t('analyze_finding'), () => api.ai.analyzeFinding(context.findingId!))}
          >
            <AlertCircle className="w-3.5 h-3.5 mr-1" /> {t('analyze_finding')}
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !quickResult && (
          <p className="text-slate-500 text-sm">{t('ask_anything_or_use_quick_action_above')}</p>
        )}
        {quickResult && messages.length === 0 && (
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 text-sm whitespace-pre-wrap">
            {quickResult}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-cyan-500/10 border border-cyan-500/20 ml-4' : 'bg-slate-800/50 border border-slate-700 mr-4'}`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('thinking_dots')}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-700 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
          placeholder={t('ask_ai')}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <Button size="sm" onClick={sendChat} disabled={loading}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

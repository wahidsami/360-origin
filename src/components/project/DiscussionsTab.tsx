import React, { useState, useRef, useEffect } from 'react';
import { Discussion, DiscussionReply } from '@/types';
import { Button } from '../ui/UIComponents';
import { io, Socket } from 'socket.io-client';
import {
    MessageSquare, Plus, Send, Trash2, ChevronRight, ChevronDown, X,
    Smile, Hash,
    Type, AtSign, Video, Mic, Slash, Paperclip, Download as DownloadIcon
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useAppDialog } from '@/contexts/DialogContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { api } from '@/services/api';
/* ──────────────────────────────────────────────────────────────
   Types
────────────────────────────────────────────────────────────────*/
interface DiscussionsTabProps {
    projectId: string;
    discussions: Discussion[];
    onCreateThread: (title: string, body: string, clientRequestId?: string) => Promise<Discussion | undefined>;
    onDeleteThread: (discussionId: string) => Promise<void>;
    onGetReplies: (discussionId: string) => Promise<DiscussionReply[]>;
    onCreateReply: (discussionId: string, body: string, clientRequestId?: string) => Promise<DiscussionReply | undefined>;
    onDeleteReply: (discussionId: string, replyId: string) => Promise<void>;
    canCreate?: boolean;
}

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────────*/
const AVATAR_COLORS = [
    'from-cyan-500 to-blue-600',
    'from-purple-500 to-pink-600',
    'from-[hsl(var(--brand-success))] to-teal-600',
    'from-orange-500 to-red-600',
    'from-[hsl(var(--brand-warning))] to-[hsl(var(--brand-warning))]',
    'from-indigo-500 to-violet-600',
];

function avatarColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function friendlyDate(iso: string) {
    const d = new Date(iso);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
    return format(d, 'MMM d, h:mm a');
}

function dayLabel(iso: string) {
    const d = new Date(iso);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEEE, MMMM d');
}

const DISCUSSION_WS_URL = import.meta.env.VITE_API_URL || '';

function createTempId(prefix: 'discussion' | 'reply') {
    return `temp-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createClientRequestId(prefix: 'discussion' | 'reply') {
    return `client-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortThreads(items: Discussion[]) {
    return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function sortReplies(items: DiscussionReply[]) {
    return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function mergeThreads(remote: Discussion[], local: Discussion[]) {
    const merged = [...remote];
    for (const item of local) {
        const isTransient = item.syncState === 'pending' || item.syncState === 'failed';
        if (!isTransient) continue;
        const hasRemoteMatch = merged.some((remoteItem) =>
            remoteItem.id === item.id ||
            (item.clientRequestId && remoteItem.clientRequestId === item.clientRequestId)
        );
        if (!hasRemoteMatch) {
            merged.push(item);
        }
    }
    return sortThreads(merged);
}

function mergeReplies(remote: DiscussionReply[], local: DiscussionReply[]) {
    const merged = [...remote];
    for (const item of local) {
        const isTransient = item.syncState === 'pending' || item.syncState === 'failed';
        if (!isTransient) continue;
        const hasRemoteMatch = merged.some((remoteItem) =>
            remoteItem.id === item.id ||
            (item.clientRequestId && remoteItem.clientRequestId === item.clientRequestId)
        );
        if (!hasRemoteMatch) {
            merged.push(item);
        }
    }
    return sortReplies(merged);
}

/* ──────────────────────────────────────────────────────────────
   Sub-components
────────────────────────────────────────────────────────────────*/
const Avatar: React.FC<{ name: string; avatar?: string; size?: 'xs' | 'sm' | 'md' | 'lg' }> = ({ name, avatar, size = 'md' }) => {
    const sz = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-10 h-10 text-sm' }[size];
    if (avatar) return <img src={avatar} alt={name} className={`${sz} rounded-lg object-cover flex-shrink-0`} />;
    return (
        <div className={`${sz} rounded-lg bg-gradient-to-br ${avatarColor(name)} flex items-center justify-center font-bold text-white flex-shrink-0`}>
            {initials(name)}
        </div>
    );
};

/** The floating action bar that appears on message hover */
const HoverActions: React.FC<{
    onReply?: () => void;
    onDelete?: () => void;
    showDelete: boolean;
}> = ({ onReply, onDelete, showDelete }) => {
    const { t } = useTranslation();
    return (
    <div className="absolute -top-3 right-3 hidden group-hover:flex items-center gap-0.5 bg-slate-800 border border-slate-700 rounded-lg px-1 py-0.5 shadow-xl z-10">
        {onReply && <ActionBtn title={t('reply_in_thread')} onClick={onReply}><MessageSquare className="w-3.5 h-3.5" /></ActionBtn>}
        {showDelete && <ActionBtn title={t('delete_btn')} onClick={onDelete} danger><Trash2 className="w-3.5 h-3.5" /></ActionBtn>}
    </div>
    );
};

const ActionBtn: React.FC<{ title: string; onClick?: () => void; danger?: boolean; children: React.ReactNode }> = ({ title, onClick, danger, children }) => (
    <button
        title={title}
        onClick={onClick}
        className={`p-1 rounded transition-colors ${danger ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-900/30' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
    >
        {children}
    </button>
);

/** Reply count badge like Slack */
const ReplyBadge: React.FC<{ discussion: Discussion; onClick: () => void }> = ({ discussion, onClick }) => {
    const { t } = useTranslation();
    if (discussion.replyCount === 0) return null;
    // Generate a mini stack of "reply avatars"  — fake 2-3 colored dots for visual effect
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 mt-1 ml-0.5 group/rep hover:bg-slate-800/60 px-2 py-1 rounded-lg transition-colors"
        >
            {/* Mini avatar stack */}
            <div className="flex -space-x-1">
                {[...Array(Math.min(discussion.replyCount, 3))].map((_, i) => (
                    <div key={i} className={`w-5 h-5 rounded-full bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} border border-slate-900`} />
                ))}
            </div>
            <span className="text-cyan-400 text-xs font-semibold group-hover/rep:underline">
                {discussion.replyCount === 1 ? t('reply_count_one') : t('reply_count_other', { count: discussion.replyCount })}
            </span>
            {discussion.lastReplyAt && (
                <span className="text-slate-500 text-xs">
                    {t('last_reply')} {formatDistanceToNow(new Date(discussion.lastReplyAt), { addSuffix: true })}
                </span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover/rep:opacity-100 transition-opacity" />
        </button>
    );
};

const SyncStateNotice: React.FC<{ state?: 'pending' | 'failed'; errorMessage?: string; onRetry?: () => void }> = ({ state, errorMessage, onRetry }) => {
    if (!state) return null;
    if (state === 'pending') {
        return <span className="text-[11px] text-[hsl(var(--brand-warning))] font-medium">Sending…</span>;
    }
    return (
        <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-rose-400 font-medium">{errorMessage || 'Failed to send'}</span>
            {onRetry ? (
                <button type="button" onClick={onRetry} className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300">
                    Retry
                </button>
            ) : null}
        </div>
    );
};

/* ── Emoji Picker ───────────────────────────────────────────── */
const EMOJIS = [
    '😀', '😂', '😍', '🥰', '😎', '🤔', '😅', '🙌', '👍', '👎',
    '❤️', '🔥', '✅', '🎉', '💡', '⚠️', '🚀', '👀', '🙏', '💪',
    '😊', '😭', '🤣', '😤', '😱', '🤝', '👋', '💯', '🎯', '📌',
    '📎', '🗂️', '💬', '📢', '🔔', '🔕', '✏️', '📝', '🗒️', '📅',
    '⏰', '🕐', '🌟', '💥', '🛠️', '🔍', '📊', '📈', '📉', '🏆',
    '🎖️', '🔒', '🔓', '🌐', '📡', '💻', '🖥️', '📱', '⌨️', '🖱️',
];

const EmojiPicker: React.FC<{ onPick: (e: string) => void; onClose: () => void }> = ({ onPick, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);
    return (
        <div ref={ref} className="absolute bottom-full mb-2 left-0 z-50 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl w-64">
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-2">Emoji</p>
            <div className="grid grid-cols-10 gap-0.5">
                {EMOJIS.map(em => (
                    <button key={em} onClick={() => { onPick(em); onClose(); }}
                        className="w-6 h-6 flex items-center justify-center text-base hover:bg-slate-700 rounded transition-colors"
                    >{em}</button>
                ))}
            </div>
        </div>
    );
};

/* ── Slash Commands Dropdown ────────────────────────────────── */
const SLASH_COMMANDS = [
    { id: 'bold', label: '/bold', desc: 'Bold text', insert: '**bold text**' },
    { id: 'italic', label: '/italic', desc: 'Italic text', insert: '_italic text_' },
    { id: 'code', label: '/code', desc: 'Inline code', insert: '`code`' },
    { id: 'block', label: '/block', desc: 'Code block', insert: '```\ncode\n```' },
    { id: 'link', label: '/link', desc: 'Insert a link', insert: '[label](url)' },
    { id: 'remind', label: '/remind', desc: 'Set a reminder', insert: '/remind me in 1 hour' },
    { id: 'status', label: '/status', desc: 'Update status', insert: '/status ' },
];

const SlashMenu: React.FC<{ onPick: (insert: string) => void; onClose: () => void }> = ({ onPick, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);
    return (
        <div ref={ref} className="absolute bottom-full mb-2 left-0 z-50 bg-slate-800 border border-slate-700 rounded-xl w-64 shadow-2xl overflow-hidden">
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide px-3 pt-3 pb-1">Slash Commands</p>
            {SLASH_COMMANDS.map(cmd => (
                <button key={cmd.id} onClick={() => { onPick(cmd.insert); onClose(); }}
                    className="flex items-center gap-3 w-full px-3 py-2 hover:bg-slate-700 transition-colors text-left"
                >
                    <span className="text-xs font-mono text-cyan-400 w-16 flex-shrink-0">{cmd.label}</span>
                    <span className="text-slate-400 text-xs">{cmd.desc}</span>
                </button>
            ))}
        </div>
    );
};

/* ── Formatting Popup ───────────────────────────────────────── */
const FormatMenu: React.FC<{ onPick: (wrap: [string, string]) => void; onClose: () => void }> = ({ onPick, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);
    const formats: { label: string; preview: string; wrap: [string, string] }[] = [
        { label: 'Bold', preview: 'B', wrap: ['**', '**'] },
        { label: 'Italic', preview: 'I', wrap: ['_', '_'] },
        { label: 'Strikethrough', preview: 'S̶', wrap: ['~~', '~~'] },
        { label: 'Inline code', preview: '<>', wrap: ['`', '`'] },
        { label: 'Quote', preview: '❝', wrap: ['> ', ''] },
        { label: 'Code block', preview: '{}', wrap: ['```\n', '\n```'] },
    ];
    return (
        <div ref={ref} className="absolute bottom-full mb-2 left-0 z-50 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-2xl flex gap-1">
            {formats.map(f => (
                <button key={f.label} title={f.label} onClick={() => { onPick(f.wrap); onClose(); }}
                    className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-bold transition-colors"
                >{f.preview}</button>
            ))}
        </div>
    );
};

/* ── Main MessageInput ──────────────────────────────────────── */
const MessageInput: React.FC<{
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    loading?: boolean;
    attachedFiles: File[];
    setAttachedFiles: React.Dispatch<React.SetStateAction<File[]>>;
}> = ({ placeholder, value, onChange, onSend, loading, attachedFiles, setAttachedFiles }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLInputElement>(null);

    const canSend = !loading && (value.trim().length > 0 || attachedFiles.length > 0);

    const [openPanel, setOpenPanel] = useState<'emoji' | 'format' | 'slash' | null>(null);
    const [isListening, setIsListening] = useState(false);

    // Insert text at cursor position
    const insertAtCursor = (text: string) => {
        const el = textareaRef.current;
        if (!el) { onChange(value + text); return; }
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? value.length;
        const next = value.slice(0, start) + text + value.slice(end);
        onChange(next);
        setTimeout(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); }, 0);
    };

    // Wrap selected text or insert placeholder
    const wrapSelection = ([before, after]: [string, string]) => {
        const el = textareaRef.current;
        if (!el) { onChange(value + before + 'text' + after); return; }
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const sel = value.slice(start, end) || 'text';
        const next = value.slice(0, start) + before + sel + after + value.slice(end);
        onChange(next);
        setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + sel.length); }, 0);
    };

    // Voice to text (Web Speech API)
    const handleVoice = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            toast.error('Voice input is not supported in this browser.');
            return;
        }
        if (isListening) return;
        const recognition = new SR();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognition.onresult = (e: any) => {
            const transcript = e.results[0][0].transcript;
            insertAtCursor(transcript);
        };
        recognition.start();
    };

    const handleFile = (files: FileList | null) => {
        if (!files) return;
        const list = Array.from(files);
        const validFiles = list.filter(f => {
            if (f.size > 20 * 1024 * 1024) {
                toast.error(`File ${f.name} is too large. Maximum size is 20MB.`);
                return false;
            }
            return true;
        });
        if (validFiles.length > 0) {
            setAttachedFiles(prev => [...prev, ...validFiles]);
        }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
        if (e.key === '/') setOpenPanel('slash');
        if (e.key === 'Escape') setOpenPanel(null);
    };

    const toggle = (panel: 'emoji' | 'format' | 'slash') =>
        setOpenPanel(prev => prev === panel ? null : panel);

    return (
        <div className="relative border border-slate-700 rounded-xl overflow-visible bg-slate-800/40 focus-within:border-slate-500 transition-colors">
            {/* Hidden inputs */}
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFile(e.target.files)} />
            <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => handleFile(e.target.files)} />

            {/* Popups */}
            {openPanel === 'emoji' && <EmojiPicker onPick={insertAtCursor} onClose={() => setOpenPanel(null)} />}
            {openPanel === 'format' && <FormatMenu onPick={wrapSelection} onClose={() => setOpenPanel(null)} />}
            {openPanel === 'slash' && <SlashMenu onPick={insertAtCursor} onClose={() => setOpenPanel(null)} />}

            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
                <div className="px-3 pt-2 flex flex-wrap gap-2">
                    {attachedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-slate-700/60 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300">
                            <Paperclip className="w-3 h-3 text-cyan-400" />
                            <span className="max-w-[120px] truncate">{f.name}</span>
                            <button
                                type="button"
                                onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                                className="ml-1 text-slate-500 hover:text-rose-400 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-white placeholder-slate-500 focus:outline-none resize-none"
                placeholder={placeholder}
                rows={2}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={handleKey}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
                <div className="flex items-center gap-0.5">
                    {/* Attach file */}
                    <ToolbarBtn title="Add attachment" onClick={() => fileRef.current?.click()}>
                        <Paperclip className="w-4 h-4" />
                    </ToolbarBtn>

                    {/* Formatting */}
                    <ToolbarBtn title="Formatting (Bold, Italic, Code…)" onClick={() => toggle('format')} active={openPanel === 'format'}>
                        <Type className="w-4 h-4" />
                    </ToolbarBtn>

                    {/* Emoji */}
                    <ToolbarBtn title="Emoji" onClick={() => toggle('emoji')} active={openPanel === 'emoji'}>
                        <Smile className="w-4 h-4" />
                    </ToolbarBtn>

                    {/* Mention */}
                    <ToolbarBtn title="Mention someone" onClick={() => insertAtCursor('@')}>
                        <AtSign className="w-4 h-4" />
                    </ToolbarBtn>

                    <span className="w-px h-4 bg-slate-700 mx-1" />

                    {/* Video attach */}
                    <ToolbarBtn title="Attach video" onClick={() => videoRef.current?.click()}>
                        <Video className="w-4 h-4" />
                    </ToolbarBtn>

                    {/* Voice to text */}
                    <ToolbarBtn title={isListening ? 'Listening… click to stop' : 'Voice message (Speech-to-text)'} onClick={handleVoice} active={isListening}>
                        <Mic className={`w-4 h-4 ${isListening ? 'text-red-400 animate-pulse' : ''}`} />
                    </ToolbarBtn>

                    <span className="w-px h-4 bg-slate-700 mx-1" />

                    {/* Slash commands */}
                    <ToolbarBtn title="Slash commands" onClick={() => toggle('slash')} active={openPanel === 'slash'}>
                        <Slash className="w-4 h-4" />
                    </ToolbarBtn>
                </div>

                {/* Send button (split) */}
                <div className="flex items-center">
                    <button onClick={onSend} disabled={!canSend} title="Send message (Enter)"
                        className={`flex items-center justify-center w-8 h-8 rounded-l-lg transition-all ${canSend ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                            }`}
                    ><Send className="w-3.5 h-3.5" /></button>
                    <button disabled={!canSend} title="More send options"
                        className={`flex items-center justify-center w-5 h-8 rounded-r-lg border-l border-slate-500/30 transition-all ${canSend ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700/60 text-slate-500 cursor-not-allowed'
                            }`}
                    ><ChevronDown className="w-3 h-3" /></button>
                </div>
            </div>
        </div>
    );
};

/** Small toolbar icon button */
const ToolbarBtn: React.FC<{ title: string; onClick?: () => void; active?: boolean; children: React.ReactNode }> = ({ title, onClick, active, children }) => (
    <button title={title} onClick={onClick}
        className={`p-1.5 rounded-md transition-colors ${active
            ? 'text-cyan-400 bg-cyan-950/60 hover:bg-cyan-900/60'
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-700/60'
            }`}
    >{children}</button>
);

/* ──────────────────────────────────────────────────────────────
   New Thread Modal
────────────────────────────────────────────────────────────────*/
const NewThreadModal: React.FC<{ onClose: () => void; onSubmit: (t: string, b: string) => Promise<void> }> = ({ onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [loading, setLoading] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !body.trim() && attachedFiles.length === 0) return;
        setLoading(true);
        try {
            let finalBody = body.trim();
            if (attachedFiles.length > 0) {
                const token = localStorage.getItem('auth_token') || '';
                // Use the same fallback as api.ts
                const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
                const links: string[] = [];
                for (const file of attachedFiles) {
                    const form = new FormData();
                    form.append('file', file);
                    try {
                        const res = await fetch(`${apiUrl}/files/upload-temp`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                            body: form,
                        });
                        if (res.ok) {
                            const data = await res.json();
                            links.push(`📎 [${file.name}](${data.url})`);
                        } else {
                            toast.error(`Failed to upload ${file.name} (maybe too large)`);
                            links.push(`📎 ${file.name}`);
                        }
                    } catch (err) {
                        toast.error(`Failed to upload ${file.name}`);
                        console.error('Upload error', err);
                        links.push(`📎 ${file.name}`);
                    }
                }
                if (finalBody) finalBody += '\n';
                finalBody += links.join('\n');
            }
            setAttachedFiles([]);
            onClose();
            await onSubmit(title.trim(), finalBody);
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <Hash className="w-5 h-5 text-slate-400" />
                        <h3 className="text-base font-semibold text-white">{t('new_thread')}</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">{t('thread_title_label')}</label>
                        <input
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:border-cyan-500 focus:outline-none"
                            placeholder={t('thread_title_placeholder')}
                            value={title} onChange={e => setTitle(e.target.value)}
                            autoFocus required
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">{t('your_message')}</label>
                        <MessageInput
                            placeholder={t('message_placeholder')}
                            value={body}
                            onChange={setBody}
                            onSend={() => handleSubmit({ preventDefault: () => { } } as any)}
                            loading={loading}
                            attachedFiles={attachedFiles}
                            setAttachedFiles={setAttachedFiles}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">{t('cancel_btn')}</button>
                        <button type="submit" disabled={loading || !title.trim() || !body.trim()}
                            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-lg text-white text-sm font-medium transition-colors">
                            {loading ? t('posting') : t('post_thread')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ──────────────────────────────────────────────────────────────
   Thread Side Panel (like Slack's right sidebar)
────────────────────────────────────────────────────────────────*/
const ThreadPanel: React.FC<{
    discussion: Discussion;
    replies: DiscussionReply[];
    loading: boolean;
    userId?: string;
    onClose: () => void;
    onSendReply: (body: string) => Promise<void>;
    onDeleteReply: (reply: DiscussionReply) => Promise<void>;
    onRetryReply: (reply: DiscussionReply) => Promise<void>;
    onDeleteThread: (discussion: Discussion) => Promise<void>;
}> = ({ discussion, replies, loading, userId, onClose, onSendReply, onDeleteReply, onRetryReply, onDeleteThread }) => {
    const { t } = useTranslation();
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [replies]);

    const uploadFiles = async (files: File[], token: string): Promise<string[]> => {
        const urls: string[] = [];
        const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';
        for (const file of files) {
            const form = new FormData();
            form.append('file', file);
            try {
                const res = await fetch(`${apiUrl}/files/upload-temp`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: form,
                });
                if (res.ok) {
                    const data = await res.json();
                    urls.push(`📎 [${file.name}](${data.url})`);
                } else {
                    toast.error(`Failed to upload ${file.name} (maybe too large)`);
                    urls.push(`📎 ${file.name}`);
                }
            } catch (err) {
                toast.error(`Failed to upload ${file.name}`);
                console.error('Thread upload error', err);
                urls.push(`📎 ${file.name}`);
            }
        }
        return urls;
    };

    const send = async () => {
        if (!replyText.trim() && attachedFiles.length === 0) return;
        setSending(true);
        try {
            let body = replyText.trim();
            if (attachedFiles.length > 0) {
                const token = localStorage.getItem('auth_token') || '';
                const links = await uploadFiles(attachedFiles, token);
                if (body) body += '\n';
                body += links.join('\n');
            }
            await onSendReply(body);
            setReplyText('');
            setAttachedFiles([]);
        } finally { setSending(false); }
    };

    return (
        <div className="flex flex-col h-full border-l border-slate-800 bg-slate-900/95">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-white text-sm">{t('thread')}</span>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition-colors"><X className="w-4 h-4" /></button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                {/* Original message */}
                <div className="group relative flex gap-3 hover:bg-slate-800/40 px-2 py-2 rounded-lg transition-colors">
                    <Avatar name={discussion.authorName} avatar={discussion.authorAvatar} />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                            <span className="font-bold text-sm text-white">{discussion.authorName}</span>
                            <span className="text-xs text-slate-500">{friendlyDate(discussion.createdAt)}</span>
                        </div>
                        <p className="text-sm font-semibold text-cyan-300 mt-0.5">{discussion.title}</p>
                        <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap leading-relaxed">{discussion.body}</p>
                        <SyncStateNotice state={discussion.syncState} errorMessage={discussion.errorMessage} />
                    </div>
                    <HoverActions showDelete={userId === discussion.authorId} onDelete={() => onDeleteThread(discussion)} />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 my-3 px-2">
                    <div className="flex-1 h-px bg-slate-800" />
                    <span className="text-xs text-slate-500 font-medium">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
                    <div className="flex-1 h-px bg-slate-800" />
                </div>

                {/* Replies */}
                {loading ? (
                    <div className="flex items-center gap-2 px-2 py-4 text-slate-500 text-sm"><span className="animate-spin">⟳</span> {t('loading_dots')}</div>
                ) : replies.length === 0 ? (
                    <p className="text-center text-slate-600 text-sm py-6">{t('no_replies_yet')}</p>
                ) : (
                    replies.map((reply, i) => {
                        const showDayLabel = i === 0 || dayLabel(reply.createdAt) !== dayLabel(replies[i - 1].createdAt);
                        const prevSame = i > 0 && replies[i - 1].authorId === reply.authorId;
                        return (
                            <React.Fragment key={reply.id}>
                                {showDayLabel && (
                                    <div className="flex items-center gap-3 my-3 px-2">
                                        <div className="flex-1 h-px bg-slate-800" />
                                        <span className="text-xs text-slate-500 font-medium">{dayLabel(reply.createdAt)}</span>
                                        <div className="flex-1 h-px bg-slate-800" />
                                    </div>
                                )}
                                <div className={`group relative flex gap-3 hover:bg-slate-800/40 px-2 rounded-lg transition-colors ${prevSame ? 'py-0.5' : 'py-2 mt-1'}`}>
                                    {prevSame
                                        ? <div className="w-8 flex-shrink-0 flex items-center justify-center">
                                            <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100">{format(new Date(reply.createdAt), 'h:mm')}</span>
                                        </div>
                                        : <Avatar name={reply.authorName} avatar={reply.authorAvatar} size="sm" />
                                    }
                                    <div className="min-w-0 flex-1">
                                        {!prevSame && (
                                            <div className="flex items-baseline gap-2">
                                                <span className="font-bold text-sm text-white">{reply.authorName}</span>
                                                <span className="text-xs text-slate-500">{friendlyDate(reply.createdAt)}</span>
                                            </div>
                                        )}
                                        <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                                            {reply.body.split('\n').filter(l => !l.match(/^📎 \[.+\]\(.+\)$/) && !l.match(/^📎 .+/)).join('\n') || null}
                                        </p>
                                        {/* Attachment chips parsed from body links */}
                                        {(() => {
                                            const links = reply.body.split('\n')
                                                .map(l => { const m = l.match(/^📎 \[(.+?)\]\((.+?)\)$/); return m ? { filename: m[1], url: m[2] } : l.startsWith('📎 ') ? { filename: l.replace('📎 ', ''), url: '' } : null; })
                                                .filter(Boolean) as { filename: string; url: string }[];
                                            if (!links.length) return null;
                                            return (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {links.map((att, idx) => att.url ? (
                                                        <a key={idx} href={att.url} download={att.filename} target="_blank" rel="noreferrer"
                                                            className="flex items-center gap-1.5 bg-slate-700/60 border border-slate-600 hover:border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:text-white transition-colors group/att">
                                                            <Paperclip className="w-3 h-3 text-cyan-400" />
                                                            <span className="max-w-[150px] truncate">{att.filename}</span>
                                                            <DownloadIcon className="w-3 h-3 text-slate-500 group-hover/att:text-cyan-400 transition-colors" />
                                                        </a>
                                                    ) : (
                                                        <div key={idx} className="flex items-center gap-1.5 bg-slate-700/60 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
                                                            <Paperclip className="w-3 h-3 text-cyan-400" />
                                                            <span className="max-w-[150px] truncate">{att.filename}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                        <SyncStateNotice
                                            state={reply.syncState}
                                            errorMessage={reply.errorMessage}
                                            onRetry={reply.syncState === 'failed' ? () => onRetryReply(reply) : undefined}
                                        />
                                    </div>
                                    <HoverActions showDelete={userId === reply.authorId} onDelete={() => onDeleteReply(reply)} />
                                </div>
                            </React.Fragment>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
                <p className="text-xs text-slate-500 mb-2">
                    {t('reply_to')} <span className="text-slate-300 font-medium">{discussion.authorName}</span>
                </p>
                <MessageInput
                    placeholder={t('reply_to_thread')}
                    value={replyText}
                    onChange={setReplyText}
                    onSend={send}
                    loading={sending}
                    attachedFiles={attachedFiles}
                    setAttachedFiles={setAttachedFiles}
                />
            </div>
        </div>
    );
};

/* ──────────────────────────────────────────────────────────────
   Main Component
────────────────────────────────────────────────────────────────*/
export const DiscussionsTab: React.FC<DiscussionsTabProps> = ({
    projectId,
    discussions,
    onCreateThread,
    onDeleteThread,
    onGetReplies,
    onCreateReply,
    onDeleteReply,
    canCreate = false,
}) => {
    const { t } = useTranslation();
    const { confirm } = useAppDialog();
    const { user } = useAuth();
    const token = localStorage.getItem('auth_token') || '';
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [threads, setThreads] = useState<Discussion[]>(() => sortThreads(discussions));
    const [activeThread, setActiveThread] = useState<Discussion | null>(null);
    const [replies, setReplies] = useState<DiscussionReply[]>([]);
    const [loadingReplies, setLoadingReplies] = useState(false);
    const [socketConnected, setSocketConnected] = useState(false);
    const [roomSubscribed, setRoomSubscribed] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const pollTimerRef = useRef<number | null>(null);
    const pollDelayRef = useRef(5000);
    const activeThreadIdRef = useRef<string | null>(null);

    useEffect(() => {
        setThreads((current) => mergeThreads(discussions, current));
    }, [discussions, projectId]);

    useEffect(() => {
        if (!activeThread) return;
        const next = threads.find((thread) =>
            thread.id === activeThread.id ||
            (activeThread.clientRequestId && thread.clientRequestId === activeThread.clientRequestId)
        );
        if (!next) {
            setActiveThread(null);
            setReplies([]);
            return;
        }
        if (next !== activeThread) {
            setActiveThread(next);
        }
    }, [activeThread, threads]);

    useEffect(() => {
        activeThreadIdRef.current = activeThread?.id ?? null;
    }, [activeThread?.id]);

    const updateThreadMeta = (discussionId: string, patch: Partial<Discussion>) => {
        setThreads((current) => sortThreads(current.map((thread) => (
            thread.id === discussionId ? { ...thread, ...patch } : thread
        ))));
        setActiveThread((current) => current?.id === discussionId ? { ...current, ...patch } : current);
    };

    const refreshThreads = async () => {
        const latest = await api.projects.getDiscussions(projectId);
        setThreads((current) => mergeThreads(latest, current));
    };

    const refreshReplies = async (discussionId: string) => {
        const latest = await onGetReplies(discussionId);
        setReplies((current) => mergeReplies(latest, current.filter((reply) => reply.discussionId === discussionId)));
    };

    const silentCatchUp = async () => {
        await refreshThreads();
        if (activeThreadIdRef.current) {
            await refreshReplies(activeThreadIdRef.current);
        }
    };

    const openThread = async (thread: Discussion) => {
        setActiveThread(thread);
        setLoadingReplies(true);
        try {
            await refreshReplies(thread.id);
        } finally {
            setLoadingReplies(false);
        }
    };

    const closeThread = () => { setActiveThread(null); setReplies([]); };

    const handleSendReply = async (body: string) => {
        if (!activeThread) return;
        const discussionId = activeThread.id;
        const tempId = createTempId('reply');
        const clientRequestId = createClientRequestId('reply');
        const optimisticReply: DiscussionReply = {
            id: tempId,
            discussionId,
            body,
            authorId: user?.id || 'me',
            authorName: user?.name || 'You',
            authorAvatar: user?.avatar,
            createdAt: new Date().toISOString(),
            clientRequestId,
            syncState: 'pending',
        };

        setReplies((current) => sortReplies([...current, optimisticReply]));

        try {
            const created = await onCreateReply(discussionId, body, clientRequestId);
            if (created) {
                setReplies((current) => sortReplies([
                    ...current.filter((reply) => reply.id !== tempId && reply.clientRequestId !== clientRequestId && reply.id !== created.id),
                    created,
                ]));
                updateThreadMeta(discussionId, {
                    replyCount: (activeThread.replyCount || 0) + 1,
                    lastReplyAt: created.createdAt,
                    updatedAt: created.createdAt,
                });
            } else {
                setReplies((current) => current.map((reply) => (
                    reply.id === tempId ? { ...reply, syncState: 'failed', errorMessage: 'Failed to send reply.' } : reply
                )));
                await silentCatchUp();
            }
        } catch {
            setReplies((current) => current.map((reply) => (
                reply.id === tempId ? { ...reply, syncState: 'failed', errorMessage: 'Failed to send reply.' } : reply
            )));
            await silentCatchUp();
        }
    };

    const handleDeleteReply = async (reply: DiscussionReply) => {
        if (!activeThread) return;
        const shouldDelete = await confirm({
            title: 'Delete Reply',
            message: 'Delete this reply?',
            confirmText: 'Delete',
            tone: 'danger',
        });
        if (!shouldDelete) return;
        await onDeleteReply(activeThread.id, reply.id);
        setReplies(prev => prev.filter(r => r.id !== reply.id));
        await silentCatchUp();
    };

    const handleRetryReply = async (reply: DiscussionReply) => {
        const nextRequestId = createClientRequestId('reply');
        setReplies((current) => current.map((entry) => (
            entry.id === reply.id
                ? { ...entry, syncState: 'pending', errorMessage: undefined, clientRequestId: nextRequestId }
                : entry
        )));

        const created = await onCreateReply(reply.discussionId, reply.body, nextRequestId);
        if (created) {
            setReplies((current) => sortReplies([
                ...current.filter((entry) => entry.id !== reply.id && entry.clientRequestId !== nextRequestId && entry.id !== created.id),
                created,
            ]));
            updateThreadMeta(reply.discussionId, {
                replyCount: (activeThread?.replyCount || 0) + 1,
                lastReplyAt: created.createdAt,
                updatedAt: created.createdAt,
            });
        } else {
            setReplies((current) => current.map((entry) => (
                entry.id === reply.id ? { ...entry, syncState: 'failed', errorMessage: 'Failed to send reply.' } : entry
            )));
        }
    };

    const handleDeleteThread = async (thread: Discussion) => {
        const shouldDelete = await confirm({
            title: 'Delete Thread',
            message: `Delete "${thread.title}"? All replies will be removed.`,
            confirmText: 'Delete',
            tone: 'danger',
        });
        if (!shouldDelete) return;
        await onDeleteThread(thread.id);
        setThreads((current) => current.filter((entry) => entry.id !== thread.id));
        if (activeThreadIdRef.current === thread.id) closeThread();
    };

    const handleCreateThreadOptimistic = async (title: string, body: string) => {
        const tempId = createTempId('discussion');
        const clientRequestId = createClientRequestId('discussion');
        const nowIso = new Date().toISOString();
        const optimisticThread: Discussion = {
            id: tempId,
            projectId,
            title,
            body,
            authorId: user?.id || 'me',
            authorName: user?.name || 'You',
            authorAvatar: user?.avatar,
            replyCount: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
            clientRequestId,
            syncState: 'pending',
        };

        setThreads((current) => sortThreads([optimisticThread, ...current]));

        try {
            const created = await onCreateThread(title, body, clientRequestId);
            if (created) {
                setThreads((current) => sortThreads([
                    created,
                    ...current.filter((thread) => thread.id !== tempId && thread.clientRequestId !== clientRequestId && thread.id !== created.id),
                ]));
            } else {
                setThreads((current) => current.map((thread) => (
                    thread.id === tempId ? { ...thread, syncState: 'failed', errorMessage: 'Failed to post thread.' } : thread
                )));
            }
        } catch {
            setThreads((current) => current.map((thread) => (
                thread.id === tempId ? { ...thread, syncState: 'failed', errorMessage: 'Failed to post thread.' } : thread
            )));
        }
    };

    const handleRetryThread = async (thread: Discussion) => {
        const nextRequestId = createClientRequestId('discussion');
        setThreads((current) => current.map((entry) => (
            entry.id === thread.id
                ? { ...entry, syncState: 'pending', errorMessage: undefined, clientRequestId: nextRequestId, updatedAt: new Date().toISOString() }
                : entry
        )));

        const created = await onCreateThread(thread.title, thread.body, nextRequestId);
        if (created) {
            setThreads((current) => sortThreads([
                created,
                ...current.filter((entry) => entry.id !== thread.id && entry.clientRequestId !== nextRequestId && entry.id !== created.id),
            ]));
        } else {
            setThreads((current) => current.map((entry) => (
                entry.id === thread.id ? { ...entry, syncState: 'failed', errorMessage: 'Failed to post thread.' } : entry
            )));
        }
    };

    useEffect(() => {
        if (!user || !token) return;

        const socket = io(DISCUSSION_WS_URL, {
            path: '/ws',
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setSocketConnected(true);
            setRoomSubscribed(false);
            pollDelayRef.current = 5000;
            socket.emit('project-discussions:join', { projectId }, async (response?: { ok?: boolean }) => {
                const joined = response?.ok === true;
                setRoomSubscribed(joined);
                await silentCatchUp();
            });
        });

        socket.on('disconnect', () => {
            setSocketConnected(false);
            setRoomSubscribed(false);
        });

        socket.on('connect_error', () => {
            setSocketConnected(false);
            setRoomSubscribed(false);
        });

        socket.on('discussion:thread-created', (payload: Discussion) => {
            setThreads((current) => sortThreads([
                payload,
                ...current.filter((thread) => thread.id !== payload.id && (!payload.clientRequestId || thread.clientRequestId !== payload.clientRequestId)),
            ]));
        });

        socket.on('discussion:thread-deleted', (payload: { discussionId: string }) => {
            setThreads((current) => current.filter((thread) => thread.id !== payload.discussionId));
            if (activeThreadIdRef.current === payload.discussionId) {
                closeThread();
            }
        });

        socket.on('discussion:reply-created', (payload: { discussionId: string; reply: DiscussionReply; discussion?: Partial<Discussion> }) => {
            if (payload.discussion) {
                updateThreadMeta(payload.discussionId, payload.discussion);
            }
            if (activeThreadIdRef.current === payload.discussionId) {
                setReplies((current) => sortReplies([
                    ...current.filter((reply) => reply.id !== payload.reply.id && (!payload.reply.clientRequestId || reply.clientRequestId !== payload.reply.clientRequestId)),
                    payload.reply,
                ]));
            }
        });

        socket.on('discussion:reply-deleted', (payload: { discussionId: string; replyId: string; discussion?: Partial<Discussion> }) => {
            if (payload.discussion) {
                updateThreadMeta(payload.discussionId, payload.discussion);
            }
            if (activeThreadIdRef.current === payload.discussionId) {
                setReplies((current) => current.filter((reply) => reply.id !== payload.replyId));
            }
        });

        return () => {
            socket.emit('project-discussions:leave', { projectId });
            socket.disconnect();
            socketRef.current = null;
        };
    }, [projectId, token, user]);

    useEffect(() => {
        if (socketConnected && roomSubscribed) {
            if (pollTimerRef.current) {
                window.clearTimeout(pollTimerRef.current);
                pollTimerRef.current = null;
            }
            return;
        }

        const schedule = () => {
            pollTimerRef.current = window.setTimeout(async () => {
                try {
                    await silentCatchUp();
                } finally {
                    pollDelayRef.current = Math.min(pollDelayRef.current * 2, 30000);
                    schedule();
                }
            }, pollDelayRef.current);
        };

        schedule();

        return () => {
            if (pollTimerRef.current) {
                window.clearTimeout(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, [socketConnected, roomSubscribed, projectId]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            void silentCatchUp();
        }, 15000);

        return () => {
            window.clearInterval(interval);
        };
    }, [projectId]);

    // Group messages by day for dividers
    const grouped: { label: string; items: Discussion[] }[] = [];
    threads.forEach(d => {
        const lbl = dayLabel(d.createdAt);
        const last = grouped[grouped.length - 1];
        if (last?.label === lbl) last.items.push(d);
        else grouped.push({ label: lbl, items: [d] });
    });

    return (
        <div className="flex h-[calc(100vh-220px)] min-h-[500px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950">

            {/* ── Left: Thread Feed ── */}
            <div className={`flex flex-col flex-shrink-0 transition-all duration-300 ${activeThread ? 'w-[55%]' : 'w-full'}`}>

                {/* Channel header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Hash className="w-5 h-5 text-slate-400" />
                        <span className="font-bold text-white">{t('project_discussions')}</span>
                        <span className="text-slate-600 text-sm">·</span>
                        <span className="text-slate-500 text-sm">{t('threads_count', { count: threads.length })}</span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            socketConnected && roomSubscribed
                                ? 'text-[hsl(var(--brand-success))] border-[hsl(var(--brand-success)/0.2)] bg-[hsl(var(--brand-success)/0.1)]'
                                : 'text-[hsl(var(--brand-warning))] border-[hsl(var(--brand-warning)/0.2)] bg-[hsl(var(--brand-warning)/0.1)]'
                        }`}>
                            {socketConnected && roomSubscribed ? 'Live' : 'Syncing'}
                        </span>
                    </div>
                    {canCreate ? (
                        <Button onClick={() => setIsModalOpen(true)} className="text-sm py-1.5 px-4">
                            <Plus className="w-4 h-4 mr-1.5" /> {t('new_thread')}
                        </Button>
                    ) : null}
                </div>

                {/* Message feed */}
                <div className="flex-1 overflow-y-auto px-2 py-3">
                    {threads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
                                <MessageSquare className="w-8 h-8 text-slate-600" />
                            </div>
                            <p className="text-slate-300 font-semibold">{t('no_threads_yet')}</p>
                            <p className="text-slate-600 text-sm mt-1 max-w-xs">{t('start_discussion_desc')}</p>
                            {canCreate ? (
                                <Button className="mt-5" onClick={() => setIsModalOpen(true)}>
                                    <Plus className="w-4 h-4 mr-2" /> {t('start_a_thread')}
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        grouped.map(group => (
                            <React.Fragment key={group.label}>
                                {/* Day divider */}
                                <div className="flex items-center gap-3 my-3 px-2">
                                    <div className="flex-1 h-px bg-slate-800" />
                                    <span className="text-xs text-slate-500 font-medium bg-slate-950 px-2">{group.label}</span>
                                    <div className="flex-1 h-px bg-slate-800" />
                                </div>

                                {group.items.map((thread, i) => {
                                    const prevSame = i > 0 && group.items[i - 1].authorId === thread.authorId;
                                    const isActive = activeThread?.id === thread.id;

                                    return (
                                        <div
                                            key={thread.id}
                                            className={`group relative hover:bg-slate-800/50 px-3 rounded-lg transition-colors ${isActive ? 'bg-slate-800/60 ring-1 ring-cyan-800/40' : ''} ${prevSame ? 'py-0.5' : 'py-2 mt-1'}`}
                                        >
                                            <div className="flex gap-3">
                                                {/* Avatar or timestamp */}
                                                {prevSame
                                                    ? <div className="w-9 flex-shrink-0 flex items-start justify-center pt-0.5">
                                                        <span className="text-[10px] text-slate-600 opacity-0 group-hover:opacity-100">{format(new Date(thread.createdAt), 'h:mm')}</span>
                                                    </div>
                                                    : <Avatar name={thread.authorName} avatar={thread.authorAvatar} />
                                                }

                                                {/* Content */}
                                                <div className="min-w-0 flex-1">
                                                    {!prevSame && (
                                                        <div className="flex items-baseline gap-2 flex-wrap">
                                                            <span className="font-bold text-sm text-white hover:underline cursor-pointer">{thread.authorName}</span>
                                                            <span className="text-xs text-slate-500">{friendlyDate(thread.createdAt)}</span>
                                                        </div>
                                                    )}
                                                    {/* Thread title badge */}
                                                    <div className="flex items-center gap-1.5 mt-0.5 mb-1">
                                                        <span className="text-xs font-semibold text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded-md border border-cyan-900/50">
                                                            {thread.title}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-300 leading-relaxed line-clamp-2">{thread.body}</p>
                                                    <SyncStateNotice
                                                        state={thread.syncState}
                                                        errorMessage={thread.errorMessage}
                                                        onRetry={thread.syncState === 'failed' ? () => handleRetryThread(thread) : undefined}
                                                    />

                                                    {/* Reply count row */}
                                                    <ReplyBadge discussion={thread} onClick={() => openThread(thread)} />

                                                    {/* Zero reply nudge */}
                                                    {thread.replyCount === 0 && (
                                                        <button
                                                            onClick={() => openThread(thread)}
                                                            className="mt-1 text-xs text-slate-600 hover:text-cyan-400 transition-colors flex items-center gap-1"
                                                        >
                                                            <MessageSquare className="w-3 h-3" /> Reply
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Hover action bar */}
                                            <HoverActions
                                                onReply={() => openThread(thread)}
                                                onDelete={() => handleDeleteThread(thread)}
                                                showDelete={user?.id === thread.authorId}
                                            />
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))
                    )}
                </div>

                {/* Bottom compose area */}
                {canCreate ? (
                    <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
                        <div
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center gap-3 border border-slate-700 rounded-xl px-4 py-2.5 bg-slate-800/30 hover:border-slate-600 cursor-pointer transition-colors"
                        >
                            <Avatar name={user?.name || 'You'} size="xs" />
                            <span className="text-slate-500 text-sm">Start a new thread...</span>
                            <div className="ml-auto flex items-center gap-1 text-slate-600">
                                <Smile className="w-4 h-4" />
                                <span className="font-bold text-sm">@</span>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* ── Right: Thread Panel ── */}
            {activeThread && (
                <div className={`flex-1 min-w-0 transition-all duration-300`}>
                    <ThreadPanel
                        discussion={activeThread}
                        replies={replies}
                        loading={loadingReplies}
                        userId={user?.id}
                        onClose={closeThread}
                        onSendReply={handleSendReply}
                        onDeleteReply={handleDeleteReply}
                        onRetryReply={handleRetryReply}
                        onDeleteThread={handleDeleteThread}
                    />
                </div>
            )}

            {/* New Thread Modal */}
            {isModalOpen && canCreate && (
                <NewThreadModal
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleCreateThreadOptimistic}
                />
            )}
        </div>
    );
};

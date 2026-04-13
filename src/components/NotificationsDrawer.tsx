import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Notification } from '../types';
import { Button } from './ui/UIComponents';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [notifications, count] = await Promise.all([api.notifications.list(), api.notifications.count()]);
      setList(notifications as Notification[]);
      setUnreadCount((count as { count: number }).count ?? 0);
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setList(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (e) {
      console.error('Mark read failed', e);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setList(prev => prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (e) {
      console.error('Mark all read failed', e);
    }
  };

  const openLinkedTarget = (linkUrl?: string | null) => {
    if (!linkUrl) return;

    try {
      const target = new URL(linkUrl, window.location.origin);
      if (target.origin === window.location.origin) {
        navigate(`${target.pathname}${target.search}${target.hash}`);
      } else {
        window.open(target.toString(), '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.location.assign(linkUrl);
    }
  };

  const handleOpenNotification = (notification: Notification) => {
    if (!notification.readAt) {
      void handleMarkRead(notification.id);
    }
    openLinkedTarget(notification.linkUrl);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">{t('notifications')}</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded-full">{unreadCount}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck className="w-4 h-4 mr-1" /> {t('mark_all_read')}
              </Button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-slate-500 text-center py-8">{t('loading')}...</p>
          ) : list.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{t('no_notifications')}</p>
          ) : (
            <ul className="space-y-1">
              {list.map((n) => (
                <li
                  key={n.id}
                  className={`p-3 rounded-lg border transition-colors ${n.readAt ? 'border-slate-800 bg-slate-800/30' : 'border-cyan-500/20 bg-cyan-500/5'}`}
                >
                  <div
                    className={`flex items-start justify-between gap-2 ${n.linkUrl ? 'cursor-pointer hover:bg-white/5 rounded-md p-1 -m-1' : ''}`}
                    role={n.linkUrl ? 'button' : undefined}
                    tabIndex={n.linkUrl ? 0 : undefined}
                    onClick={n.linkUrl ? () => handleOpenNotification(n) : undefined}
                    onKeyDown={n.linkUrl ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenNotification(n);
                      }
                    } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-200 truncate">{n.title}</p>
                      {n.body && <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-xs text-slate-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                      {n.linkUrl && <p className="text-xs text-cyan-400 mt-2">Open linked item</p>}
                    </div>
                    {!n.readAt && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleMarkRead(n.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 rounded"
                        title={t('mark_read')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

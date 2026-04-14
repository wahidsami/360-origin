import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui/UIComponents';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.getChangelog().then((data) => {
        setEntries(data || []);
      }).finally(() => setLoading(false));
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-xl bg-slate-900 border border-slate-700 shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-200">{t('changelog')}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-6">
          {loading && <p className="text-slate-500 text-sm">{t('loading_changelog')}</p>}
          {!loading && entries.length === 0 && <p className="text-slate-500 text-sm">{t('no_changelog_entries')}</p>}
          {!loading && entries.map((entry) => (
            <div key={entry.version} className="border-b border-slate-800 pb-4 last:border-0 last:pb-0">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-semibold text-cyan-400">v{entry.version}</span>
                <span className="text-slate-500 text-sm">{entry.date}</span>
              </div>
              <ul className="list-disc list-inside text-slate-400 text-sm space-y-1">
                {entry.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-700">
          <Button variant="outline" size="sm" onClick={onClose}>{t('close')}</Button>
        </div>
      </div>
    </div>
  );
};

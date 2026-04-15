import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, FileText, Briefcase } from 'lucide-react';
import { GlassCard, KpiCard, Badge } from '@/components/ui/UIComponents';
import { api } from '@/services/api';
import { Role, Invoice } from '@/types';
import { formatSAR } from '../../utils/currency';

export const FinanceDashboard: React.FC<{ role: Role }> = ({ role: _role }) => {
   const { t } = useTranslation();
   const [stats, setStats] = useState<any>(null);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      const load = async () => {
         const data = await api.dashboard.getFinanceStats();
         setStats(data);
         setLoading(false);
      };
      load();
   }, []);

   if (loading) return <div className="text-center p-10 text-slate-500">{t('loading_financial')}</div>;

   return (
      <div className="space-y-8">
       <div>
          <h1 className="text-4xl font-black font-display text-slate-900 dark:text-white uppercase tracking-tighter">{t('dashboard')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">{t('financial_overview')}</p>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard label={t('outstanding_balance')} value={formatSAR(stats.outstandingAmount || 0)} icon={<DollarSign />} />
          <KpiCard label={t('invoices_due')} value={stats.invoicesDueCount || 0} icon={<FileText />} />
          <KpiCard label={t('paid_this_month')} value={formatSAR(stats.paidThisMonth || 0)} icon={<Briefcase />} />
          <KpiCard label={t('active_contracts')} value={stats.contractsActive || 0} icon={<Briefcase />} />
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <GlassCard title={t('overdue_payments')}>
             <div className="overflow-x-auto mt-4 px-2">
                <table className="w-full text-left text-sm">
                   <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
                      <tr>
                         <th className="pb-4">{t('invoice')}</th>
                         <th className="pb-4">{t('amount')}</th>
                         <th className="pb-4">{t('due_date')}</th>
                         <th className="pb-4">{t('status')}</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {(stats.overdueInvoices as Invoice[]).map(inv => (
                         <tr key={inv.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 font-mono font-bold text-slate-600 dark:text-slate-300">{inv.reference}</td>
                            <td className="py-4 text-rose-600 dark:text-rose-400 font-black">{inv.currency} {inv.amount.toLocaleString()}</td>
                            <td className="py-4 text-slate-500 dark:text-slate-400 font-medium">{new Date(inv.dueDate).toLocaleDateString()}</td>
                            <td className="py-4"><Badge variant="danger" size="sm">{t('overdue')}</Badge></td>
                         </tr>
                      ))}
                      {stats.overdueInvoices.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">{t('no_overdue_payments')}</td></tr>}
                   </tbody>
                </table>
             </div>
          </GlassCard>

          <GlassCard title={t('recent_invoices')}>
             <div className="space-y-4 mt-4">
                {(stats.recentInvoices as Invoice[]).map(inv => (
                   <div key={inv.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-transparent hover:bg-white dark:hover:bg-slate-800/50 hover:shadow-md transition-all group">
                      <div>
                         <p className="font-bold text-slate-800 dark:text-slate-200 tracking-tight">{inv.reference}</p>
                         <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">{new Date(inv.issuedDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                         <p className="font-black text-slate-900 dark:text-slate-100">{inv.currency} {inv.amount.toLocaleString()}</p>
                         <div className="mt-1 flex justify-end">
                            <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'sent' ? 'warning' : 'neutral'} size="sm">{inv.status}</Badge>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </GlassCard>
       </div>
    </div>
   );
};

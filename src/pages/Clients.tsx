import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Client, Permission, Project } from '../types';
import { api } from '../services/api';
import { GlassCard, Button, Badge, Input, Select } from '../components/ui/UIComponents';
import { PermissionGate } from '../components/PermissionGate';
import { useAppDialog } from '../contexts/DialogContext';
import { formatCurrency } from '../utils/currency';

export const ClientList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm } = useAppDialog();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterClients();
  }, [searchTerm, statusFilter, industryFilter, clients]);

  const loadData = async () => {
    setLoading(true);
    const [clientsData, projectsData] = await Promise.all([
      api.clients.list(true),
      api.projects.list()
    ]);
    setClients(clientsData);
    setProjects(projectsData);
    setLoading(false);
  };

  const getActiveProjectCount = (clientId: string) => {
    return projects.filter(p => p.clientId === clientId && p.status !== 'deployed').length;
  };

  const filterClients = () => {
    let result = clients;

    if (searchTerm) {
      result = result.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    } else {
      result = result.filter(c => c.status !== 'archived');
    }

    if (industryFilter !== 'all') {
      result = result.filter(c => c.industry === industryFilter);
    }

    setFilteredClients(result);
  };

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const shouldArchive = await confirm({
      title: t('archive'),
      message: t('confirm_archive_client'),
      confirmText: t('archive'),
      tone: 'danger',
    });
    if (!shouldArchive) return;
    await api.clients.archive(id);
    loadData();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const shouldDelete = await confirm({
      title: 'Delete Client',
      message: 'Are you sure you want to completely delete this client?',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!shouldDelete) return;
    await api.clients.delete(id);
    loadData();
  };

  const handleRestore = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const shouldRestore = await confirm({
      title: t('restore_client'),
      message: t('confirm_restore_client'),
      confirmText: t('restore_client'),
    });
    if (!shouldRestore) return;
    await api.clients.restore(id);
    loadData();
  };

  const industries = Array.from(new Set(clients.map(c => c.industry)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-white">{t('clients')}</h1>
          <p className="text-slate-400">{t('clients_subtitle')}</p>
        </div>
        <PermissionGate permission={Permission.MANAGE_CLIENTS}>
          <Button onClick={() => navigate('new')} className="shadow-lg shadow-cyan-500/20">
            <Plus className="w-4 h-4 mr-2" /> {t('add_client')}
          </Button>
        </PermissionGate>
      </div>

      {/* Filters Toolbar */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-500 rtl:right-3 rtl:left-auto" />
            <Input
              placeholder={t('search')}
              className="pl-10 rtl:pr-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <div className="w-40">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">{t('all_statuses')}</option>
                <option value="active">{t('active')}</option>
                <option value="inactive">{t('inactive')}</option>
                <option value="archived">{t('archived')}</option>
              </Select>
            </div>
            <div className="w-40">
              <Select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                <option value="all">{t('all_industries')}</option>
                {industries.map(i => <option key={i} value={i}>{i}</option>)}
              </Select>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700/50 text-slate-400 text-sm">
                <th className="p-6 font-medium">{t('client_name')}</th>
                <th className="p-6 font-medium">{t('status')}</th>
                <th className="p-6 font-medium">{t('active_projects')}</th>
                <th className="p-6 font-medium">{t('outstanding_balance')}</th>
                <th className="p-6 font-medium">{t('last_activity')}</th>
                <th className="p-6 font-medium text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">{t('scanning_database')}</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">{t('no_entities_found')}</td></tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => navigate(`/app/clients/${client.id}`)}>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        {client.logoUrl ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
                            <img
                              src={client.logoUrl}
                              alt={client.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-lg font-bold text-slate-500">${client.name.charAt(0)}</div>`;
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-lg font-bold text-slate-500">
                            {client.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-slate-200 font-medium">{client.name}</p>
                          <p className="text-xs text-slate-500">{client.industry}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                        <Badge
                          variant={
                            client.status === 'active'
                              ? 'success'
                              : client.status === 'archived'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {t(client.status).toUpperCase()}
                        </Badge>
                    </td>
                    <td className="p-6">
                      <span className="font-mono text-cyan-400 font-bold">{getActiveProjectCount(client.id)}</span>
                    </td>
                    <td className="p-6 text-slate-300 text-sm font-medium">
                      {formatCurrency(client.outstandingBalance || 0, client.billing?.currency || 'SAR')}
                    </td>
                    <td className="p-6 text-slate-400 text-sm">
                      {new Date(client.lastActivity).toLocaleDateString()}
                    </td>
                    <td className="p-6">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/app/clients/${client.id}`)}>
                          <Eye className="w-4 h-4 text-slate-400 hover:text-cyan-400" />
                        </Button>
                        <PermissionGate permission={Permission.MANAGE_CLIENTS}>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/app/clients/${client.id}/edit`)}>
                            <Edit className="w-4 h-4 text-slate-400 hover:text-[hsl(var(--brand-warning))]" />
                          </Button>
                          {client.status === 'archived' ? (
                            <Button variant="ghost" size="sm" onClick={(e) => handleRestore(client.id, e)} title={t('restore_client')}>
                              <RotateCcw className="w-4 h-4 text-slate-400 hover:text-[hsl(var(--brand-success))]" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={(e) => handleArchive(client.id, e)} title={t('archive')}>
                              <Archive className="w-4 h-4 text-slate-400 hover:text-[hsl(var(--brand-warning))]" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={(e) => handleDelete(client.id, e)}>
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
};

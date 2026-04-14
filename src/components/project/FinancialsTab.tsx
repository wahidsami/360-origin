import React, { useState, useEffect } from 'react';
import { Contract, Invoice, Permission, isInternalRole } from '@/types';
import { Button, GlassCard, Badge, Input, Modal, Select } from '../ui/UIComponents';
import { Plus, FileText, DollarSign, Calendar, Download, Trash2, Edit, Send, Check, X, CreditCard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppDialog } from '../../contexts/DialogContext';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { useParams } from 'react-router-dom';
import { SarSymbol, formatSAR } from '../../utils/currency';
import { format } from 'date-fns';
import { PermissionGate } from '../PermissionGate';
import toast from 'react-hot-toast';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

function PaymentForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
    const { t } = useTranslation();
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setLoading(true);
        setError(null);
        const { error: err } = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: window.location.href },
            redirect: 'if_required',
        });
        setLoading(false);
            if (err) {
            setError(err.message || t('payment_failed'));
            return;
        }
        onSuccess();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
                <Button type="submit" disabled={!stripe || loading}>{loading ? t('processing') : t('pay_now')}</Button>
            </div>
        </form>
    );
}

interface ApprovalInfo {
    id: string;
    status: string;
    entityType: string;
    entityId: string;
    stepOrder?: number;
    approver?: { id: string; name: string };
    requestedBy?: { name: string };
    reviewedBy?: { name: string };
    reviewedAt?: string;
    comment?: string | null;
}

interface FinancialsTabProps {
    contract?: Contract;
    invoices: Invoice[];
    onRefresh?: () => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({ contract: initialContract, invoices: initialInvoices, onRefresh }) => {
    const { t } = useTranslation();
    const { confirm } = useAppDialog();
    const { projectId } = useParams();
    const { user } = useAuth();
    const [activeView, setActiveView] = useState<'overview' | 'contracts' | 'invoices'>('overview');

    // Local state for lists (in case we want to manipulate them optimistically, but mostly relying on props or re-fetching)
    // For this implementation, we'll trigger parent refresh or local fetch
    const [contracts, setContracts] = useState<Contract[]>(initialContract ? [initialContract] : []); // The API currently returns a list but the prop was single. Let's assume list for future.
    const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);

    // Approvals: key = "CONTRACT:id" or "INVOICE:id" -> list of steps (sorted by stepOrder)
    const [approvalMap, setApprovalMap] = useState<Record<string, ApprovalInfo[]>>({});
    const [reviewModal, setReviewModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
    const [reviewComment, setReviewComment] = useState('');

    // Modals
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any | null>(null);

    // Pay with Card (Stripe)
    const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
    const [payClientSecret, setPayClientSecret] = useState<string | null>(null);
    const [payLoading, setPayLoading] = useState(false);

    // Stats
    const totalOutstanding = invoices.filter(i => {
        const s = i.status?.toLowerCase();
        return s === 'issued' || s === 'overdue';
    }).reduce((acc, i) => acc + i.amount, 0);

    const totalPaid = invoices.filter(i => i.status?.toLowerCase() === 'paid').reduce((acc, i) => acc + i.amount, 0);
    const totalOverdue = invoices.filter(i => i.status?.toLowerCase() === 'overdue').reduce((acc, i) => acc + i.amount, 0);
    const normalizeContractStatus = (value?: string | null) => String(value || 'active').toLowerCase();

    // Fetch data wrapper
    const refreshData = async () => {
        if (onRefresh) {
            onRefresh();
        } else if (projectId) {
            // Fallback fetch if onRefresh not provided
            try {
                const cons = await api.projects.getContracts(projectId);
                setContracts(cons);
                const invs = await api.projects.getInvoices(projectId);
                setInvoices(invs);
            } catch (e) {
                console.error(e);
            }
        }
        loadApprovals();
    };

    const loadApprovals = () => {
        if (!projectId) return;
        api.approvals.listByProject(projectId).then((list: any[]) => {
            const map: Record<string, ApprovalInfo[]> = {};
            (list || []).forEach((a: any) => {
                const key = `${a.entityType}:${a.entityId}`;
                if (!map[key]) map[key] = [];
                map[key].push({
                    id: a.id,
                    status: a.status,
                    entityType: a.entityType,
                    entityId: a.entityId,
                    stepOrder: a.stepOrder,
                    approver: a.approver,
                    requestedBy: a.requestedBy,
                    reviewedBy: a.reviewedBy,
                    reviewedAt: a.reviewedAt,
                    comment: a.comment,
                });
            });
            Object.keys(map).forEach(k => map[k].sort((a, b) => (a.stepOrder ?? 1) - (b.stepOrder ?? 1)));
            setApprovalMap(map);
        }).catch(() => { });
    };

    useEffect(() => {
        loadApprovals();
    }, [projectId]);

    useEffect(() => {
        setContracts(initialContract ? [initialContract] : []);
        setInvoices(initialInvoices || []);
    }, [initialContract, initialInvoices]);

    const agreementDefaults = (editingItem?.agreementPayloadJson || {}) as Record<string, any>;

    // --- Handlers ---

    const handleCreateContract = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectId) return;
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            title: formData.get('title') as string,
            amount: parseFloat(formData.get('amount') as string),
            currency: 'SAR', // Default
            startDate: formData.get('startDate') as string,
            endDate: formData.get('endDate') as string || null,
            status: 'active',
            agreementLocale: formData.get('agreementLocale') as string || 'ar',
            agreementPayloadJson: {
                counterpartyName: (formData.get('counterpartyName') as string || '').trim() || undefined,
                counterpartyRepresentative: (formData.get('counterpartyRepresentative') as string || '').trim() || undefined,
                serviceDescription: (formData.get('serviceDescription') as string || '').trim() || undefined,
                paymentTerms: (formData.get('paymentTerms') as string || '').trim() || undefined,
                termDescription: (formData.get('termDescription') as string || '').trim() || undefined,
                governingLaw: (formData.get('governingLaw') as string || '').trim() || undefined,
                jurisdiction: (formData.get('jurisdiction') as string || '').trim() || undefined,
                specialTerms: (formData.get('specialTerms') as string || '').trim() || undefined,
                signerName: (formData.get('signerName') as string || '').trim() || undefined,
                signerTitle: (formData.get('signerTitle') as string || '').trim() || undefined,
                includeConfidentiality: formData.get('includeConfidentiality') === 'on',
                includeDataProtection: formData.get('includeDataProtection') === 'on',
                includeIntellectualProperty: formData.get('includeIntellectualProperty') === 'on',
                includeTermination: formData.get('includeTermination') === 'on',
                includeForceMajeure: formData.get('includeForceMajeure') === 'on',
                includeNotices: formData.get('includeNotices') === 'on',
                isBilingual: formData.get('isBilingual') === 'on',
            }
        };

        if (editingItem) {
            await api.projects.updateContract(projectId, editingItem.id, data);
        } else {
            await api.projects.createContract(projectId, data);
        }
        setEditingItem(null);
        setIsContractModalOpen(false);
        refreshData();
    };

    const handleDeleteContract = async (id: string) => {
        if (!projectId) return;
        const shouldDelete = await confirm({
            title: t('delete_contract') || 'Delete Contract',
            message: t('confirm_delete'),
            confirmText: t('delete') || 'Delete',
            cancelText: t('cancel') || 'Cancel',
            tone: 'danger',
        });
        if (!shouldDelete) return;
        await api.projects.deleteContract(projectId, id);
        refreshData();
    };

    const handleCreateInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectId) return;
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            invoiceNumber: formData.get('invoiceNumber') as string,
            amount: parseFloat(formData.get('amount') as string),
            dueDate: formData.get('dueDate') as string,
            currency: 'SAR',
            status: formData.get('status') as string || 'draft',
            contractId: formData.get('contractId') as string || undefined
        };

        if (editingItem) {
            await api.projects.updateInvoice(projectId, editingItem.id, data);
        } else {
            await api.projects.createInvoice(projectId, data);
        }
        setEditingItem(null);
        setIsInvoiceModalOpen(false);
        refreshData();
    };

    const handleDeleteInvoice = async (id: string) => {
        if (!projectId) return;
        const shouldDelete = await confirm({
            title: t('delete_invoice') || 'Delete Invoice',
            message: t('confirm_delete'),
            confirmText: t('delete') || 'Delete',
            cancelText: t('cancel') || 'Cancel',
            tone: 'danger',
        });
        if (!shouldDelete) return;
        await api.projects.deleteInvoice(projectId, id);
        refreshData();
    };

    const openEditContract = (c: Contract) => {
        setEditingItem(c);
        setIsContractModalOpen(true);
    }

    const openEditInvoice = (i: Invoice) => {
        setEditingItem(i);
        setIsInvoiceModalOpen(true);
    };

    const openPayModal = async (invoice: Invoice) => {
        if (!projectId) return;
        setPayInvoice(invoice);
        setPayClientSecret(null);
        setPayLoading(true);
        try {
            const { clientSecret } = await api.projects.createPaymentIntent(projectId, invoice.id);
            setPayClientSecret(clientSecret);
        } catch (e: any) {
            toast.error(e?.message || t('could_not_start_payment'));
            setPayInvoice(null);
        } finally {
            setPayLoading(false);
        }
    };

    const handleRequestApproval = async (entityType: 'CONTRACT' | 'INVOICE', entityId: string) => {
        if (!projectId) return;
        try {
            await api.approvals.create({ entityType, entityId, projectId });
            toast.success(t('approval_requested'));
            loadApprovals();
        } catch (e) {
            toast.error((e as Error).message);
        }
    };

    const handleApproveReject = async () => {
        if (!reviewModal) return;
        try {
            if (reviewModal.action === 'approve') await api.approvals.approve(reviewModal.id, reviewComment);
            else await api.approvals.reject(reviewModal.id, reviewComment);
            toast.success(reviewModal.action === 'approve' ? t('approved') : t('rejected'));
            setReviewModal(null);
            setReviewComment('');
            loadApprovals();
        } catch (e) {
            toast.error((e as Error).message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <DollarSign className="w-16 h-16 text-[hsl(var(--brand-success))]" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{t('total_paid')}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white"><SarSymbol /> {totalPaid.toLocaleString()}</span>
                        <span className="text-sm text-[hsl(var(--brand-success))]">+12%</span>
                    </div>
                </GlassCard>

                <GlassCard className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <FileText className="w-16 h-16 text-[hsl(var(--brand-warning))]" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{t('outstanding')}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white"><SarSymbol /> {totalOutstanding.toLocaleString()}</span>
                    </div>
                </GlassCard>

                <GlassCard className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Calendar className="w-16 h-16 text-rose-400" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{t('overdue')}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white"><SarSymbol /> {totalOverdue.toLocaleString()}</span>
                    </div>
                </GlassCard>
            </div>

            {/* Main Content Area */}
            <GlassCard className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex bg-slate-800/50 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveView('overview')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'overview' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            {t('overview')}
                        </button>
                        <button
                            onClick={() => setActiveView('contracts')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'contracts' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            {t('contracts_tab')}
                        </button>
                        <button
                            onClick={() => setActiveView('invoices')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeView === 'invoices' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            {t('invoices_tab')}
                        </button>
                    </div>

                    <div className="flex gap-2">
                        {activeView === 'contracts' && (
                            <PermissionGate permission={Permission.MANAGE_PROJECTS}>
                                <Button onClick={() => { setEditingItem(null); setIsContractModalOpen(true); }}>
                                    <Plus className="w-4 h-4 mr-2" /> {t('new_contract')}
                                </Button>
                            </PermissionGate>
                        )}
                        {activeView === 'invoices' && (
                            <PermissionGate permission={Permission.MANAGE_PROJECTS}>
                                <Button onClick={() => { setEditingItem(null); setIsInvoiceModalOpen(true); }}>
                                    <Plus className="w-4 h-4 mr-2" /> {t('new_invoice')}
                                </Button>
                            </PermissionGate>
                        )}
                    </div>
                </div>

                {/* Views */}
                {activeView === 'contracts' && (
                    <div className="space-y-4">
                        {contracts.length === 0 ? (
                            <div className="text-center py-10 text-slate-500">{t('no_contracts')}</div>
                        ) : (
                            contracts.map(contract => (
                                <div key={contract.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-white font-medium">{contract.title}</span>
                                            <span className="text-slate-400 text-sm">{format(new Date(contract.startDate), 'MMM dd, yyyy')} - {contract.endDate ? format(new Date(contract.endDate), 'MMM dd, yyyy') : t('no_end_date')}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <div className="text-white font-mono font-medium">{formatSAR(contract.amount)}</div>
                                            <div className="flex items-center gap-2 justify-end flex-wrap">
                                                {((): React.ReactNode => {
                                                    const steps = approvalMap[`CONTRACT:${contract.id}`] ?? [];
                                                    const pendingStep = steps.find((s: ApprovalInfo) => s.status === 'PENDING');
                                                    const overallStatus = steps.some((s: ApprovalInfo) => s.status === 'REJECTED') ? 'REJECTED' : steps.length > 0 && steps.every((s: ApprovalInfo) => s.status === 'APPROVED') ? 'APPROVED' : pendingStep ? 'PENDING' : null;
                                                    return (
                                                        <>
                                                            {overallStatus === 'PENDING' && <Badge variant="warning">{t('pending_approval')}{steps.length > 1 ? ` (${steps.findIndex((s: ApprovalInfo) => s.status === 'PENDING') + 1}/${steps.length})` : ''}</Badge>}
                                                            {overallStatus === 'APPROVED' && <Badge variant="success">{t('approved')}</Badge>}
                                                            {overallStatus === 'REJECTED' && <Badge variant="danger">{t('rejected')}</Badge>}
                                                            <Badge variant={normalizeContractStatus(contract.status) === 'active' ? 'success' : 'neutral'}>{normalizeContractStatus(contract.status)}</Badge>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <PermissionGate permission={Permission.MANAGE_PROJECTS}>
                                            <div className="flex gap-2 items-center">
                                                {((): React.ReactNode => {
                                                    const steps = approvalMap[`CONTRACT:${contract.id}`] ?? [];
                                                    const pendingStep = steps.find((s: ApprovalInfo) => s.status === 'PENDING');
                                                    const hasPending = !!pendingStep;
                                                    return (
                                                        <>
                                                            {hasPending && isInternalRole(user?.role) && (
                                                                <>
                                                                    <Button variant="ghost" size="sm" className="text-[hsl(var(--brand-success))]" onClick={() => setReviewModal({ id: pendingStep!.id, action: 'approve' })}><Check className="w-4 h-4" /></Button>
                                                                    <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => setReviewModal({ id: pendingStep!.id, action: 'reject' })}><X className="w-4 h-4" /></Button>
                                                                </>
                                                            )}
                                                            {!hasPending && (
                                                                <Button variant="ghost" size="sm" className="text-cyan-400" onClick={() => handleRequestApproval('CONTRACT', contract.id)}><Send className="w-4 h-4 mr-1" /> {t('request_approval')}</Button>
                                                            )}
                                                            {contract.agreementDownloadUrl && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-[hsl(var(--brand-success))]"
                                                                    onClick={() => window.open(contract.agreementDownloadUrl, '_blank', 'noopener,noreferrer')}
                                                                >
                                                                    <Download className="w-4 h-4 mr-1" /> {t('download')}
                                                                </Button>
                                                            )}
                                                            <Button variant="ghost" size="sm" onClick={() => openEditContract(contract)}><Edit className="w-4 h-4" /></Button>
                                                            <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300" onClick={() => handleDeleteContract(contract.id)}><Trash2 className="w-4 h-4" /></Button>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </PermissionGate>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeView === 'invoices' && (
                    <div className="space-y-4">
                        {invoices.length === 0 ? (
                            <div className="text-center py-10 text-slate-500">{t('no_invoices')}</div>
                        ) : (
                            invoices.map(invoice => (
                                <div key={invoice.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 hover:border-cyan-500/30 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-[hsl(var(--brand-success)/0.1)] rounded-lg text-[hsl(var(--brand-success))]">
                                            <DollarSign className="w-6 h-6" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-white font-medium">{invoice.invoiceNumber}</span>
                                            <span className="text-slate-400 text-sm">Due {format(new Date(invoice.dueDate), 'MMM dd, yyyy')}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <div className="text-white font-mono font-medium">{formatSAR(invoice.amount)}</div>
                                            <div className="flex items-center gap-2 justify-end flex-wrap">
                                                {((): React.ReactNode => {
                                                    const steps = approvalMap[`INVOICE:${invoice.id}`] ?? [];
                                                    const pendingStep = steps.find((s: ApprovalInfo) => s.status === 'PENDING');
                                                    const overallStatus = steps.some((s: ApprovalInfo) => s.status === 'REJECTED') ? 'REJECTED' : steps.length > 0 && steps.every((s: ApprovalInfo) => s.status === 'APPROVED') ? 'APPROVED' : pendingStep ? 'PENDING' : null;
                                                    return (
                                                        <>
                                                            {overallStatus === 'PENDING' && <Badge variant="warning">{t('pending_approval')}{steps.length > 1 ? ` (step ${steps.findIndex((s: ApprovalInfo) => s.status === 'PENDING') + 1}/${steps.length})` : ''}</Badge>}
                                                            {overallStatus === 'APPROVED' && <Badge variant="success">{t('approved')}</Badge>}
                                                            {overallStatus === 'REJECTED' && <Badge variant="danger">{t('rejected')}</Badge>}
                                                            <Badge variant={
                                                                invoice.status?.toLowerCase() === 'paid' ? 'success' :
                                                                    invoice.status?.toLowerCase() === 'overdue' ? 'danger' :
                                                                        ['issued', 'sent'].includes(invoice.status?.toLowerCase() || '') ? 'warning' : 'neutral'
                                                            }>{invoice.status?.toLowerCase()}</Badge>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <PermissionGate permission={Permission.MANAGE_PROJECTS}>
                                            <div className="flex gap-2 items-center">
                                                {((): React.ReactNode => {
                                                    const steps = approvalMap[`INVOICE:${invoice.id}`] ?? [];
                                                    const pendingStep = steps.find((s: ApprovalInfo) => s.status === 'PENDING');
                                                    const hasPending = !!pendingStep;
                                                    return (
                                                        <>
                                                            {hasPending && isInternalRole(user?.role) && (
                                                                <>
                                                                    <Button variant="ghost" size="sm" className="text-[hsl(var(--brand-success))]" onClick={() => setReviewModal({ id: pendingStep!.id, action: 'approve' })}><Check className="w-4 h-4" /></Button>
                                                                    <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => setReviewModal({ id: pendingStep!.id, action: 'reject' })}><X className="w-4 h-4" /></Button>
                                                                </>
                                                            )}
                                                            {!hasPending && (
                                                                <Button variant="ghost" size="sm" className="text-cyan-400" onClick={() => handleRequestApproval('INVOICE', invoice.id)}><Send className="w-4 h-4 mr-1" /> {t('request_approval')}</Button>
                                                            )}
                                                            {(invoice.status === 'issued' || invoice.status === 'ISSUED') && (
                                                                <Button variant="ghost" size="sm" className="text-[hsl(var(--brand-success))]" onClick={() => openPayModal(invoice)} disabled={payLoading}><CreditCard className="w-4 h-4 mr-1" /> {t('pay_with_card')}</Button>
                                                            )}
                                                            <Button variant="ghost" size="sm" onClick={() => openEditInvoice(invoice)}><Edit className="w-4 h-4" /></Button>
                                                            <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300" onClick={() => handleDeleteInvoice(invoice.id)}><Trash2 className="w-4 h-4" /></Button>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </PermissionGate>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeView === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Simplified Overview */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium text-white">{t('recent_invoices_short')}</h3>
                            {invoices.slice(0, 5).map(i => (
                                <div key={i.id} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-0">
                                    <div>
                                        <p className="text-sm text-slate-300">{i.invoiceNumber}</p>
                                        <p className="text-xs text-slate-500">{format(new Date(i.dueDate), 'MMM dd')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-white">{formatSAR(i.amount)}</p>
                                        <span className={`text-xs ${i.status?.toLowerCase() === 'paid' ? 'text-[hsl(var(--brand-success))]' : i.status?.toLowerCase() === 'overdue' ? 'text-rose-400' : 'text-[hsl(var(--brand-warning))]'}`}>{i.status?.toLowerCase()}</span>
                                    </div>
                                </div>
                            ))}
                            {invoices.length === 0 && <p className="text-slate-500 text-sm">{t('no_recent_invoices')}</p>}
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium text-white">{t('contracts')}</h3>
                            {contracts.slice(0, 3).map(c => (
                                <div key={c.id} className="p-4 bg-slate-800/40 rounded border border-slate-700">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-slate-300 font-medium">{c.title}</span>
                                        <Badge size="sm" variant="info">{c.status}</Badge>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="text-xs text-slate-500">
                                            {format(new Date(c.startDate), 'MMM dd')} - {c.endDate ? format(new Date(c.endDate), 'MMM dd, yyyy') : t('perpetual')}
                                        </div>
                                        <div className="text-lg font-bold text-white"><SarSymbol /> {c.amount.toLocaleString()}</div>
                                    </div>
                                </div>
                            ))}
                            {contracts.length === 0 && <p className="text-slate-500 text-sm">{t('no_active_contracts')}</p>}
                        </div>
                    </div>
                )}
            </GlassCard>

            {/* Contract Modal */}
            <Modal isOpen={isContractModalOpen} onClose={() => setIsContractModalOpen(false)} title={editingItem ? t('edit_contract') : t('new_contract')}>
                <form onSubmit={handleCreateContract} className="space-y-4">
                    <Input name="title" label={t('contract_title')} defaultValue={editingItem?.title} required />
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="amount" type="number" label={t('amount_sar')} defaultValue={editingItem?.amount} required />
                        <Select name="status" label={t('status')} defaultValue={normalizeContractStatus(editingItem?.status)}>
                            <option value="active">{t('active')}</option>
                            <option value="completed">{t('completed')}</option>
                            <option value="cancelled">{t('cancelled') || 'Cancelled'}</option>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="startDate" type="date" label={t('start_date')} defaultValue={editingItem?.startDate ? new Date(editingItem.startDate).toISOString().split('T')[0] : ''} required />
                        <Input name="endDate" type="date" label={t('end_date')} defaultValue={editingItem?.endDate ? new Date(editingItem.endDate).toISOString().split('T')[0] : ''} />
                    </div>
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-white">Agreement Builder</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Fill these fields to generate a Saudi-law agreement draft with automated PDF output.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Select name="agreementLocale" label="Agreement Language" defaultValue={agreementDefaults.agreementLocale || 'ar'}>
                                <option value="ar">Arabic</option>
                                <option value="en">English</option>
                            </Select>
                            <Input name="counterpartyName" label="Counterparty Legal Name" defaultValue={agreementDefaults.counterpartyName || ''} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input name="counterpartyRepresentative" label="Counterparty Representative" defaultValue={agreementDefaults.counterpartyRepresentative || ''} />
                            <Input name="signerName" label="Your Signatory Name" defaultValue={agreementDefaults.signerName || ''} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input name="signerTitle" label="Your Signatory Title" defaultValue={agreementDefaults.signerTitle || ''} />
                            <Input name="jurisdiction" label="Jurisdiction" defaultValue={agreementDefaults.jurisdiction || 'The competent courts of Saudi Arabia'} />
                        </div>
                        <Input name="governingLaw" label="Governing Law" defaultValue={agreementDefaults.governingLaw || 'The laws and regulations of the Kingdom of Saudi Arabia'} />
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Service Description</label>
                            <textarea
                                name="serviceDescription"
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                                defaultValue={agreementDefaults.serviceDescription || ''}
                                placeholder="Describe the work, deliverables, and scope to appear in the agreement."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Payment Terms</label>
                            <textarea
                                name="paymentTerms"
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                                defaultValue={agreementDefaults.paymentTerms || ''}
                                placeholder="Installments, milestones, invoicing cadence, late fees, or other payment terms."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Term Description</label>
                            <textarea
                                name="termDescription"
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                                defaultValue={agreementDefaults.termDescription || ''}
                                placeholder="Describe the contract term or milestones."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Special Terms</label>
                            <textarea
                                name="specialTerms"
                                rows={4}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                                defaultValue={agreementDefaults.specialTerms || ''}
                                placeholder="Any optional legal or commercial clauses."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="includeConfidentiality" defaultChecked={agreementDefaults.includeConfidentiality !== false} />
                                Include confidentiality
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="includeDataProtection" defaultChecked={agreementDefaults.includeDataProtection !== false} />
                                Include data protection
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="includeIntellectualProperty" defaultChecked={agreementDefaults.includeIntellectualProperty !== false} />
                                Include intellectual property
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="includeTermination" defaultChecked={agreementDefaults.includeTermination !== false} />
                                Include termination
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="includeForceMajeure" defaultChecked={agreementDefaults.includeForceMajeure !== false} />
                                Include force majeure
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="includeNotices" defaultChecked={agreementDefaults.includeNotices !== false} />
                                Include notices
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" name="isBilingual" defaultChecked={agreementDefaults.isBilingual !== false} />
                                Generate bilingual agreement
                            </label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button type="button" variant="ghost" onClick={() => setIsContractModalOpen(false)}>{t('cancel')}</Button>
                        <Button type="submit" variant="primary">{t('save_contract')}</Button>
                    </div>
                </form>
            </Modal>

            {/* Invoice Modal */}
            <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title={editingItem ? t('edit_invoice') : t('new_invoice')}>
                <form onSubmit={handleCreateInvoice} className="space-y-4">
                    <Input name="invoiceNumber" label={t('invoice_number')} placeholder="e.g. INV-2026-001" defaultValue={editingItem?.invoiceNumber} required />
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="amount" type="number" step="0.01" label={t('amount_sar')} defaultValue={editingItem?.amount} required />
                        <Input name="dueDate" type="date" label={t('due_date')} defaultValue={editingItem?.dueDate ? new Date(editingItem.dueDate).toISOString().split('T')[0] : ''} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{t('status')}</label>
                        <select name="status" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" defaultValue={editingItem?.status || 'draft'}>
                            <option value="draft">{t('draft')}</option>
                            <option value="issued">{t('issued')}</option>
                            <option value="paid">{t('paid')}</option>
                            <option value="overdue">{t('overdue')}</option>
                        </select>
                    </div>
                    {/* Optional Contract Link */}
                    {contracts.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('link_to_contract_optional')}</label>
                            <select name="contractId" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" defaultValue={editingItem?.contractId || ''}>
                                <option value="">{t('none')}</option>
                                {contracts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 mt-6">
                        <Button type="button" variant="ghost" onClick={() => setIsInvoiceModalOpen(false)}>{t('cancel')}</Button>
                        <Button type="submit" variant="primary">{t('save_invoice')}</Button>
                    </div>
                </form>
            </Modal>

            {reviewModal && (
                <Modal isOpen={!!reviewModal} onClose={() => { setReviewModal(null); setReviewComment(''); }} title={reviewModal.action === 'approve' ? t('approve_request') : t('reject_request')}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">{t('comment_optional')}</label>
                            <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none" placeholder={t('add_comment_placeholder')} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => { setReviewModal(null); setReviewComment(''); }}>{t('cancel')}</Button>
                            <Button variant={reviewModal.action === 'reject' ? 'danger' : 'primary'} onClick={handleApproveReject}>
                                {reviewModal.action === 'approve' ? t('approve') : t('reject')}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {payInvoice && (
                <Modal
                    isOpen={!!payInvoice}
                    onClose={() => { setPayInvoice(null); setPayClientSecret(null); }}
                    title={`${t('pay_invoice_title')} ${payInvoice.invoiceNumber} — ${formatSAR(payInvoice.amount)}`}
                >
                    {!stripePk ? (
                        <p className="text-slate-400 text-sm">{t('configure_stripe')}</p>
                    ) : payLoading || !payClientSecret ? (
                        <p className="text-slate-400">{t('preparing_payment')}</p>
                    ) : (
                        <Elements stripe={loadStripe(stripePk)} options={{ clientSecret: payClientSecret }}>
                            <PaymentForm
                                onSuccess={() => {
                                    toast.success(t('payment_successful'));
                                    setPayInvoice(null);
                                    setPayClientSecret(null);
                                    refreshData();
                                }}
                                onClose={() => { setPayInvoice(null); setPayClientSecret(null); }}
                            />
                        </Elements>
                    )}
                </Modal>
            )}
        </div>
    );
};

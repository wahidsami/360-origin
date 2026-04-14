import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { Lock, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

const AcceptInvite: React.FC = () => {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setError(t('invalid_invite_link_missing_token'));
        }
    }, [t, token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError(t('passwords_do_not_match'));
            return;
        }
        if (password.length < 6) {
            setError(t('password_min_length'));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await api.auth.acceptInvite(token!, password);
            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            console.error(err);
            setError(err.message || t('failed_to_set_password_link_may_be_expired'));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-[hsl(var(--brand-success)/0.2)] rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-8 h-8 text-[hsl(var(--brand-success))]" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">{t('account_activated')}</h2>
                    <p className="text-slate-400 mb-6">{t('password_set_successfully_use_email_login')}</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2.5 rounded-lg transition-colors"
                    >
                        {t('go_to_login')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md w-full relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-8 justify-center">
                        <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-white text-lg">A</span>
                        </div>
                        <span className="text-xl font-bold text-white">Arena 360</span>
                    </div>

                    <h2 className="text-xl font-semibold text-white mb-2">{t('set_your_password')}</h2>
                    <p className="text-slate-400 text-sm mb-6">
                        {t('complete_account_setup')}
                    </p>

                    {error && (
                        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-rose-200">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('new_password')}</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    placeholder={t('min_6_characters')}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('confirm_password')}</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    placeholder={t('re_enter_password')}
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !token}
                            className={`w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 ${loading || !token ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? t('activating_dots') : t('activate_account')}
                            {!loading && <ArrowRight className="w-4 h-4" />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AcceptInvite;

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';
import { api } from '../services/api';

const Login: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const { login, loginWith2fa } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [orgSlug, setOrgSlug] = useState('');
  const [publicOrg, setPublicOrg] = useState<{
    name: string; logo: string | null; primaryColor: string | null;
    accentColor: string | null; slug: string; sso: { saml: boolean; google: boolean }
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step2fa, setStep2fa] = useState<string | null>(null);
  const [code2fa, setCode2fa] = useState('');
  const loginLogoSrc = publicOrg?.logo || '/arenalogo.png';
  const loginLogoAlt = `${publicOrg?.name ?? 'Arena 360'} logo`;
  const orgIdentifier = publicOrg?.slug || orgSlug.trim();

  const buildSsoUrl = (provider: 'google' | 'saml') => {
    if (!orgIdentifier) return '';
    const params = new URLSearchParams({ org: orgIdentifier });
    return `${api.getBaseUrl()}/auth/sso/${provider}?${params.toString()}`;
  };

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) setError(decodeURIComponent(err));
    const org = searchParams.get('org');
    if (org) setOrgSlug(org);
  }, [searchParams]);

  useEffect(() => {
    if (!orgSlug.trim()) { setPublicOrg(null); return; }
    let cancelled = false;
    api.public.getOrgBySlug(orgSlug.trim())
      .then((data) => { if (!cancelled) setPublicOrg(data ?? null); })
      .catch(() => { if (!cancelled) setPublicOrg(null); });
    return () => { cancelled = true; };
  }, [orgSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await login(email, password);
      navigate('/app/dashboard');
    } catch (err: any) {
      if (err.requires2fa && err.challenge) { setStep2fa(err.challenge); setError(null); }
      else setError(err.message || 'Authentication failed');
    } finally { setLoading(false); }
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2fa || !code2fa.trim()) return;
    setLoading(true); setError(null);
    try {
      await loginWith2fa(step2fa, code2fa.trim());
      navigate('/app/dashboard');
    } catch (err: any) { setError(err.message || 'Invalid code'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <style>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-20px) translateX(10px); }
        }
        @keyframes float-reverse {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(15px) translateX(-15px); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in-right {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-gradient { background-size: 200% 200%; animation: gradient-x 15s ease infinite; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-reverse { animation: float-reverse 8s ease-in-out infinite; }
        .animate-fade-in-up { animation: fade-in-up 0.6s ease-out forwards; }
        .animate-fade-in-up-delay { animation: fade-in-up 0.6s ease-out 0.1s forwards; opacity: 0; }
        .animate-fade-in-up-delay2 { animation: fade-in-up 0.6s ease-out 0.2s forwards; opacity: 0; }
        .animate-fade-in-right { animation: fade-in-right 0.8s ease-out 0.3s forwards; opacity: 0; }
      `}</style>

      <div className={`flex h-screen overflow-hidden ${isArabic ? 'font-brand-ar' : 'font-brand-en'}`}>

        {/* ═══ LEFT PANEL — Login Form (40%) ═══ */}
        <div className="w-full md:w-2/5 bg-slate-950 flex flex-col justify-between p-8 lg:p-12 min-h-screen overflow-auto">

          {/* Top Logo — h-12 (48px) */}
          <div className="flex items-center gap-3 animate-fade-in-up mb-8 p-4">
            <img src={loginLogoSrc} className="h-14 w-auto object-contain" alt={loginLogoAlt} />
            <span className="text-xl font-bold text-white">{publicOrg?.name ?? 'Arena 360'}</span>
          </div>

          {/* Login Form — centered */}
          <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center">

            {/* Heading */}
            <div className="animate-fade-in-up">
              <h1 className="text-3xl font-bold text-white mb-2">
                {step2fa ? t('login_2fa_title') : t('login_title')}
              </h1>
              <p className="text-base text-[var(--text-muted)] mb-8 font-medium">
                {step2fa ? t('login_2fa_subtitle') : t('login_form_subtitle')}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-sm text-rose-600 font-medium mb-6 animate-fade-in-up">
                {error}
              </div>
            )}

            {step2fa ? (
              <form onSubmit={handle2faSubmit} className="space-y-6 animate-fade-in-up-delay">
                <div>
                  <label className="block text-sm font-semibold text-white uppercase tracking-wide mb-2 opacity-80">{t('verification_code')}</label>
                  <input
                    type="text" inputMode="numeric" autoComplete="one-time-code"
                    value={code2fa}
                    onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input w-full h-12 px-4 text-center text-2xl font-bold tracking-[0.3em] focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] focus:scale-[1.01] focus:shadow-lg transition-all duration-200 outline-none"
                    placeholder="000000" maxLength={6}
                  />
                </div>
                <button type="submit" disabled={loading || code2fa.length !== 6}
                  className="btn-primary w-full h-12 font-semibold text-base rounded-xl hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100">
                  {loading ? t('verifying') : t('verify_code')}
                </button>
                <button type="button" onClick={() => { setStep2fa(null); setCode2fa(''); setError(null); }}
                  className="w-full text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors">
                  &larr; {t('back_to_login')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmit}>
                {publicOrg && (publicOrg.sso.google || publicOrg.sso.saml) && orgIdentifier && (
                  <div className="mb-6 animate-fade-in-up-delay">
                    <div className="space-y-3">
                      {publicOrg.sso.google && (
                        <a
                          href={buildSsoUrl('google')}
                          className="w-full h-12 px-4 rounded-xl border border-slate-700 bg-slate-900/70 text-white font-semibold flex items-center justify-center gap-2 hover:border-cyan-400/50 hover:bg-slate-900 transition-all duration-300"
                        >
                          Continue with Google Workspace
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {publicOrg.sso.saml && (
                        <a
                          href={buildSsoUrl('saml')}
                          className="w-full h-12 px-4 rounded-xl border border-slate-700 bg-slate-900/70 text-white font-semibold flex items-center justify-center gap-2 hover:border-cyan-400/50 hover:bg-slate-900 transition-all duration-300"
                        >
                          Continue with SAML SSO
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 my-6">
                      <div className="h-px flex-1 bg-slate-800" />
                      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500 font-semibold">or sign in with email</span>
                      <div className="h-px flex-1 bg-slate-800" />
                    </div>
                  </div>
                )}

                {/* Email */}
                <div className="mb-6 animate-fade-in-up-delay">
                  <label className="block text-sm font-semibold text-white uppercase tracking-wide mb-2 opacity-80">{t('email_address')}</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    className="input w-full h-12 px-4 text-base placeholder-slate-400 focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] focus:scale-[1.01] focus:shadow-lg transition-all duration-200 outline-none"
                  />
                </div>

                {/* Password */}
                <div className="mb-6 animate-fade-in-up-delay2">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-white uppercase tracking-wide opacity-80">{t('password_label')}</label>
                    <a href="/forgot-password" className="text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors">{t('forgot_password')}</a>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
                      className="input w-full h-12 px-4 pr-12 text-base placeholder-slate-400 focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--ring))] focus:scale-[1.01] focus:shadow-lg transition-all duration-200 outline-none"
                      placeholder="••••••"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <div className="animate-fade-in-up-delay2">
                  <button type="submit" disabled={loading}
                    className="btn-primary w-full h-12 font-semibold text-base rounded-xl hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                        {t('signing_in')}
                      </span>
                    ) : t('enter_system') || 'Enter System'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Powered By — large, visible, in normal flow */}
          <div className="flex items-center justify-start mt-8">
            <img src="/poweredby.png" className="h-40 object-contain theme-poweredby-logo" alt="Powered by" />
          </div>
        </div>

        {/* ═══ RIGHT PANEL — Branding (60%) ═══ */}
        <div
          className="hidden md:flex md:w-3/5 relative overflow-hidden bg-cover bg-center"
          style={{ backgroundImage: "url('/MainImage.jpeg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/25 via-blue-600/25 to-indigo-600/30" />

        </div>
      </div>
    </>
  );
};

export default Login;

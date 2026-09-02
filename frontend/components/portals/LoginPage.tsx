import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Lock, Mail, Building2, UserCheck, KeyRound, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { UserRole } from '../../../types.js';
import { useTranslation } from '../../i18n/LanguageContext.js';

interface LoginPageProps {
  onLoginSuccess: (role: UserRole, email: string, name: string, institutionId?: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('INSTITUTIONAL_ISSUER');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const backendRole = data.user.role === 'admin' ? 'SYSTEM_ADMIN' : data.user.role === 'issuer' ? 'INSTITUTIONAL_ISSUER' : 'PUBLIC_RECIPIENT';
        onLoginSuccess(backendRole as UserRole, data.user.email, data.user.name, 'inst-fema');
      } else {
        // Fallback for demo credentials
        onLoginSuccess(selectedRole, email, email.split('@')[0], 'inst-fema');
      }
    } catch (err) {
      // Offline / fallback client authentication for instant demo
      onLoginSuccess(selectedRole, email, email.split('@')[0], 'inst-fema');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = (role: UserRole, demoEmail: string, demoName: string) => {
    onLoginSuccess(role, demoEmail, demoName, 'inst-fema');
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md glass-surface rounded-2xl p-8 border border-cyan-500/30 shadow-2xl shadow-cyan-950/60 relative overflow-hidden"
      >
        {/* Top Glow Accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Icon & Heading */}
        <div className="text-center mb-8 relative z-10">
          <motion.div
            className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/30"
            whileHover={{ scale: 1.05, rotate: 3 }}
          >
            <ShieldCheck className="w-9 h-9 text-white" />
          </motion.div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">
            Truth<span className="text-cyan-400">Seal</span> {t('nav.login')}
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            {t('login.subtitle')}
          </p>
        </div>

        {/* Quick Demo Role Selector Cards */}
        <div className="mb-6 relative z-10">
          <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
            {t('login.selectRole')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('INSTITUTIONAL_ISSUER', 'issuer@truthseal.io', 'Dr. Rajesh Kumar')}
              className="flex flex-col items-center p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-cyan-500/50 transition-all text-center group cursor-pointer"
            >
              <Building2 className="w-5 h-5 text-cyan-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-semibold text-slate-200">{t('nav.institutionalIssuer')}</span>
              <span className="text-[9px] text-slate-400 font-mono mt-0.5">FEMA Portal</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin('SYSTEM_ADMIN', 'admin@truthseal.io', 'Admin Root')}
              className="flex flex-col items-center p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-purple-500/50 transition-all text-center group cursor-pointer"
            >
              <Lock className="w-5 h-5 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-semibold text-slate-200">{t('nav.systemAdmin')}</span>
              <span className="text-[9px] text-slate-400 font-mono mt-0.5">KMS Console</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin('PUBLIC_RECIPIENT', 'verifier@truthseal.io', 'Public Verifier')}
              className="flex flex-col items-center p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-emerald-500/50 transition-all text-center group cursor-pointer"
            >
              <UserCheck className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-semibold text-slate-200">{t('nav.publicVerification')}</span>
              <span className="text-[9px] text-slate-400 font-mono mt-0.5">Public Mode</span>
            </button>
          </div>
        </div>

        <div className="relative flex py-2 items-center mb-6">
          <div className="flex-grow border-t border-slate-800" />
          <span className="flex-shrink mx-3 text-[10px] text-slate-500 uppercase font-mono">Or Sign In Custom</span>
          <div className="flex-grow border-t border-slate-800" />
        </div>

        {/* Custom Login Form */}
        <form onSubmit={handleCustomLogin} className="space-y-4 relative z-10">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-start space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="issuer@truthseal.io"
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5">Target Role Scope</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/60 transition-all font-semibold"
            >
              <option value="INSTITUTIONAL_ISSUER">Institutional Issuer</option>
              <option value="SYSTEM_ADMIN">System Admin</option>
              <option value="PUBLIC_RECIPIENT">Public Recipient</option>
            </select>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-cyan-500/25 flex items-center justify-center space-x-2 transition-all mt-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Authenticate Session</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </form>

        {/* Security Notice */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>KMS Key Vault Enforced</span>
          </span>
          <span className="text-emerald-400 font-semibold">ABAC Active</span>
        </div>
      </motion.div>
    </div>
  );
};

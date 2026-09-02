import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Building2, Lock, Search, LogOut, User } from 'lucide-react';
import { UserRole, Institution } from '../../../types.js';
import { useTranslation } from '../../i18n/LanguageContext.js';
import { LanguageSelector } from './LanguageSelector.js';

interface NavbarProps {
  currentTab: 'verify' | 'issuer' | 'admin' | 'architecture';
  setTab: (tab: 'verify' | 'issuer' | 'admin' | 'architecture') => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  institutions: Institution[];
  selectedInstitutionId: string;
  setSelectedInstitutionId: (id: string) => void;
  onLogout?: () => void;
  userEmail?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setTab,
  userRole,
  setUserRole,
  institutions,
  selectedInstitutionId,
  setSelectedInstitutionId,
  onLogout,
  userEmail,
}) => {
  const { t } = useTranslation();

  const tabs = [
    { id: 'verify' as const, label: t('nav.publicVerification'), icon: Search },
    { id: 'issuer' as const, label: t('nav.institutionalIssuer'), icon: Building2 },
    { id: 'admin' as const, label: t('nav.systemAdmin'), icon: Lock },
  ];

  const handleTabClick = (tabId: 'verify' | 'issuer' | 'admin' | 'architecture') => {
    setTab(tabId);
    if (tabId === 'issuer') {
      setUserRole('INSTITUTIONAL_ISSUER');
    } else if (tabId === 'admin') {
      setUserRole('SYSTEM_ADMIN');
    } else if (tabId === 'verify') {
      setUserRole('PUBLIC_RECIPIENT');
    }
  };

  const handleRoleChange = (newRole: UserRole) => {
    setUserRole(newRole);
    if (newRole === 'INSTITUTIONAL_ISSUER') {
      setTab('issuer');
    } else if (newRole === 'SYSTEM_ADMIN') {
      setTab('admin');
    } else if (newRole === 'PUBLIC_RECIPIENT') {
      setTab('verify');
    }
  };

  return (
    <header className="glass-surface border-b border-slate-800 text-slate-100 sticky top-0 z-50 shadow-lg shadow-slate-950/40">
      {/* Top Tier: Brand Logo, Navigation Tabs & User Profile / Logout */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-800/60">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Brand Logo & Title */}
          <motion.div
            className="flex items-center space-x-2.5 cursor-pointer group shrink-0"
            onClick={() => handleTabClick('verify')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 animate-pulse-glow group-hover:shadow-cyan-400/40 transition-all duration-300 shrink-0">
              <ShieldCheck className="w-4 h-4 text-white transition-transform group-hover:rotate-6 duration-300" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent font-heading whitespace-nowrap">
                Truth<span className="text-cyan-400">Seal</span>
              </span>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 shadow-inner flex items-center gap-1 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                Authenticity Engine
              </span>
            </div>
          </motion.div>

          {/* Navigation Links with Sliding Motion Indicator */}
          <nav className="hidden md:flex items-center space-x-1 sm:space-x-2 relative shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                  className={`relative px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 flex items-center space-x-1.5 whitespace-nowrap shrink-0 ${
                    isActive ? 'text-cyan-300 font-semibold' : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabGlow"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-950/90 to-indigo-950/90 border border-cyan-500/50 shadow-md shadow-cyan-950/80"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center space-x-1.5 whitespace-nowrap">
                    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform duration-200 ${isActive ? 'text-cyan-400 scale-110' : ''}`} />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Upward Top-Tier User Profile Badge & Logout Action */}
          <div className="flex items-center space-x-2 shrink-0">
            {userEmail && (
              <div className="flex items-center space-x-2 text-xs font-mono bg-slate-900/80 border border-slate-800 px-3 h-[32px] rounded-xl text-slate-300">
                <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-slate-200 font-medium">{userEmail}</span>
              </div>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign Out"
                className="w-[32px] h-[32px] flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-950/40 transition-all cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Downward Tier 2: Sub-Bar for Operational Selectors (Language, Role, Institution) */}
      <div className="w-full bg-slate-950/70 border-b border-slate-800/80 py-1.5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2.5">
          {/* Mobile Nav Tabs fallback if screen is small */}
          <nav className="flex md:hidden items-center space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center space-x-1 ${
                    isActive ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-400'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Operational Selectors */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Multilingual Language Selector */}
            <LanguageSelector />

            {/* Operational Role Selector */}
            <motion.div
              className="h-[32px] flex items-center space-x-2 glass-surface border border-slate-800 px-2.5 rounded-xl text-xs shadow-inner"
              whileHover={{ borderColor: 'rgba(6, 182, 212, 0.4)' }}
            >
              <span className="text-slate-400 font-mono font-medium">{t('nav.role')}:</span>
              <select
                id="select-user-role"
                value={userRole}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                className="bg-slate-900/90 border border-slate-700/80 text-cyan-300 text-xs rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold transition-all cursor-pointer"
              >
                <option value="PUBLIC_RECIPIENT">{t('nav.publicVerification')}</option>
                <option value="INSTITUTIONAL_ISSUER">{t('nav.institutionalIssuer')}</option>
                <option value="SYSTEM_ADMIN">{t('nav.systemAdmin')}</option>
              </select>
            </motion.div>

            {/* Active Institution Selector */}
            {userRole === 'INSTITUTIONAL_ISSUER' && institutions.length > 0 && (
              <motion.div
                className="h-[32px] flex items-center space-x-2 glass-surface border border-slate-800 px-2.5 rounded-xl text-xs shadow-inner"
                whileHover={{ borderColor: 'rgba(99, 102, 241, 0.4)' }}
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <select
                  id="select-active-institution"
                  value={selectedInstitutionId}
                  onChange={(e) => setSelectedInstitutionId(e.target.value)}
                  className="bg-slate-900/90 border border-slate-700/80 text-indigo-300 text-xs rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-all cursor-pointer max-w-[280px] sm:max-w-[380px] truncate"
                >
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

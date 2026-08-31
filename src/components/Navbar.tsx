import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Building2, Lock, Cpu, Search } from 'lucide-react';
import { UserRole, Institution } from '../types.js';

interface NavbarProps {
  currentTab: 'verify' | 'issuer' | 'admin' | 'architecture';
  setTab: (tab: 'verify' | 'issuer' | 'admin' | 'architecture') => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  institutions: Institution[];
  selectedInstitutionId: string;
  setSelectedInstitutionId: (id: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setTab,
  userRole,
  setUserRole,
  institutions,
  selectedInstitutionId,
  setSelectedInstitutionId,
}) => {
  const tabs = [
    { id: 'verify' as const, label: 'Public Verification', icon: Search },
    { id: 'issuer' as const, label: 'Institutional Issuer', icon: Building2 },
    { id: 'admin' as const, label: 'System Admin', icon: Lock },
    { id: 'architecture' as const, label: 'Functions & Architecture', icon: Cpu },
  ];

  return (
    <header className="glass-surface border-b border-slate-800 text-slate-100 sticky top-0 z-50 shadow-lg shadow-slate-950/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <motion.div
            className="flex items-center space-x-3 cursor-pointer group"
            onClick={() => setTab('verify')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 animate-pulse-glow group-hover:shadow-cyan-400/40 transition-all duration-300">
              <ShieldCheck className="w-6 h-6 text-white transition-transform group-hover:rotate-6 duration-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent font-heading">
                  Truth<span className="text-cyan-400">Seal</span>
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 shadow-inner flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                  Authenticity Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Institutional Cryptographic Provenance Platform</p>
            </div>
          </motion.div>

          {/* Navigation Links with Sliding Motion Indicator */}
          <nav className="hidden md:flex items-center space-x-1 relative">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setTab(tab.id)}
                  className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center space-x-1.5 ${
                    isActive ? 'text-cyan-300 font-semibold' : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabGlow"
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-950/90 to-indigo-950/90 border border-cyan-500/50 shadow-md shadow-cyan-950/80"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center space-x-1.5">
                    <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? 'text-cyan-400 scale-110' : ''}`} />
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Active Role Switcher */}
          <div className="flex items-center space-x-3">
            <motion.div
              className="flex items-center space-x-2 glass-surface border border-slate-800 px-3 py-1.5 rounded-xl text-xs shadow-inner"
              whileHover={{ borderColor: 'rgba(6, 182, 212, 0.4)' }}
            >
              <span className="text-slate-400 font-mono font-medium">Role:</span>
              <select
                id="select-user-role"
                value={userRole}
                onChange={(e) => {
                  const r = e.target.value as UserRole;
                  setUserRole(r);
                  if (r === 'INSTITUTIONAL_ISSUER' && currentTab === 'verify') {
                    setTab('issuer');
                  } else if (r === 'SYSTEM_ADMIN' && currentTab === 'verify') {
                    setTab('admin');
                  }
                }}
                className="bg-slate-900/90 border border-slate-700/80 text-cyan-300 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold transition-all"
              >
                <option value="PUBLIC_RECIPIENT">Public Recipient</option>
                <option value="INSTITUTIONAL_ISSUER">Institutional Issuer</option>
                <option value="SYSTEM_ADMIN">System Admin</option>
              </select>

              {userRole === 'INSTITUTIONAL_ISSUER' && institutions.length > 0 && (
                <select
                  id="select-active-institution"
                  value={selectedInstitutionId}
                  onChange={(e) => setSelectedInstitutionId(e.target.value)}
                  className="bg-slate-900/90 border border-slate-700/80 text-indigo-300 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[160px] truncate font-medium transition-all"
                >
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name.split('(')[0] || inst.name}
                    </option>
                  ))}
                </select>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </header>
  );
};


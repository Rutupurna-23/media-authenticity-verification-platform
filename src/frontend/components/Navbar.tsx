import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Building2, Lock, Cpu, Search, LogOut, User } from 'lucide-react';
import { UserRole, Institution } from '../../types.js';

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
  const tabs = [
    { id: 'verify' as const, label: 'Public Verification', icon: Search },
    { id: 'issuer' as const, label: 'Institutional Issuer', icon: Building2 },
    { id: 'admin' as const, label: 'System Admin', icon: Lock },
    { id: 'architecture' as const, label: 'Functions & Architecture', icon: Cpu },
  ];

  const handleTabClick = (tabId: 'verify' | 'issuer' | 'admin' | 'architecture') => {
    setTab(tabId);
    if (tabId === 'issuer' && userRole === 'PUBLIC_RECIPIENT') {
      setUserRole('INSTITUTIONAL_ISSUER');
    } else if (tabId === 'admin' && userRole === 'PUBLIC_RECIPIENT') {
      setUserRole('SYSTEM_ADMIN');
    } else if (tabId === 'verify' && (userRole === 'INSTITUTIONAL_ISSUER' || userRole === 'SYSTEM_ADMIN')) {
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <motion.div
            className="flex items-center space-x-3 cursor-pointer group"
            onClick={() => handleTabClick('verify')}
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
                  onClick={() => handleTabClick(tab.id)}
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

          {/* Active Role Switcher & User Profile Controls */}
          <div className="flex items-center space-x-3">
            <motion.div
              className="flex items-center space-x-2 glass-surface border border-slate-800 px-3 py-1.5 rounded-xl text-xs shadow-inner"
              whileHover={{ borderColor: 'rgba(6, 182, 212, 0.4)' }}
            >
              <span className="text-slate-400 font-mono font-medium">Role:</span>
              <select
                id="select-user-role"
                value={userRole}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                className="bg-slate-900/90 border border-slate-700/80 text-cyan-300 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold transition-all cursor-pointer"
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

            {/* Logged in User Badge & Logout */}
            {userEmail && (
              <div className="hidden sm:flex items-center space-x-2 text-xs font-mono bg-slate-900/80 border border-slate-800 px-2.5 py-1.5 rounded-xl text-slate-300">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span className="max-w-[120px] truncate text-slate-200">{userEmail.split('@')[0]}</span>
              </div>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign Out"
                className="p-2 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-950/40 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

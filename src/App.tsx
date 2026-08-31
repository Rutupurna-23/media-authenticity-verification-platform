/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from './components/Navbar.js';
import { PublicVerification } from './components/PublicVerification.js';
import { InstitutionalPortal } from './components/InstitutionalPortal.js';
import { AdminConsole } from './components/AdminConsole.js';
import { ArchitectureViewer } from './components/ArchitectureViewer.js';
import { CyberBackground } from './components/CyberBackground.js';
import { UserRole, Institution, Credential, MediaRecord, VerificationLog } from './types.js';
import { Shield, CheckCircle2, Lock, Cpu, Server } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'verify' | 'issuer' | 'admin' | 'architecture'>('verify');
  const [userRole, setUserRole] = useState<UserRole>('PUBLIC_RECIPIENT');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('inst-fema');

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [mediaRecords, setMediaRecords] = useState<MediaRecord[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<VerificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAppData = async () => {
    try {
      const headers: Record<string, string> = {
        'x-user-role': userRole,
      };
      if (userRole === 'INSTITUTIONAL_ISSUER' && selectedInstitutionId) {
        headers['x-institution-id'] = selectedInstitutionId;
      }

      const [instRes, credRes, mediaRes, logsRes] = await Promise.all([
        fetch('/api/institutions', { headers }),
        fetch('/api/credentials', { headers }),
        fetch('/api/media', { headers }),
        fetch('/api/verification-logs', { headers }),
      ]);

      if (instRes.ok) {
        const instData = await instRes.json();
        setInstitutions(instData);
        if (instData.length > 0 && !selectedInstitutionId) {
          setSelectedInstitutionId(instData[0].id);
        }
      }

      if (credRes.ok) {
        const credData = await credRes.json();
        setCredentials(credData);
      }

      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        setMediaRecords(mediaData);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setVerificationLogs(logsData);
      } else {
        setVerificationLogs([]);
      }
    } catch (err) {
      console.error('Error loading platform state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppData();
  }, [userRole, selectedInstitutionId]);

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white overflow-x-hidden">
      {/* Interactive Motion Cyber Background */}
      <CyberBackground />

      {/* Interactive Foreground Content Layer */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Navigation */}
        <Navbar
          currentTab={currentTab}
          setTab={setCurrentTab}
          userRole={userRole}
          setUserRole={setUserRole}
          institutions={institutions}
          selectedInstitutionId={selectedInstitutionId}
          setSelectedInstitutionId={setSelectedInstitutionId}
        />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
            <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            <p className="text-xs font-mono text-slate-400">Loading TruthSeal Authenticity Engine...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {currentTab === 'verify' && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <PublicVerification mediaRecords={mediaRecords} onRefresh={fetchAppData} />
              </motion.div>
            )}

            {currentTab === 'issuer' && (
              <motion.div
                key="issuer"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <InstitutionalPortal
                  institutions={institutions}
                  selectedInstitutionId={selectedInstitutionId}
                  setSelectedInstitutionId={setSelectedInstitutionId}
                  credentials={credentials}
                  mediaRecords={mediaRecords}
                  onRefresh={fetchAppData}
                />
              </motion.div>
            )}

            {currentTab === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <AdminConsole
                  institutions={institutions}
                  credentials={credentials}
                  verificationLogs={verificationLogs}
                  onRefresh={fetchAppData}
                />
              </motion.div>
            )}

            {currentTab === 'architecture' && (
              <motion.div
                key="architecture"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <ArchitectureViewer />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Platform Status Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 text-xs py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <div className="flex items-center space-x-3">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-slate-300 font-semibold">TruthSeal Platform</span>
            <span>&bull;</span>
            <span className="text-[11px] text-emerald-400 font-mono flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>4 Cloud Functions Active</span>
            </span>
          </div>

          <div className="flex items-center space-x-4 font-mono text-[11px]">
            <span className="text-slate-400">ABAC Rules Enforced</span>
            <span>&bull;</span>
            <span className="text-slate-400">GCP KMS Ready</span>
            <span>&bull;</span>
            <span className="text-cyan-400">Port 3000 Ingress</span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}

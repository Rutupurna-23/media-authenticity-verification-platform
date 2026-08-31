import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode,
  ShieldCheck,
  Building2,
  Clock,
  KeyRound,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { VerificationResultPayload, MediaRecord } from '../types.js';

interface PublicVerificationProps {
  mediaRecords: MediaRecord[];
  onRefresh: () => void;
}

export const PublicVerification: React.FC<PublicVerificationProps> = ({ mediaRecords, onRefresh }) => {
  const [hashInput, setHashInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [calculatedClientHash, setCalculatedClientHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Compute SHA-256 in browser using Web Crypto API
  const calculateFileHash = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setError(null);
      try {
        const hash = await calculateFileHash(file);
        setCalculatedClientHash(hash);
        setHashInput(hash);
      } catch (err) {
        console.error('Hash calculation error:', err);
      }
    }
  };

  const handleVerify = async (hashToTest?: string) => {
    const targetHash = (hashToTest || hashInput || calculatedClientHash).trim();
    if (!targetHash && !selectedFile) {
      setError('Please provide a media file or SHA-256 hash to verify.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let response: Response;

      if (selectedFile && !hashToTest) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('mediaHash', targetHash);
        response = await fetch('/api/media/verify', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/media/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaHash: targetHash }),
        });
      }

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '60';
          throw new Error(`Rate limit exceeded: Too many verification queries. Please wait ${retryAfter} seconds before trying again.`);
        }
        if (response.status === 503) {
          throw new Error('Service currently degraded: Backend dependencies are undergoing maintenance. Please retry shortly.');
        }
        const errData = await response.json().catch(() => ({ error: 'Verification request failed' }));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const data: VerificationResultPayload = await response.json();
      setResult(data);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred during media verification.');
    } finally {
      setLoading(false);
    }
  };

  const copyResultJson = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header Banner */}
      <motion.div
        className="glass-surface border border-slate-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-cyan-950/90 border border-cyan-700/60 text-cyan-300 text-xs font-mono shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '8s' }} />
            <span>TruthSeal &bull; Public Zero-Trust Verification Gateway</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
            Verify Media Provenance with <span className="text-cyan-400">TruthSeal</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-3xl leading-relaxed">
            Validate whether official audio, video, broadcast notices, and emergency advisories were authentic and
            unaltered by cross-referencing institutional KMS signatures in TruthSeal's cryptographic vault.
          </p>
        </div>
      </motion.div>

      {/* Verification Input Box */}
      <motion.div
        className="glass-surface border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 relative overflow-hidden"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Scanning Beam Overlay during loading */}
        {loading && (
          <div className="absolute inset-0 z-30 pointer-events-none bg-cyan-950/20 backdrop-blur-[2px]">
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-lg shadow-cyan-400/80 animate-laser-scan absolute" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option A: File Upload */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>1. Upload Media File to Verify</span>
            </label>
            <motion.div
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500/70 bg-slate-950/60 rounded-xl p-5 text-center transition cursor-pointer relative group"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <input
                id="file-verify-input"
                type="file"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-8 h-8 mx-auto text-slate-500 group-hover:text-cyan-400 transition-colors duration-200 mb-2" />
              <p className="text-xs text-slate-300 font-medium truncate">
                {selectedFile ? selectedFile.name : 'Drag & drop or browse media file'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Audio (MP3/WAV), Video (MP4), Notice PDF, Emergency</p>
            </motion.div>
            {calculatedClientHash && (
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span className="text-slate-500">SHA-256:</span>
                <span className="text-cyan-400 truncate max-w-[280px]">{calculatedClientHash}</span>
              </div>
            )}
          </div>

          {/* Option B: Direct SHA-256 Hash */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span>2. Or Paste SHA-256 Hash</span>
            </label>
            <div className="space-y-2">
              <textarea
                id="input-media-hash"
                rows={3}
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder="e.g. 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"
                className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none transition-all"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>Standard 64-character hexadecimal SHA-256 string</span>
                {hashInput && (
                  <button
                    onClick={() => {
                      setHashInput('');
                      setSelectedFile(null);
                      setCalculatedClientHash('');
                    }}
                    className="text-slate-400 hover:text-white underline transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Button & Error */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800">
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Public endpoint does not require user credentials.</span>
          </div>

          <motion.button
            id="btn-verify-media"
            disabled={loading}
            onClick={() => handleVerify()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-cyan-900/30 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                <span>Executing Cryptographic Verification...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-cyan-300 animate-pulse" />
                <span>Run Cryptographic Verification</span>
              </>
            )}
          </motion.button>
        </div>

        {error && (
          <motion.div
            className="bg-rose-950/60 border border-rose-800/80 rounded-xl p-4 text-rose-300 text-xs flex items-start space-x-3 shadow-lg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold">Verification Error</p>
              <p>{error}</p>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Pre-seeded Test Samples Quick Bar */}
      <div className="glass-surface border border-slate-800 rounded-xl p-4 shadow-lg">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span>Quick Demo Test Scenarios:</span>
          <span className="text-[10px] text-cyan-400 font-mono">Click to test instant verification</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {mediaRecords.slice(0, 3).map((rec) => {
            const isFema = rec.id.includes('fema-001');
            const isRevoked = rec.id.includes('revoked');

            return (
              <motion.button
                key={rec.id}
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setHashInput(rec.mediaHash);
                  setSelectedFile(null);
                  setCalculatedClientHash(rec.mediaHash);
                  handleVerify(rec.mediaHash);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between shadow-sm ${
                  isFema
                    ? 'bg-emerald-950/40 border-emerald-800/60 hover:border-emerald-500/80 text-emerald-300'
                    : isRevoked
                    ? 'bg-rose-950/40 border-rose-800/60 hover:border-rose-500/80 text-rose-300'
                    : 'bg-amber-950/40 border-amber-800/60 hover:border-amber-500/80 text-amber-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-white truncate max-w-[170px]">{rec.title || rec.id}</span>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 shadow-inner">
                    {isFema ? 'AUTHENTIC' : isRevoked ? 'REVOKED' : 'UNSIGNED'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">{rec.mediaType} &bull; {rec.originalFileName}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-2 truncate">Hash: {rec.mediaHash.substring(0, 16)}...</p>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Verification Result Output with Motion Animations */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.logId || result.mediaHash}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="space-y-6"
          >
            {/* Main Verdict Card */}
            <div
              className={`border rounded-2xl p-6 sm:p-8 shadow-2xl transition-all relative overflow-hidden ${
                result.verdict === 'AUTHENTIC'
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-100 shadow-emerald-950/50'
                  : result.verdict === 'PROVEN_FAKE'
                  ? 'bg-rose-950/50 border-rose-500/60 text-rose-100 shadow-rose-950/50'
                  : 'bg-amber-950/50 border-amber-500/60 text-amber-100 shadow-amber-950/50'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-700/60">
                <div className="flex items-center space-x-4">
                  <motion.div
                    initial={{ rotate: -180, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                      result.verdict === 'AUTHENTIC'
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 shadow-emerald-900/40'
                        : result.verdict === 'PROVEN_FAKE'
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-400/50 shadow-rose-900/40'
                        : 'bg-amber-500/25 text-amber-300 border border-amber-400/50 shadow-amber-900/40'
                    }`}
                  >
                    {result.verdict === 'AUTHENTIC' && <CheckCircle2 className="w-8 h-8" />}
                    {result.verdict === 'PROVEN_FAKE' && <XCircle className="w-8 h-8" />}
                    {result.verdict === 'UNSIGNED' && <AlertTriangle className="w-8 h-8" />}
                  </motion.div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                        Verification Result
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300">
                        Log ID: {result.logId}
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5">
                      VERDICT: {result.verdict}
                    </h2>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={copyResultJson}
                  className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-mono border border-slate-700 flex items-center space-x-2 shadow-md"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
                  <span className="font-semibold">{copied ? 'Copied Certificate' : 'Copy JSON Certificate'}</span>
                </motion.button>
              </div>

              {/* Explanation & Details */}
              <div className="py-6 space-y-4">
                <p className="text-sm sm:text-base leading-relaxed text-slate-200 font-medium">{result.details}</p>

                {/* Status Pillars Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  <motion.div whileHover={{ y: -2 }} className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 shadow-inner">
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 font-medium">
                      <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Cryptographic Signature</span>
                    </div>
                    <p className="text-sm font-bold text-white mt-1">
                      {result.isSigned ? 'Valid KMS Signature' : 'No Signature Found'}
                    </p>
                  </motion.div>

                  <motion.div whileHover={{ y: -2 }} className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 shadow-inner">
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Issuing Institution</span>
                    </div>
                    <p className="text-sm font-bold text-white mt-1 truncate">
                      {result.institutionName || result.issuerId || 'Unregistered'}
                    </p>
                  </motion.div>

                  <motion.div whileHover={{ y: -2 }} className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 shadow-inner">
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Credential Trust Status</span>
                    </div>
                    <p
                      className={`text-sm font-bold mt-1 ${
                        result.credentialStatus === 'ACTIVE'
                          ? 'text-emerald-400'
                          : result.credentialStatus === 'REVOKED'
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {result.credentialStatus || 'N/A'}
                    </p>
                  </motion.div>

                  <motion.div whileHover={{ y: -2 }} className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 shadow-inner">
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Checked Timestamp</span>
                    </div>
                    <p className="text-xs font-mono text-slate-300 mt-1">
                      {new Date(result.checkedAt).toLocaleTimeString()} &bull; {new Date(result.checkedAt).toLocaleDateString()}
                    </p>
                  </motion.div>
                </div>
              </div>

              {/* Media Metadata & Storage Path */}
              {result.mediaRecord && (
                <div className="bg-slate-950/90 rounded-xl p-4 border border-slate-800 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <span>Firestore Media Manifest: {result.mediaRecord.title || result.mediaRecord.originalFileName}</span>
                    </span>
                    <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-cyan-300">
                      {result.mediaRecord.mediaType}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-500">Record ID:</span>
                      <span className="text-slate-300">{result.mediaRecord.id}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-500">Storage Object Path:</span>
                      <span className="text-cyan-400 truncate max-w-[200px]">{result.mediaRecord.storagePath}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


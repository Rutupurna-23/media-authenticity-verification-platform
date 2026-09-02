import React, { useState, useRef } from 'react';
import {
  Upload,
  Building2,
  Key,
  FileCode,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  FileText,
  Volume2,
  Video,
  AlertCircle,
  FileCheck,
  Hash,
} from 'lucide-react';
import { Institution, Credential, MediaRecord, MediaType } from '../../../types.js';
import { useTranslation } from '../../i18n/LanguageContext.js';

interface InstitutionalPortalProps {
  institutions: Institution[];
  selectedInstitutionId: string;
  setSelectedInstitutionId: (id: string) => void;
  credentials: Credential[];
  mediaRecords: MediaRecord[];
  onRefresh: () => void;
}

export const InstitutionalPortal: React.FC<InstitutionalPortalProps> = ({
  institutions,
  selectedInstitutionId,
  setSelectedInstitutionId,
  credentials,
  mediaRecords,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [authorityLoading, setAuthorityLoading] = useState(true);
  const [authorityError, setAuthorityError] = useState<string | null>(null);
  const [activeAuthorityData, setActiveAuthorityData] = useState<{
    institution: Institution | null;
    credential: Credential | null;
    credentials: Credential[];
  }>({
    institution: null,
    credential: null,
    credentials: [],
  });

  const [uploadedRecords, setUploadedRecords] = useState<MediaRecord[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('NOTICE');
  const [title, setTitle] = useState('');
  const [selectedCredId, setSelectedCredId] = useState<string>('');
  const [calculatedHash, setCalculatedHash] = useState('');
  const [uploading, setUploading] = useState(false);
  const [signingRecordId, setSigningRecordId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchActiveAuthority = async () => {
    setAuthorityLoading(true);
    setAuthorityError(null);
    const targetId = selectedInstitutionId || 'inst-fema';

    const fallbackInst =
      institutions.find((i) => i.id === targetId) ||
      institutions[0] || {
        id: targetId,
        name: 'Federal Emergency Management Agency (FEMA)',
        domain: 'fema.gov',
        status: 'ACTIVE',
        createdAt: '',
      };

    const instCreds = credentials.filter((c) => c.institutionId === targetId || c.institutionId === fallbackInst.id);
    const fallbackCred =
      instCreds.find((c) => c.status === 'ACTIVE') ||
      credentials.find((c) => c.status === 'ACTIVE') ||
      credentials[0] ||
      null;

    try {
      const res = await fetch(`/api/credentials/active?institutionId=${targetId}`, {
        headers: {
          'x-user-role': 'INSTITUTIONAL_ISSUER',
          'x-institution-id': targetId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.institution) {
          setActiveAuthorityData({
            institution: data.institution || fallbackInst,
            credential: data.credential || fallbackCred,
            credentials: data.credentials && data.credentials.length > 0 ? data.credentials : instCreds,
          });
          setAuthorityLoading(false);
          return;
        }
      }
    } catch (_err) {
      // Smooth fallback to local state if server API is unavailable
    }

    setActiveAuthorityData({
      institution: fallbackInst,
      credential: fallbackCred,
      credentials: instCreds.length > 0 ? instCreds : credentials,
    });
    setAuthorityLoading(false);
  };

  React.useEffect(() => {
    fetchActiveAuthority();
  }, [selectedInstitutionId]);

  const currentInstitution =
    activeAuthorityData.institution ||
    institutions.find((i) => i.id === selectedInstitutionId) ||
    institutions[0] || {
      id: selectedInstitutionId || 'inst-fema',
      name: 'Federal Emergency Management Agency (FEMA)',
      domain: 'fema.gov',
      status: 'ACTIVE',
      createdAt: '',
    };

  const institutionCredentials =
    activeAuthorityData.credentials.length > 0
      ? activeAuthorityData.credentials
      : credentials.filter((c) => c.institutionId === currentInstitution.id);

  const activeCredentials = institutionCredentials.filter((c) => c.status === 'ACTIVE');

  // Deduplicate and filter combined media records (server-fetched + locally uploaded)
  const combinedMedia = [...uploadedRecords, ...mediaRecords];
  const institutionMediaMap = new Map<string, MediaRecord>();
  combinedMedia.forEach((m) => {
    if (
      !m.institutionId ||
      m.institutionId === currentInstitution.id ||
      m.institutionId === selectedInstitutionId
    ) {
      if (!institutionMediaMap.has(m.id)) {
        institutionMediaMap.set(m.id, m);
      }
    }
  });
  const institutionMedia = Array.from(institutionMediaMap.values());

  // Synchronize selected credential when active authority or credentials change
  React.useEffect(() => {
    if (activeAuthorityData.credential) {
      setSelectedCredId(activeAuthorityData.credential.id);
    } else {
      const defaultCred = activeCredentials[0] || institutionCredentials[0];
      if (defaultCred) {
        setSelectedCredId(defaultCred.id);
      } else {
        setSelectedCredId('');
      }
    }
  }, [activeAuthorityData, selectedInstitutionId, credentials]);

  const selectedCredential =
    (selectedCredId ? institutionCredentials.find((c) => c.id === selectedCredId) : null) ||
    activeAuthorityData.credential ||
    activeCredentials.find((c) => c.status === 'ACTIVE') ||
    activeCredentials[0] ||
    institutionCredentials.find((c) => c.status === 'ACTIVE') ||
    institutionCredentials[0] ||
    credentials.find((c) => (c.institutionId === currentInstitution?.id || c.institutionId === selectedInstitutionId) && c.status === 'ACTIVE') ||
    credentials.find((c) => c.status === 'ACTIVE') ||
    credentials[0] ||
    null;

  // Process and compute SHA-256 digest for selected file
  const processSelectedFile = async (file: File) => {
    setUploadFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      setCalculatedHash(hashHex);
    } catch (err) {
      console.error('Hash error:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleClearFile = () => {
    setUploadFile(null);
    setCalculatedHash('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 1. Upload Media Handler (Calls Cloud Function: uploadMedia)
  const handleUploadMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setFeedback({ type: 'error', message: 'Please select a media file to upload.' });
      return;
    }

    setUploading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('institutionId', currentInstitution.id);
      formData.append('mediaType', mediaType);
      formData.append('title', title || uploadFile.name);
      const credIdToUse = selectedCredId || selectedCredential?.id || activeCredentials[0]?.id;
      if (credIdToUse) {
        formData.append('credentialId', credIdToUse);
      }

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: {
          'x-user-role': 'INSTITUTIONAL_ISSUER',
          'x-institution-id': currentInstitution.id,
          'x-user-institution-id': currentInstitution.id,
        },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After') || '60';
          throw new Error(`Upload rate limit reached. Please wait ${retryAfter} seconds before uploading more files.`);
        }
        if (res.status === 503) {
          throw new Error('Storage service temporarily degraded. Please try uploading again in a few moments.');
        }
        let serverError = '';
        try {
          const resText = await res.text();
          try {
            const errJson = JSON.parse(resText);
            serverError = errJson.error || errJson.message || '';
          } catch (_e) {
            serverError = resText.substring(0, 100);
          }
        } catch (_e) {}
        throw new Error(serverError || `Upload failed with status code ${res.status}`);
      }

      const createdRecord: MediaRecord = await res.json();
      setUploadedRecords((prev) => [createdRecord, ...prev]);
      setFeedback({
        type: 'success',
        message: `Media uploaded successfully to '${createdRecord.storagePath}' with SHA-256: ${createdRecord.mediaHash.substring(0, 16)}...`,
      });

      setUploadFile(null);
      setTitle('');
      setCalculatedHash('');
      onRefresh();
      fetchActiveAuthority();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to upload media.' });
    } finally {
      setUploading(false);
    }
  };

  // 2. Sign Media Handler (Calls Cloud Function: signMedia)
  const handleSignMedia = async (recordId: string, credentialIdToUse?: string) => {
    const credId = credentialIdToUse || selectedCredId || selectedCredential?.id || activeCredentials[0]?.id;
    if (!credId) {
      setFeedback({ type: 'error', message: 'No active institutional credential available for signing.' });
      return;
    }

    setSigningRecordId(recordId);
    setFeedback(null);

    try {
      const res = await fetch('/api/media/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'INSTITUTIONAL_ISSUER',
          'x-institution-id': currentInstitution.id,
        },
        body: JSON.stringify({
          mediaRecordId: recordId,
          credentialId: credId,
          institutionId: currentInstitution.id,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Signing request rate limit exceeded. Please wait before submitting more signatures.');
        }
        if (res.status === 503) {
          throw new Error('KMS signing service temporarily unavailable. Please retry shortly.');
        }
        const err = await res.json().catch(() => ({ error: 'Signing failed' }));
        throw new Error(err.error || `Signing failed with status ${res.status}`);
      }

      const signResult = await res.json();
      setFeedback({
        type: 'success',
        message: `Cryptographic KMS signature generated and stored successfully! Timestamp: ${new Date(
          signResult.timestamp
        ).toLocaleTimeString()}`,
      });
      onRefresh();
      fetchActiveAuthority();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to cryptographically sign media.' });
    } finally {
      setSigningRecordId(null);
    }
  };

  const getAuthorityTrustState = () => {
    if (selectedCredential) {
      if (selectedCredential.status === 'REVOKED') return 'REVOKED';
      if (selectedCredential.status === 'EXPIRED') return 'EXPIRED';
      if (selectedCredential.status === 'ACTIVE') return 'ACTIVE';
    }
    if (
      activeCredentials.length > 0 ||
      institutionCredentials.some((c) => c.status === 'ACTIVE') ||
      credentials.some((c) => c.status === 'ACTIVE')
    ) {
      return 'ACTIVE';
    }
    return 'NO_CREDENTIAL';
  };

  const trustState = getAuthorityTrustState();
  const isSigningAllowed = trustState === 'ACTIVE';

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header with Institution Profile */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">{t('issuer.portalTitle')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{currentInstitution?.name || 'Institution Workspace'}</h1>
          <p className="text-xs text-slate-400 font-mono">
            Domain: <span className="text-cyan-400">{currentInstitution?.domain}</span> &bull; {t('common.status')}:{' '}
            <span className="text-emerald-400">{currentInstitution?.status}</span> &bull; Institution ID: {currentInstitution?.id}
          </p>
        </div>

        {/* Active Issuing Authority & Cryptographic Trust Card */}
        <div className="glass-surface p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 min-w-[340px] max-w-md shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('issuer.activeAuthority')}</span>
            </label>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60">
              {t('issuer.kmsEnclave')}
            </span>
          </div>

          {authorityLoading ? (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Loading issuing authority...</span>
            </div>
          ) : authorityError ? (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-xs font-mono text-rose-300 space-y-2">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>Unable to load issuing authority.</span>
              </div>
              <button
                onClick={fetchActiveAuthority}
                className="px-3 py-1 bg-rose-900/80 hover:bg-rose-800 rounded-lg text-[11px] font-semibold text-white transition cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* Authority Institution Badge / Dropdown */}
              <div className="space-y-1.5">
                <div className="relative">
                  <select
                    id="select-issuing-authority"
                    value={currentInstitution?.id}
                    onChange={(e) => setSelectedInstitutionId(e.target.value)}
                    className="w-full bg-slate-950/90 border border-slate-700/80 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold cursor-pointer appearance-none pr-8"
                  >
                    {(institutions.length > 0 ? institutions : [currentInstitution]).map((i) => (
                      <option key={i.id} value={i.id}>
                        🏛 {i.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400 text-xs">▼</div>
                </div>

                {/* Credential Selector (if institution has multiple credentials) */}
                {institutionCredentials.length > 1 && (
                  <select
                    id="select-issuing-credential"
                    value={selectedCredId}
                    onChange={(e) => setSelectedCredId(e.target.value)}
                    className="w-full bg-slate-900 border border-indigo-900/80 text-indigo-300 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-medium"
                  >
                    {institutionCredentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        Key: {c.id} ({c.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Trust Status Badge */}
              <div>
                {trustState === 'ACTIVE' && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-700/80 text-emerald-300 text-xs font-mono font-semibold shadow-inner">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>● AUTHORIZED TO ISSUE</span>
                  </div>
                )}

                {trustState === 'REVOKED' && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-950/90 border border-rose-700/80 text-rose-300 text-xs font-mono font-semibold shadow-inner">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>● CREDENTIAL REVOKED</span>
                  </div>
                )}

                {trustState === 'EXPIRED' && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-950/90 border border-amber-700/80 text-amber-300 text-xs font-mono font-semibold shadow-inner">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>● CREDENTIAL EXPIRED</span>
                  </div>
                )}

                {trustState === 'NO_CREDENTIAL' && (
                  <div className="space-y-1">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-300 text-xs font-mono font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>● CREDENTIAL UNCONFIGURED</span>
                    </div>
                    <p className="text-[11px] text-amber-300/90 font-mono italic pl-1">
                      Action Required: Contact System Admin to configure an active issuing credential.
                    </p>
                  </div>
                )}
              </div>

              {/* Compact Trust Metadata Grid */}
              <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Credential</span>
                  <span className="text-slate-200 font-semibold truncate max-w-[170px]">
                    {selectedCredential?.id || 'Unassigned'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Signing Algorithm</span>
                  <span className="text-cyan-300 font-semibold">
                    {selectedCredential?.keyAlgorithm || 'RSA-PSS-SHA256'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Key Protection</span>
                  <span className="text-indigo-300 font-semibold">KMS / HSM</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-500">Credential Status</span>
                  <span
                    className={`font-bold ${
                      trustState === 'ACTIVE'
                        ? 'text-emerald-400'
                        : trustState === 'REVOKED'
                        ? 'text-rose-400'
                        : trustState === 'EXPIRED'
                        ? 'text-amber-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {selectedCredential?.status || 'No Credential'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start space-x-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <p className="leading-relaxed">{feedback.message}</p>
        </div>
      )}

      {/* Grid: Upload & Sign Box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Official Media Form */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Upload className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white">1. Upload Official Institutional Media</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Cloud Storage &rarr; Firestore Manifest</span>
          </div>

          <form onSubmit={handleUploadMedia} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase text-slate-400">
                  Select File (Audio, Video, Notice PDF, Emergency)
                </label>
                {uploadFile && (
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer"
                  >
                    Change file
                  </button>
                )}
              </div>

              <label
                htmlFor="input-issuer-file"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer block relative group ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-500/50'
                    : uploadFile
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : 'border-slate-700 hover:border-cyan-500/70 bg-slate-950/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="input-issuer-file"
                  type="file"
                  onChange={handleFileChange}
                  className="sr-only"
                />

                <Upload
                  className={`w-8 h-8 mx-auto mb-2 transition-colors duration-200 ${
                    uploadFile ? 'text-emerald-400' : 'text-slate-500 group-hover:text-cyan-400'
                  }`}
                />

                {uploadFile ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-emerald-300 flex items-center justify-center space-x-1.5 truncate px-2">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 inline" />
                      <span className="truncate">{uploadFile.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono font-normal">
                        ({(uploadFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Selected & ready to upload to <span className="text-cyan-400">media/institutions/{currentInstitution?.id}/</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      Click to select media file or drag & drop here
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">Audio (MP3/WAV), Video (MP4), Notice PDF, Emergency Advisories</p>
                  </div>
                )}
              </label>
            </div>

            {calculatedHash && (
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono flex items-center justify-between">
                <span className="text-slate-400 flex items-center space-x-1">
                  <Hash className="w-3 h-3 text-cyan-400" />
                  <span>Computed SHA-256:</span>
                </span>
                <span className="text-cyan-300 truncate max-w-[320px]">{calculatedHash}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">Media Title / Subject</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Level 4 Hurricane Evacuation Notice"
                  className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-slate-400 block mb-1">Media Type</label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as MediaType)}
                  className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="NOTICE">NOTICE (PDF / Official Document)</option>
                  <option value="EMERGENCY">EMERGENCY (Public Broadcast / Alert)</option>
                  <option value="AUDIO">AUDIO (Spoken Statement / Radio Dispatch)</option>
                  <option value="VIDEO">VIDEO (Press Briefing / Footage)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={uploading || !uploadFile}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-2 transition disabled:opacity-40 cursor-pointer"
              >
                {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{uploading ? 'Uploading to Cloud Storage...' : 'Upload & Compute Hash'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Institutional Cryptographic Credentials Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-800">
              <Key className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Active KMS Credentials</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cryptographic keys associated with this institution. Private keys are safeguarded in the backend KMS enclave and
              never exposed.
            </p>

            <div className="space-y-2.5">
              {institutionCredentials.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No credentials issued yet. Contact System Admin.</p>
              ) : (
                institutionCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    className={`p-3 rounded-xl border text-xs font-mono transition ${
                      cred.status === 'ACTIVE'
                        ? 'bg-slate-950 border-indigo-900/60 text-indigo-200'
                        : 'bg-rose-950/30 border-rose-900/60 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold truncate max-w-[140px] text-white">{cred.id}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          cred.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {cred.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">{cred.keyAlgorithm}</p>
                    {cred.status === 'REVOKED' && (
                      <p className="text-[10px] text-rose-400 mt-1 truncate">Revocation: {cred.revocationReason}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400">
            <span className="text-cyan-400 font-semibold block mb-0.5">Zero-Exposure Guarantee</span>
            Private keys are stored in backend KMS HSM memory only.
          </div>
        </div>
      </div>

      {/* Institutional Media Archive & Signing Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">2. Registered Media Manifests & Signatures</h2>
            <p className="text-xs text-slate-400">
              Audit and digitally sign uploaded media files using institutional credentials.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh Manifests</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3">Media Title & File</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">SHA-256 Hash</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {institutionMedia.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 italic">
                    No media records found for this institution. Upload your first official media above.
                  </td>
                </tr>
              ) : (
                institutionMedia.map((record) => {
                  const isSigned = record.status === 'SIGNED';
                  const isSigning = signingRecordId === record.id;

                  return (
                    <tr key={record.id} className="hover:bg-slate-950/40 transition">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white truncate max-w-[200px]">
                          {record.title || record.originalFileName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate max-w-[200px]">
                          {record.originalFileName} &bull; {(record.fileSizeBytes || 0) / 1024 > 1 ? `${Math.round((record.fileSizeBytes || 0)/1024)} KB` : `${record.fileSizeBytes} B`}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          {record.mediaType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        <span className="text-cyan-400 font-semibold">{record.mediaHash.substring(0, 10)}</span>
                        <span>...</span>
                        <span className="text-slate-500">{record.mediaHash.substring(record.mediaHash.length - 8)}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono ${
                            isSigned
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                              : 'bg-amber-950 text-amber-400 border border-amber-800/80'
                          }`}
                        >
                          {isSigned ? 'SIGNED (KMS)' : 'PENDING SIGNATURE'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {isSigned ? (
                          <div className="text-[11px] text-emerald-400 font-mono flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Signed ({new Date(record.signedAt || record.createdAt).toLocaleDateString()})</span>
                          </div>
                        ) : (
                          <button
                            disabled={isSigning || !isSigningAllowed}
                            onClick={() => handleSignMedia(record.id)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center space-x-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isSigning ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Key className="w-3 h-3" />
                            )}
                            <span>{isSigning ? 'Signing...' : trustState === 'REVOKED' ? 'Revoked Key' : 'Sign with KMS'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

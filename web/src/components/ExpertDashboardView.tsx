import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  MapPin,
  ExternalLink,
  History,
  FileCheck2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  fetchExpertObservations,
  fetchExpertStats,
  fetchExpertAuditLogs,
  logoutExpert,
} from '../services/expertApi.js';
import { ExpertWorkspaceModal } from './ExpertWorkspaceModal.js';
import type {
  ExpertUser,
  ExpertObservationSummary,
  ExpertReviewStats,
  ExpertVerificationStatus,
  VerificationAuditLogRecord,
} from '../types/expert.js';

interface ExpertDashboardViewProps {
  currentUser: ExpertUser;
  onLogout: () => void;
  onSwitchToPublicMap: () => void;
}

export const ExpertDashboardView: React.FC<ExpertDashboardViewProps> = ({
  currentUser,
  onLogout,
  onSwitchToPublicMap,
}) => {
  const [stats, setStats] = useState<ExpertReviewStats | null>(null);
  const [observations, setObservations] = useState<ExpertObservationSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<VerificationAuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<ExpertVerificationStatus | 'all'>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('');
  const [districtFilter, setDistrictFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active review modal
  const [activePassportId, setActivePassportId] = useState<string | null>(null);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsData, obsData, logsData] = await Promise.all([
        fetchExpertStats(),
        fetchExpertObservations({
          status: statusFilter,
          classification: classificationFilter || undefined,
          district: districtFilter || undefined,
          search: searchQuery || undefined,
          page,
          limit,
        }),
        fetchExpertAuditLogs(),
      ]);

      setStats(statsData);
      setObservations(obsData.data);
      setTotal(obsData.total);
      setAuditLogs(logsData);
    } catch (err) {
      console.error('Failed to load expert data', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, classificationFilter, districtFilter, searchQuery, page, limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await logoutExpert();
    onLogout();
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="min-h-full bg-[#f8fafd] text-[#1f1f1f] flex flex-col">
      {/* Portal header. The platform navigation lives in the app sidebar, so this
          row carries only portal identity and portal-local actions. */}
      <header className="bg-white border-b border-[#e3e3e3] px-6 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#d3e3fd] text-[#041e49]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-medium text-[#1f1f1f] tracking-tight">Verification portal</span>
              </div>
              <p className="text-xs text-[#5e5e5e]">
                Authoritative geological review &amp; quality governance
              </p>
            </div>
          </div>

          {/* Action buttons & Reviewer Profile */}
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button type="button" onClick={onSwitchToPublicMap} className="g-btn g-btn-outlined h-9 px-4 text-[13px]">
              <Layers className="w-4 h-4" />
              <span>Public map</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAuditDrawer(!showAuditDrawer)}
              className="g-btn g-btn-outlined h-9 px-4 text-[13px]"
            >
              <History className="w-4 h-4" />
              <span>Audit trail</span>
            </button>

            {/* Reviewer Tag */}
            <div className="flex items-center space-x-2 pl-2 border-l border-[#e3e3e3]">
              <div className="w-8 h-8 rounded-full bg-[#d3e3fd] text-[#041e49] font-medium flex items-center justify-center text-xs">
                {currentUser.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-medium text-[#1f1f1f] leading-tight">{currentUser.name}</div>
                <div className="text-[10px] text-[#5e5e5e] leading-tight truncate max-w-[150px]">
                  {currentUser.organization}
                </div>
              </div>
              <button type="button" onClick={handleLogout} title="Log out" aria-label="Log out" className="g-icon-btn w-8 h-8">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full px-6 py-6 space-y-6 flex-1">
        {/* KPI Metrics Dashboard */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-white border border-[#e3e3e3] flex flex-col justify-between">
            <span className="text-xs text-[#5e5e5e] font-medium">Total In Queue</span>
            <div className="text-2xl font-medium font-mono text-[#1f1f1f] mt-2">
              {stats?.total_observations ?? '—'}
            </div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('unverified');
              setPage(1);
            }}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              statusFilter === 'unverified'
                ? 'bg-[#fef7e0] border-amber-500/60 ring-1 ring-amber-500/40'
                : 'bg-white border-[#e3e3e3] hover:border-amber-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#9f6108] font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Awaiting Review
              </span>
              {(stats?.awaiting_review_count ?? 0) > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#f9ab00] animate-pulse"></span>
              )}
            </div>
            <div className="text-2xl font-medium font-mono text-[#9f6108] mt-2">
              {stats?.awaiting_review_count ?? '—'}
            </div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('under_review');
              setPage(1);
            }}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              statusFilter === 'under_review'
                ? 'bg-[#d3e3fd] border-sky-500/60 ring-1 ring-sky-500/40'
                : 'bg-white border-[#e3e3e3] hover:border-sky-500/40'
            }`}
          >
            <span className="text-xs text-[#0b57d0] font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Under Review
            </span>
            <div className="text-2xl font-medium font-mono text-[#0b57d0] mt-2">
              {stats?.under_review_count ?? '—'}
            </div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('expert_verified');
              setPage(1);
            }}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              statusFilter === 'expert_verified'
                ? 'bg-[#c4eed0] border-[#2b7f3f]/60 ring-1 ring-emerald-500/40'
                : 'bg-white border-[#e3e3e3] hover:border-[#2b7f3f]/40'
            }`}
          >
            <span className="text-xs text-[#2b7f3f] font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Expert Verified
            </span>
            <div className="text-2xl font-medium font-mono text-[#2b7f3f] mt-2">
              {stats?.verified_count ?? '—'}
            </div>
          </div>

          <div
            onClick={() => {
              setStatusFilter('rejected');
              setPage(1);
            }}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              statusFilter === 'rejected'
                ? 'bg-[#ffdad8] border-rose-500/60 ring-1 ring-rose-500/40'
                : 'bg-white border-[#e3e3e3] hover:border-rose-500/40'
            }`}
          >
            <span className="text-xs text-[#d32f28] font-medium flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              Rejected
            </span>
            <div className="text-2xl font-medium font-mono text-[#d32f28] mt-2">
              {stats?.rejected_count ?? '—'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#e3e3e3] flex flex-col justify-between">
            <span className="text-xs text-[#5e5e5e] font-medium">Verification Rate</span>
            <div className="text-2xl font-medium font-mono text-[#2b7f3f] mt-2">
              {stats?.verification_rate_pct ?? 0}%
            </div>
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="p-4 rounded-xl bg-white border border-[#e3e3e3] space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Status Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              {(
                [
                  { id: 'all', label: 'All Observations' },
                  { id: 'unverified', label: 'Awaiting Review' },
                  { id: 'under_review', label: 'Under Review' },
                  { id: 'expert_verified', label: 'Verified' },
                  { id: 'rejected', label: 'Rejected' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-[#2b7f3f] text-white shadow-sm'
                      : 'bg-[#eef1f6] text-[#5e5e5e] hover:text-[#1f1f1f] hover:bg-[#eef1f6]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <input
                type="text"
                placeholder="Search Passport ID (e.g. 000201)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-[#f8fafd] border border-[#c7c7c7] text-[#1f1f1f] placeholder-[#8f8f8f] text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <Search className="w-4 h-4 text-[#8f8f8f] absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#e3e3e3] text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-[#5e5e5e]">Classification:</span>
              <select
                value={classificationFilter}
                onChange={(e) => {
                  setClassificationFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[#3c4043] text-xs"
              >
                <option value="">All Classifications</option>
                <option value="igneous">Igneous</option>
                <option value="sedimentary">Sedimentary</option>
                <option value="metamorphic">Metamorphic</option>
                <option value="unclassified">Unclassified</option>
                <option value="non_rock">Non-Rock</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[#5e5e5e]">District:</span>
              <select
                value={districtFilter}
                onChange={(e) => {
                  setDistrictFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#f8fafd] border border-[#c7c7c7] text-[#3c4043] text-xs"
              >
                <option value="">All Districts</option>
                <option value="Gasabo">Gasabo</option>
                <option value="Kicukiro">Kicukiro</option>
                <option value="Nyarugenge">Nyarugenge</option>
                <option value="Musanze">Musanze</option>
                <option value="Muhanga">Muhanga</option>
                <option value="Huye">Huye</option>
                <option value="Rubavu">Rubavu</option>
                <option value="Nyagatare">Nyagatare</option>
              </select>
            </div>

            <button
              onClick={() => {
                setClassificationFilter('');
                setDistrictFilter('');
                setSearchQuery('');
                setStatusFilter('all');
                setPage(1);
              }}
              className="text-[#5e5e5e] hover:text-[#1f1f1f] underline ml-auto text-xs"
            >
              Reset Filters
            </button>

            <button
              onClick={loadData}
              title="Refresh queue"
              className="p-1.5 rounded-lg bg-[#eef1f6] hover:bg-[#e3e3e3] text-[#3c4043] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </section>

        {/* Observation Queue Table */}
        <section className="bg-white border border-[#e3e3e3] rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-[#e3e3e3] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileCheck2 className="w-4 h-4 text-[#2b7f3f]" />
              <h3 className="text-sm font-medium text-[#1f1f1f] uppercase tracking-wider">
                Geological Verification Queue
              </h3>
              <span className="text-xs text-[#5e5e5e] font-mono">({total} observations)</span>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-[#2b7f3f] border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-[#5e5e5e]">Loading observation queue...</p>
            </div>
          ) : observations.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-[#2b7f3f]/60 mx-auto" />
              <p className="text-sm font-medium text-[#3c4043]">No observations match the current filter criteria.</p>
              <p className="text-xs text-[#8f8f8f]">All samples in this queue may have been reviewed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-[#e3e3e3]">
                <thead className="bg-[#f0f4f9] text-[#5e5e5e] uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Passport ID</th>
                    <th className="px-4 py-3">District</th>
                    <th className="px-4 py-3">AI Preliminary Assessment</th>
                    <th className="px-4 py-3">Verification Status</th>
                    <th className="px-4 py-3">Authoritative Identification</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e3e3] text-[#3c4043]">
                  {observations.map((obs) => (
                    <tr
                      key={obs.id}
                      className="hover:bg-[#eef1f6] transition-colors group cursor-pointer"
                      onClick={() => setActivePassportId(obs.passport_id)}
                    >
                      <td className="px-4 py-3.5 font-mono font-medium text-[#1f1f1f] flex items-center gap-2">
                        <span>{obs.passport_id}</span>
                        {obs.verification_status === 'unverified' && (
                          <span className="w-2 h-2 rounded-full bg-[#f9ab00] animate-pulse"></span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1 text-[#3c4043]">
                          <MapPin className="w-3.5 h-3.5 text-[#8f8f8f]" />
                          {obs.district || 'Unspecified'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#eef1f6] text-[#3c4043] capitalize text-[11px] border border-[#c7c7c7] font-medium">
                            {obs.ai_classification}
                          </span>
                          <span className="text-[#1f1f1f] capitalize font-medium truncate max-w-[160px]">
                            {obs.ai_possible_name || 'Rock specimen'}
                          </span>
                          <span className="text-[10px] text-[#5e5e5e] font-mono">
                            {Math.round(obs.ai_confidence_score * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            obs.verification_status === 'expert_verified'
                              ? 'bg-[#c4eed0] text-[#2b7f3f] border-[#2b7f3f]/30'
                              : obs.verification_status === 'under_review'
                              ? 'bg-[#e8f0fe] text-[#0b57d0] border-sky-500/30'
                              : obs.verification_status === 'rejected'
                              ? 'bg-[#ffdad8] text-[#d32f28] border-rose-500/30'
                              : 'bg-[#fef7e0] text-[#9f6108] border-amber-500/30'
                          }`}
                        >
                          {obs.verification_status === 'expert_verified' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : obs.verification_status === 'under_review' ? (
                            <Clock className="w-3 h-3" />
                          ) : obs.verification_status === 'rejected' ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          <span className="capitalize">{obs.verification_status.replace('_', ' ')}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {obs.expert_rock_name ? (
                          <div>
                            <span className="font-semibold text-[#2b7f3f]">{obs.expert_rock_name}</span>
                            {obs.reviewer_name && (
                              <span className="text-[10px] text-[#8f8f8f] block truncate max-w-[150px]">
                                by {obs.reviewer_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#8f8f8f] italic text-[11px]">Pending expert review</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[#5e5e5e] font-mono text-[11px]">
                        {new Date(obs.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePassportId(obs.passport_id);
                          }}
                          className="px-3 py-1 rounded-lg bg-[#2b7f3f] hover:bg-[#2b7f3f] text-white font-medium text-xs transition-colors shadow-sm"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-[#e3e3e3] flex items-center justify-between text-xs text-[#5e5e5e]">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg bg-[#eef1f6] hover:bg-[#e3e3e3] disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg bg-[#eef1f6] hover:bg-[#e3e3e3] disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Audit Logs Drawer / Modal */}
      {showAuditDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b0b0c]/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-white border border-[#c7c7c7] rounded-xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#e3e3e3] flex items-center justify-between bg-white/90">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-[#2b7f3f]" />
                <h3 className="font-semibold text-[#1f1f1f] text-sm">System Audit & Governance Log</h3>
              </div>
              <button
                onClick={() => setShowAuditDrawer(false)}
                className="p-1 text-[#5e5e5e] hover:text-[#1f1f1f]"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs divide-y divide-[#e3e3e3]">
              {auditLogs.length === 0 ? (
                <p className="text-[#8f8f8f] italic text-center py-6">No audit records available.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="pt-3 first:pt-0 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[#2b7f3f] font-medium">{log.passport_id}</span>
                        <span className="font-semibold text-[#1f1f1f]">{log.reviewer_name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#eef1f6] text-[10px] text-[#5e5e5e] uppercase font-mono">
                          {log.action}
                        </span>
                      </div>
                      <p className="text-[#3c4043] text-[11px]">{log.notes}</p>
                    </div>
                    <span className="font-mono text-[10px] text-[#8f8f8f] shrink-0">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Workspace Modal */}
      {activePassportId && (
        <ExpertWorkspaceModal
          passportId={activePassportId}
          currentUser={currentUser}
          onClose={() => setActivePassportId(null)}
          onReviewSubmitted={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};

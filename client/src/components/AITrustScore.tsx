'use client';

import React, { useState, useEffect } from 'react';
import { FaShieldAlt, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimesCircle } from 'react-icons/fa';

interface AITrustScoreProps {
    application: any;
    isVisible: boolean;
    officialRole?: string;
}

interface RuleResult {
    ruleName: string;
    status: 'clear' | 'flagged' | 'insufficient_data' | 'review_required';
    severity: string;
    explanation: string;
    missingInputs?: string[];
    evidence?: any[];
}

interface FraudReport {
    applicationId: string;
    overallStatus: string;
    summary: {
        totalRules: number;
        flagged: number;
        clear: number;
        insufficientData: number;
        reviewRequired: number;
    };
    results: RuleResult[];
    disclaimer: string;
}

// Map each official role/designation to the specific fraud rules they are responsible for resolving
const ROLE_FRAUD_RULES_MAP: Record<string, string[]> = {
    clerk: [
        'Forged / Fake Land Document',
        'Document–Official Record Mismatch',
    ],
    superintendent: [
        'Unauthorized Ownership Transfer / Seller Impersonation',
    ],
    projectofficer: [
        'Joint Ownership / Share Violation',
    ],
    project_officer: [
        'Joint Ownership / Share Violation',
    ],
    mro: [
        'Unauthorized / Fraudulent Mutation',
    ],
    surveyor: [
        'Parcel / Survey / Boundary Identity Fraud',
        'Sale Beyond Available Extent',
    ],
    revenueinspector: [
        'Sale Beyond Available Extent',
    ],
    revenue_inspector: [
        'Sale Beyond Available Extent',
    ],
    vro: [
        'Unauthorized / Fraudulent Mutation',
    ],
    revenuedeptofficer: [
        'Ownership / Title-Chain Inconsistency',
    ],
    revenue_dept_officer: [
        'Ownership / Title-Chain Inconsistency',
    ],
    jointcollector: [
        'Acquisition Conflict',
        'Active Dispute / Litigation Conflict',
    ],
    joint_collector: [
        'Acquisition Conflict',
        'Active Dispute / Litigation Conflict',
    ],
    districtcollector: [
        'Restricted / Prohibited Land Transfer',
        'Government / Assigned Land Transfer',
    ],
    district_collector: [
        'Restricted / Prohibited Land Transfer',
        'Government / Assigned Land Transfer',
    ],
    collector: [
        'Restricted / Prohibited Land Transfer',
        'Government / Assigned Land Transfer',
    ],
    ministrywelfare: [
        'Restricted / Prohibited Land Transfer',
        'Government / Assigned Land Transfer',
    ],
    ministry_welfare: [
        'Restricted / Prohibited Land Transfer',
        'Government / Assigned Land Transfer',
    ],
};

export default function AITrustScore({ application, isVisible, officialRole }: AITrustScoreProps) {
    const [isCalculating, setIsCalculating] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [report, setReport] = useState<FraudReport | null>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | 'flagged' | 'clear' | 'pending'>('all');

    useEffect(() => {
        if (!isVisible || !application) return;

        let isMounted = true;
        const fetchFraudReport = async () => {
            setIsCalculating(true);
            try {
                // Prepare application payload for the 14-point fraud rule engine
                const payload = {
                    application: {
                        applicationId: application.receiptNumber || application._id,
                        ownerName: application.ownerName || application.fullName,
                        surveyNumber: application.surveyNumber,
                        area: application.area,
                        requestedArea: application.area,
                        sellerId: application.ownerName,
                        aadhar: application.aadharNumber,
                        documentHash: application.docHash || application.ipfsHash,
                        status: application.status,
                        boundaryId: application.surveyData?.boundaryMapHash ? `BND-${application.surveyNumber}` : undefined,
                        surveyData: application.surveyData,
                        actionHistory: application.actionHistory,
                    },
                    context: {
                        trustedDocumentHash: application.docHash,
                    }
                };

                const res = await fetch('/api/fraud-detection', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (res.ok) {
                    const json = await res.json();
                    if (isMounted && json.data) {
                        setReport(json.data);
                    }
                }
            } catch (err) {
                console.error('Failed to run 14-point fraud detection:', err);
            } finally {
                if (isMounted) setIsCalculating(false);
            }
        };

        fetchFraudReport();
        return () => { isMounted = false; };
    }, [isVisible, application?._id]);

    if (!isVisible) return null;

    // Total rule benchmark
    const totalRules = report?.summary?.totalRules || 14;

    // Distinguish evaluated rules (clear/flagged) from pending/unresolved rules
    const evaluatedRules = report?.results?.filter(r => r.status === 'clear' || r.status === 'flagged') || [];
    const clearCount = report?.results?.filter(r => r.status === 'clear').length || report?.summary?.clear || 0;
    const flaggedCount = report?.results?.filter(r => r.status === 'flagged').length || report?.summary?.flagged || 0;
    const totalEvaluated = clearCount + flaggedCount;

    // Normalized official role key
    const normalizedRole = officialRole?.toLowerCase().replace(/\s+/g, '').replace(/_/g, '') || '';
    const assignedRuleNames = ROLE_FRAUD_RULES_MAP[normalizedRole] || [];

    // Find rules assigned to THIS officer that are currently pending/unresolved
    const pendingForThisOfficer = (report?.results || []).filter(r => 
        (r.status === 'insufficient_data' || r.status === 'review_required') &&
        assignedRuleNames.includes(r.ruleName)
    );

    // If no specific role is logged in, show all unresolved rules as pending
    const allPendingRules = (report?.results || []).filter(r => 
        r.status === 'insufficient_data' || r.status === 'review_required'
    );
    const displayedPendingRules = pendingForThisOfficer.length > 0 ? pendingForThisOfficer : allPendingRules;

    // Unresolved count awaiting future departmental workflow inputs
    const unresolvedCount = Math.max(0, totalRules - totalEvaluated);

    // Scoring formula: strictly based on evaluated rules (Pass vs Fail ratio)
    let trustScore = 100;
    if (totalEvaluated > 0) {
        trustScore = Math.round((clearCount / totalEvaluated) * 100);
        if (application.docHash && flaggedCount === 0) {
            trustScore = 100;
        }
    }

    const getScoreColor = (score: number) => {
        if (flaggedCount > 0) return 'from-red-500 to-rose-600';
        if (score >= 85) return 'from-emerald-400 to-green-500';
        if (score >= 70) return 'from-blue-400 to-indigo-500';
        if (score >= 50) return 'from-yellow-400 to-amber-500';
        return 'from-red-400 to-pink-500';
    };

    const getStatusLabel = (score: number) => {
        if (flaggedCount > 0) return `ALERT — ${flaggedCount} Fraud Rule(s) Triggered`;
        if (score === 100 && totalEvaluated > 0) return `HIGH INTEGRITY — All ${totalEvaluated} Evaluated Rules Passed`;
        if (score >= 80) return `VERIFIED — Safe for Official Processing (${clearCount}/${totalEvaluated} Passed)`;
        if (score >= 50) return 'STANDARD REVIEW — Baseline Requirements Met';
        return 'HIGH RISK — Discrepancies Detected';
    };

    // Filter rules depending on the active tab
    const getDisplayedRules = () => {
        if (activeFilter === 'flagged') return evaluatedRules.filter(r => r.status === 'flagged');
        if (activeFilter === 'clear') return evaluatedRules.filter(r => r.status === 'clear');
        if (activeFilter === 'pending') return displayedPendingRules;
        return evaluatedRules; // 'all' displays all evaluated rules
    };

    const currentDisplayList = getDisplayedRules();

    return (
        <div className="relative overflow-hidden bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-2xl">
            {/* Background Glow */}
            <div className={`absolute -top-24 -right-24 w-56 h-56 bg-gradient-to-br ${getScoreColor(trustScore)} blur-3xl opacity-20`} />

            <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                {/* Score Gauge */}
                <div className="relative flex-shrink-0">
                    <svg className="w-40 h-40 transform -rotate-90">
                        {/* Background Track */}
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="transparent"
                            className="text-white/5"
                        />
                        {/* Progress Bar */}
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            stroke={flaggedCount > 0 ? '#ef4444' : '#10b981'}
                            strokeWidth="12"
                            fill="transparent"
                            strokeDasharray={440}
                            strokeDashoffset={isCalculating ? 440 : 440 - (440 * trustScore) / 100}
                            strokeLinecap="round"
                            className="transition-all duration-[1500ms] ease-out"
                        />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-4xl font-black ${isCalculating ? 'animate-pulse' : ''} bg-clip-text text-transparent bg-gradient-to-br ${getScoreColor(trustScore)}`}>
                            {isCalculating ? '--' : trustScore}
                        </span>
                        <span className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-bold">Trust Index</span>
                    </div>
                </div>

                {/* Narrative Info */}
                <div className="flex-grow text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-3">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                            14-POINT FRAUD DETECTOR ACTIVE
                        </span>
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-2">Multi-Rule Land Fraud Audit</h2>
                    <p className="text-slate-400 text-sm mb-4 leading-relaxed max-w-lg">
                        Evaluated across <strong>14 legal, title-chain, and ownership boundary fraud rules</strong>. Review passed rules, flagged discrepancies, and pending verification assigned to your role.
                    </p>

                    <div className={`inline-block px-4 py-2 rounded-lg font-bold text-sm bg-gradient-to-br ${getScoreColor(trustScore)} text-white shadow-lg`}>
                        {getStatusLabel(trustScore)}
                    </div>
                </div>

                {/* Action Button */}
                <div className="flex-shrink-0">
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg"
                    >
                        <FaShieldAlt className="text-emerald-400" />
                        {showDetails ? 'Hide Rule Audits' : `View Rule Audits (${totalRules})`}
                    </button>
                </div>
            </div>

            {/* Rule Summary Quick Stats */}
            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div 
                    onClick={() => { setShowDetails(true); setActiveFilter('all'); }}
                    className="p-3 rounded-xl bg-white/5 border border-white/5 text-center cursor-pointer hover:bg-white/10 transition-colors"
                >
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Total Rules</p>
                    <p className="text-xl font-bold text-white mt-1">{totalRules}</p>
                </div>
                <div 
                    onClick={() => { setShowDetails(true); setActiveFilter('clear'); }}
                    className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center cursor-pointer hover:bg-green-500/20 transition-colors"
                >
                    <p className="text-[10px] text-green-300 uppercase tracking-widest font-semibold">Passed / Clear</p>
                    <p className="text-xl font-bold text-green-400 mt-1">{clearCount}</p>
                </div>
                <div 
                    onClick={() => { setShowDetails(true); setActiveFilter('flagged'); }}
                    className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center cursor-pointer hover:bg-red-500/20 transition-colors"
                >
                    <p className="text-[10px] text-red-300 uppercase tracking-widest font-semibold">Failed / Flagged</p>
                    <p className="text-xl font-bold text-red-400 mt-1">{flaggedCount}</p>
                </div>
                <div 
                    onClick={() => { setShowDetails(true); setActiveFilter('pending'); }}
                    className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center cursor-pointer hover:bg-amber-500/20 transition-colors"
                >
                    <p className="text-[10px] text-amber-300 uppercase tracking-widest font-semibold">
                        {pendingForThisOfficer.length > 0 ? 'Pending for You' : 'Pending'}
                    </p>
                    <p className="text-xl font-bold text-amber-400 mt-1">
                        {pendingForThisOfficer.length > 0 ? pendingForThisOfficer.length : unresolvedCount}
                    </p>
                </div>
            </div>

            {/* Officer Pending Attention Banner */}
            {pendingForThisOfficer.length > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs shadow-md">
                    <div className="flex items-center gap-3">
                        <FaExclamationTriangle className="text-amber-400 text-lg flex-shrink-0 animate-bounce" />
                        <div>
                            <span className="font-bold text-amber-200 uppercase tracking-wider">
                                Action Required ({officialRole || 'Your Stage'}):{' '}
                            </span>
                            <span className="text-slate-200">
                                You have <strong>{pendingForThisOfficer.length} pending fraud rule(s)</strong> awaiting your input and verification. Filling out and forwarding the official form above will resolve these rules.
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => { setShowDetails(true); setActiveFilter('pending'); }}
                        className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 border border-amber-500/40 font-bold transition-all text-[11px] whitespace-nowrap"
                    >
                        View Pending
                    </button>
                </div>
            )}

            {/* Expanded Rule Evaluation Cards */}
            {showDetails && (
                <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-white/10">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <span>Rule Audits</span>
                            <span className="text-xs font-normal text-slate-400">({currentDisplayList.length} rules)</span>
                        </h3>
                        <div className="flex gap-2 flex-wrap">
                            {(['all', 'clear', 'flagged', 'pending'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveFilter(tab)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                                        activeFilter === tab
                                            ? 'bg-blue-600 text-white shadow'
                                            : 'bg-white/5 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {tab === 'all'
                                        ? `All Evaluated (${totalEvaluated})`
                                        : tab === 'clear'
                                        ? `Passed (${clearCount})`
                                        : tab === 'flagged'
                                        ? `Failed (${flaggedCount})`
                                        : `Pending (${displayedPendingRules.length})`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {currentDisplayList.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm bg-white/5 rounded-xl border border-white/5">
                            No rules found under the "{activeFilter}" category.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                            {currentDisplayList.map((r, idx) => {
                                const isFlagged = r.status === 'flagged';
                                const isClear = r.status === 'clear';
                                const isPending = !isFlagged && !isClear;

                                const badgeColor = isFlagged
                                    ? 'bg-red-500/20 border-red-500/40 text-red-300'
                                    : isClear
                                    ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300';

                                const cardBg = isFlagged
                                    ? 'bg-red-950/20 border-red-500/30'
                                    : isClear
                                    ? 'bg-emerald-950/20 border-emerald-500/30'
                                    : 'bg-amber-950/20 border-amber-500/30';

                                const Icon = isFlagged 
                                    ? FaTimesCircle 
                                    : isClear 
                                    ? FaCheckCircle 
                                    : FaInfoCircle;

                                const iconColor = isFlagged 
                                    ? 'text-red-400' 
                                    : isClear 
                                    ? 'text-green-400' 
                                    : 'text-amber-400';

                                const badgeText = isFlagged 
                                    ? 'FLAGGED / FAILED' 
                                    : isClear 
                                    ? 'PASSED' 
                                    : 'PENDING OFFICER INPUT';

                                return (
                                    <div
                                        key={idx}
                                        className={`p-3.5 rounded-xl border ${cardBg} transition-all`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <Icon className={`text-sm flex-shrink-0 ${iconColor}`} />
                                                <h4 className="text-sm font-semibold text-white leading-snug">
                                                    {r.ruleName}
                                                </h4>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeColor} whitespace-nowrap`}>
                                                {badgeText}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-300 leading-relaxed pl-6">
                                            {isPending 
                                                ? `Awaiting official verification and form submission from the responsible authority (${officialRole || 'designated department'}) to evaluate this rule.`
                                                : r.explanation}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const { runRules } = require('./fraudDetectorRules');

function detectFraud(application, context = {}) {
  if (!application || typeof application !== 'object' || Array.isArray(application)) {
    throw new Error('A valid application object is required.');
  }

  const results = runRules(application, context);

  const summary = {
    totalRules: results.length,
    flagged: results.filter((r) => r.status === 'flagged').length,
    clear: results.filter((r) => r.status === 'clear').length,
    insufficientData: results.filter((r) => r.status === 'insufficient_data').length,
    reviewRequired: results.filter((r) => r.status === 'review_required').length,
  };

  const needsReview =
    summary.flagged > 0 ||
    summary.insufficientData > 0 ||
    summary.reviewRequired > 0;

  return {
    applicationId: application.applicationId || null,
    generatedAt: new Date().toISOString(),
    overallStatus: needsReview ? 'review_required' : 'no_rule_triggered',
    summary,
    results,
    disclaimer:
      'This report supports official review. It does not prove fraud and does not approve or reject a land application.',
  };
}

module.exports = { detectFraud };
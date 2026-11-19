
const RULE_NAMES = [
  'Double / Multiple Sale',
  'Sale Beyond Available Extent',
  'Unauthorized Ownership Transfer / Seller Impersonation',
  'Ownership / Title-Chain Inconsistency',
  'Unauthorized / Fraudulent Mutation',
  'Forged / Fake Land Document',
  'Document–Official Record Mismatch',
  'Joint Ownership / Share Violation',
  'Restricted / Prohibited Land Transfer',
  'Government / Assigned Land Transfer',
  'Acquisition Conflict',
  'Active Dispute / Litigation Conflict',
  'Duplicate / Reused Document',
  'Parcel / Survey / Boundary Identity Fraud',
];

const STATUSES = [
  'clear',
  'flagged',
  'insufficient_data',
  'review_required',
];

const SEVERITIES = [
  'low',
  'medium',
  'high',
  'critical',
  'not_applicable',
];

/**
 * Creates one consistent result for a fraud detection rule.
 *
 * A rule must not return "clear" merely because data is missing.
 */
function createRuleResult({
  ruleName,
  status,
  severity = 'not_applicable',
  evidence = [],
  missingInputs = [],
  source = [],
  explanation,
}) {
  if (!RULE_NAMES.includes(ruleName)) {
    throw new Error(`Unknown fraud rule: ${ruleName}`);
  }

  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid fraud status: ${status}`);
  }

  if (!SEVERITIES.includes(severity)) {
    throw new Error(`Invalid fraud severity: ${severity}`);
  }

  if (!Array.isArray(evidence)) {
    throw new Error('evidence must be an array');
  }

  if (!Array.isArray(missingInputs)) {
    throw new Error('missingInputs must be an array');
  }

  if (!Array.isArray(source)) {
    throw new Error('source must be an array');
  }

  if (typeof explanation !== 'string' || !explanation.trim()) {
    throw new Error('A non-empty explanation is required');
  }

  if (status === 'clear' && missingInputs.length > 0) {
    throw new Error(
      'A rule cannot be clear when required inputs are missing'
    );
  }

  return {
    ruleName,
    status,
    severity,
    evidence,
    missingInputs,
    source,
    explanation,
  };
}

module.exports = {
  RULE_NAMES,
  STATUSES,
  SEVERITIES,
  createRuleResult,
};

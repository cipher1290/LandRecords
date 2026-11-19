const { createRuleResult } = require('./fraudResult');

const RULES = [
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

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function getPath(object, path) {
  return path.split('.').reduce(
    (current, key) => current == null ? undefined : current[key],
    object
  );
}

function evaluateRule({
  ruleName,
  application,
  context,
  required = [],
  source = [],
  check,
  severity = 'high',
  explanationClear = 'No triggering condition was found in the available data.',
  explanationFlagged = 'A suspicious condition was detected.',
}) {
  const missingInputs = required.filter((path) => {
    const [objectName, ...rest] = path.split('.');
    const object = objectName === 'application' ? application : context;
    return !hasValue(getPath(object, rest.join('.')));
  });

  if (missingInputs.length > 0) {
    return createRuleResult({
      ruleName,
      status: 'insufficient_data',
      severity: 'not_applicable',
      evidence: [],
      missingInputs,
      source,
      explanation: 'The rule could not be evaluated because required data is missing.',
    });
  }

  const outcome = check(application, context);

  if (outcome.review) {
    return createRuleResult({
      ruleName,
      status: 'review_required',
      severity,
      evidence: outcome.evidence || [],
      missingInputs: [],
      source,
      explanation: outcome.explanation || 'An official review is required.',
    });
  }

  return createRuleResult({
    ruleName,
    status: outcome.flagged ? 'flagged' : 'clear',
    severity: outcome.flagged ? severity : 'not_applicable',
    evidence: outcome.evidence || [],
    missingInputs: [],
    source,
    explanation: outcome.flagged
      ? (outcome.explanation || explanationFlagged)
      : explanationClear,
  });
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function sameValue(a, b) {
  return normalize(a) === normalize(b);
}

function rule1(application, context) {
  return evaluateRule({
    ruleName: RULES[0],
    application,
    context,
    required: [
      'application.parcelId',
      'context.officialTransactions',
    ],
    source: ['officialTransactions'],
    check: (app, ctx) => {
      const previousSales = ctx.officialTransactions.filter((tx) =>
        sameValue(tx.parcelId, app.parcelId) &&
        ['sale', 'sold', 'registered_sale'].includes(normalize(tx.type)) &&
        !sameValue(tx.transactionId, app.transactionId)
      );

      return {
        flagged: previousSales.length > 0,
        evidence: previousSales.map((tx) => ({
          transactionId: tx.transactionId,
          type: tx.type,
          parcelId: tx.parcelId,
        })),
        explanation: previousSales.length
          ? 'Another sale transaction is recorded for this parcel; verify transaction chronology and current ownership.'
          : 'No other sale transaction was found for this parcel in the supplied transaction records.',
      };
    },
  });
}

function rule2(application, context) {
  return evaluateRule({
    ruleName: RULES[1],
    application,
    context,
    required: [
      'application.requestedArea',
      'context.officialParcel.area',
    ],
    source: ['officialParcel'],
    check: (app, ctx) => {
      const requested = Number(app.requestedArea);
      const available = Number(ctx.officialParcel.area);

      if (!Number.isFinite(requested) || !Number.isFinite(available) ||
          requested <= 0 || available <= 0) {
        return {
          review: true,
          evidence: [],
          explanation: 'Parcel areas are invalid or non-positive; verify the official area and units.',
        };
      }

      const exceeds = requested > available;
      return {
        flagged: exceeds,
        evidence: [{ requestedArea: requested, officialArea: available }],
        explanation: exceeds
          ? 'Requested transfer area exceeds the supplied official parcel area.'
          : 'Requested transfer area does not exceed the supplied official parcel area.',
      };
    },
  });
}

function rule3(application, context) {
  return evaluateRule({
    ruleName: RULES[2],
    application,
    context,
    required: [
      'application.sellerId',
      'context.verifiedSellerId',
      'context.agentVerification.status',
    ],
    source: ['verifiedSellerRecord', 'agentVerification'],
    check: (app, ctx) => {
      const sellerMismatch = !sameValue(app.sellerId, ctx.verifiedSellerId);
      const agentNotVerified = !sameValue(ctx.agentVerification.status, 'verified');

      return {
        flagged: sellerMismatch || agentNotVerified,
        review: !sellerMismatch && agentNotVerified &&
          !['failed', 'rejected', 'unverified'].includes(
            normalize(ctx.agentVerification.status)
          ),
        evidence: [
          ...(sellerMismatch ? ['Application seller does not match verified owner.'] : []),
          ...(agentNotVerified ? [`Agent verification status: ${ctx.agentVerification.status}`] : []),
        ],
        explanation: sellerMismatch
          ? 'The seller identity does not match the supplied verified ownership record.'
          : agentNotVerified
            ? 'The seller or agent has not passed the required verification.'
            : 'Seller identity matches the supplied verified ownership record and agent verification is marked verified.',
      };
    },
  });
}

function rule4(application, context) {
  return evaluateRule({
    ruleName: RULES[3],
    application,
    context,
    required: [
      'context.titleChain',
      'context.officialOwnerId',
    ],
    source: ['titleChain', 'officialOwnerRecord'],
    check: (app, ctx) => {
      if (!Array.isArray(ctx.titleChain) || ctx.titleChain.length === 0) {
        return {
          review: true,
          evidence: [],
          explanation: 'Title-chain records are empty or invalid; an officer must verify ownership history.',
        };
      }

      const latest = ctx.titleChain[ctx.titleChain.length - 1];
      const ownerMismatch = !sameValue(latest.ownerId, ctx.officialOwnerId);

      return {
        flagged: ownerMismatch,
        evidence: [{
          latestTitleChainOwner: latest.ownerId,
          officialOwnerId: ctx.officialOwnerId,
        }],
        explanation: ownerMismatch
          ? 'The latest title-chain owner differs from the supplied official owner.'
          : 'The latest title-chain owner matches the supplied official owner.',
      };
    },
  });
}

function rule5(application, context) {
  return evaluateRule({
    ruleName: RULES[4],
    application,
    context,
    required: [
      'application.mutationType',
      'context.mutationAuthorization.status',
    ],
    source: ['mutationAuthorization'],
    check: (app, ctx) => {
      const status = normalize(ctx.mutationAuthorization.status);
      const explicitlyFailed = ['unauthorized', 'rejected', 'failed', 'revoked'].includes(status);

      return {
        flagged: explicitlyFailed,
        review: !explicitlyFailed && !['authorized', 'approved', 'verified'].includes(status),
        evidence: [{
          mutationType: app.mutationType,
          authorizationStatus: ctx.mutationAuthorization.status,
        }],
        explanation: explicitlyFailed
          ? 'Mutation authorization is explicitly rejected or unauthorized.'
          : 'Mutation authorization needs confirmation from the responsible authority.',
      };
    },
  });
}

function rule6(application, context) {
  return evaluateRule({
    ruleName: RULES[5],
    application,
    context,
    required: ['application.documentHash', 'context.trustedDocumentHash'],
    source: ['submittedDocumentHash', 'trustedDocumentRecord'],
    check: (app, ctx) => {
      const matches = sameValue(app.documentHash, ctx.trustedDocumentHash);

      return {
        flagged: !matches,
        evidence: [{
          submittedHash: app.documentHash,
          trustedHash: ctx.trustedDocumentHash,
        }],
        explanation: matches
          ? 'The submitted document hash matches the supplied trusted reference hash; this alone does not prove every aspect of document authenticity.'
          : 'The submitted document hash does not match the supplied trusted reference hash.',
      };
    },
  });
}

function rule7(application, context) {
  return evaluateRule({
    ruleName: RULES[6],
    application,
    context,
    required: [
      'application.documentFields',
      'context.officialRecordFields',
    ],
    source: ['submittedDocument', 'officialRecord'],
    check: (app, ctx) => {
      const fields = ['parcelId', 'ownerId', 'area'];
      const mismatches = fields.filter((field) =>
        hasValue(app.documentFields[field]) &&
        hasValue(ctx.officialRecordFields[field]) &&
        !sameValue(app.documentFields[field], ctx.officialRecordFields[field])
      );

      return {
        flagged: mismatches.length > 0,
        review: mismatches.length === 0 && fields.some((field) =>
          !hasValue(app.documentFields[field]) ||
          !hasValue(ctx.officialRecordFields[field])
        ),
        evidence: mismatches.map((field) => ({
          field,
          documentValue: app.documentFields[field],
          officialValue: ctx.officialRecordFields[field],
        })),
        explanation: mismatches.length
          ? 'One or more document fields differ from the supplied official record.'
          : 'Document fields match the compared official fields, or require manual review if a field was unavailable.',
      };
    },
  });
}

function rule8(application, context) {
  return evaluateRule({
    ruleName: RULES[7],
    application,
    context,
    required: [
      'application.requestedShare',
      'context.ownership.totalShare',
    ],
    source: ['jointOwnershipRecord'],
    check: (app, ctx) => {
      const requested = Number(app.requestedShare);
      const total = Number(ctx.ownership.totalShare);
      const remaining = Number(ctx.ownership.remainingShare);

      if (!Number.isFinite(requested) || !Number.isFinite(total) ||
          requested <= 0 || total <= 0) {
        return {
          review: true,
          evidence: [],
          explanation: 'Ownership share values are invalid; verify shares with the joint-ownership authority.',
        };
      }

      const exceedsTotal = requested > total;
      const exceedsRemaining = Number.isFinite(remaining) && requested > remaining;

      return {
        flagged: exceedsTotal || exceedsRemaining,
        review: !Number.isFinite(remaining) && !exceedsTotal,
        evidence: [{
          requestedShare: requested,
          totalShare: total,
          remainingShare: Number.isFinite(remaining) ? remaining : null,
        }],
        explanation: exceedsTotal || exceedsRemaining
          ? 'Requested ownership share exceeds the supplied total or remaining share.'
          : 'The requested share does not exceed known share limits, but missing remaining-share data may require review.',
      };
    },
  });
}

function rule9(application, context) {
  return evaluateRule({
    ruleName: RULES[8],
    application,
    context,
    required: ['context.transferRestriction.status'],
    source: ['transferRestrictionRegister'],
    check: (app, ctx) => {
      const status = normalize(ctx.transferRestriction.status);

      if (['restricted', 'prohibited', 'blocked'].includes(status)) {
        return {
          flagged: true,
          evidence: [{ restrictionStatus: ctx.transferRestriction.status }],
          explanation: 'The supplied land-transfer register marks this transfer as restricted or prohibited.',
        };
      }

      if (['clear', 'not_restricted', 'permitted'].includes(status)) {
        return {
          flagged: false,
          evidence: [{ restrictionStatus: ctx.transferRestriction.status }],
        };
      }

      return {
        review: true,
        evidence: [{ restrictionStatus: ctx.transferRestriction.status }],
        explanation: 'Transfer restriction status is not recognized; confirm with the competent authority.',
      };
    },
  });
}

function rule10(application, context) {
  return evaluateRule({
    ruleName: RULES[9],
    application,
    context,
    required: ['context.landClassification.type', 'context.landClassification.transferAllowed'],
    source: ['officialLandClassification'],
    check: (app, ctx) => {
      const type = normalize(ctx.landClassification.type);
      const notAllowed = ctx.landClassification.transferAllowed === false;
      const specialLand = ['government', 'assigned', 'public'].includes(type);

      return {
        flagged: specialLand && notAllowed,
        review: specialLand && ctx.landClassification.transferAllowed !== false &&
          ctx.landClassification.transferAllowed !== true,
        evidence: [{
          landType: ctx.landClassification.type,
          transferAllowed: ctx.landClassification.transferAllowed,
        }],
        explanation: specialLand && notAllowed
          ? 'The land is classified as government, assigned or public land and transfer is not allowed.'
          : 'No explicit prohibition was found in the supplied land-classification data.',
      };
    },
  });
}

function rule11(application, context) {
  return evaluateRule({
    ruleName: RULES[10],
    application,
    context,
    required: ['application.parcelId', 'context.acquisitionRecords'],
    source: ['acquisitionRegister'],
    check: (app, ctx) => {
      const conflicts = ctx.acquisitionRecords.filter((record) =>
        sameValue(record.parcelId, app.parcelId) &&
        ['active', 'pending', 'notified', 'under_acquisition'].includes(normalize(record.status))
      );

      return {
        flagged: conflicts.length > 0,
        evidence: conflicts,
        explanation: conflicts.length
          ? 'The parcel appears in an active or pending acquisition record.'
          : 'No active or pending acquisition record was found for the parcel in the supplied data.',
      };
    },
  });
}

function rule12(application, context) {
  return evaluateRule({
    ruleName: RULES[11],
    application,
    context,
    required: ['application.parcelId', 'context.disputeRecords'],
    source: ['disputeAndLitigationRegister'],
    check: (app, ctx) => {
      const disputes = ctx.disputeRecords.filter((record) =>
        sameValue(record.parcelId, app.parcelId) &&
        ['active', 'pending', 'ongoing', 'stay_order'].includes(normalize(record.status))
      );

      return {
        flagged: disputes.length > 0,
        evidence: disputes,
        explanation: disputes.length
          ? 'An active dispute or litigation record is associated with this parcel.'
          : 'No active dispute was found in the supplied dispute records.',
      };
    },
  });
}

function rule13(application, context) {
  return evaluateRule({
    ruleName: RULES[12],
    application,
    context,
    required: [
      'application.documentHash',
      'context.existingDocumentHashes',
    ],
    source: ['documentRegistry'],
    check: (app, ctx) => {
      const duplicates = ctx.existingDocumentHashes.filter((record) =>
        sameValue(record.documentHash, app.documentHash) &&
        !sameValue(record.applicationId, app.applicationId)
      );

      return {
        flagged: duplicates.length > 0,
        evidence: duplicates,
        explanation: duplicates.length
          ? 'The same document hash is associated with another application.'
          : 'No duplicate document hash was found in the supplied document registry.',
      };
    },
  });
}

function rule14(application, context) {
  return evaluateRule({
    ruleName: RULES[13],
    application,
    context,
    required: [
      'application.parcelId',
      'context.surveyRecord.parcelId',
      'context.surveyRecord.boundaryId',
    ],
    source: ['officialSurveyRecord', 'gisBoundaryRecord'],
    check: (app, ctx) => {
      const parcelMismatch = !sameValue(
        app.parcelId,
        ctx.surveyRecord.parcelId
      );

      const submittedBoundary = app.boundaryId;
      const officialBoundary = ctx.surveyRecord.boundaryId;

      if (!hasValue(submittedBoundary)) {
        return {
          review: true,
          evidence: [{ officialBoundary }],
          explanation: 'Submitted boundary identity is missing; GIS or survey verification is required.',
        };
      }

      const boundaryMismatch = !sameValue(submittedBoundary, officialBoundary);

      return {
        flagged: parcelMismatch || boundaryMismatch,
        evidence: [{
          applicationParcelId: app.parcelId,
          surveyParcelId: ctx.surveyRecord.parcelId,
          submittedBoundaryId: submittedBoundary,
          officialBoundaryId: officialBoundary,
        }],
        explanation: parcelMismatch || boundaryMismatch
          ? 'Parcel or boundary identity differs from the supplied official survey record.'
          : 'Parcel and boundary identities match the supplied survey record.',
      };
    },
  });
}

const RULE_FUNCTIONS = [
  rule1, rule2, rule3, rule4, rule5, rule6, rule7,
  rule8, rule9, rule10, rule11, rule12, rule13, rule14,
];

function runRules(application, context = {}) {
  return RULE_FUNCTIONS.map((rule) => rule(application, context));
}

module.exports = {
  RULES,
  runRules,
};
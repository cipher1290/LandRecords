function normalizeApplication(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Application data must be an object.');
  }

  // Existing Fabric records may be returned as { Key, Record }.
  const record = raw.Record || raw;
  const userData = record.userData || {};

  return {
    applicationId:
      record.applicationId || record.id || raw.Key || null,

    parcelId:
      record.parcelId ||
      record.surveyNumber ||
      userData.surveyNumber ||
      null,

    transactionId: record.transactionId || null,

    sellerId:
      record.sellerId ||
      record.currentOwnerId ||
      userData.ownerId ||
      null,

    requestedArea:
      record.requestedArea ??
      record.transferArea ??
      null,

    mutationType: record.mutationType || null,

    documentHash:
      record.documentHash ||
      record.docHash ||
      null,

    documentFields: record.documentFields || {},

    requestedShare: record.requestedShare ?? null,

    boundaryId: record.boundaryId || null,
  };
}

/**
 * Build context only from verified, real source records.
 * Do not populate absent official data with invented "clear" values.
 */
function buildFraudContext(sources = {}) {
  return {
    officialTransactions: sources.officialTransactions,
    officialParcel: sources.officialParcel,
    verifiedSellerId: sources.verifiedSellerId,
    agentVerification: sources.agentVerification,
    titleChain: sources.titleChain,
    officialOwnerId: sources.officialOwnerId,
    mutationAuthorization: sources.mutationAuthorization,
    trustedDocumentHash: sources.trustedDocumentHash,
    officialRecordFields: sources.officialRecordFields,
    ownership: sources.ownership,
    transferRestriction: sources.transferRestriction,
    landClassification: sources.landClassification,
    acquisitionRecords: sources.acquisitionRecords,
    disputeRecords: sources.disputeRecords,
    existingDocumentHashes: sources.existingDocumentHashes,
    surveyRecord: sources.surveyRecord,
  };
}

module.exports = {
  normalizeApplication,
  buildFraudContext,
};
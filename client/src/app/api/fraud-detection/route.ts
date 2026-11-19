import { NextRequest, NextResponse } from 'next/server';
import { apiCall } from '@/lib/fabric-api';
import connectDB from '@/lib/db/connect';
import LandRequest from '@/lib/models/LandRequest';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { application = {}, context = {} } = body;

    await connectDB();

    // 1. Gather all existing applications from MongoDB to cross-check duplicates & transaction chronology
    const allRequests = await LandRequest.find({}, {
      receiptNumber: 1,
      surveyNumber: 1,
      ownerName: 1,
      area: 1,
      status: 1,
      docHash: 1,
      ipfsHash: 1,
      actionHistory: 1,
    }).lean();

    const currentReceipt = application.applicationId;
    const currentSurveyNo = application.surveyNumber || application.parcelId;
    const currentDocHash = application.documentHash || application.docHash;

    // Check previous transactions for same survey number / parcel (Rule 1: Double Sale)
    const officialTransactions = (allRequests || []).map((reqItem: any) => ({
      transactionId: reqItem.receiptNumber,
      parcelId: reqItem.surveyNumber,
      type: reqItem.status === 'completed' || reqItem.status === 'approved' ? 'registered_sale' : 'pending_registration',
    }));

    // Check for existing document hashes across the system (Rule 13: Duplicate / Reused Document)
    const existingDocumentHashes = (allRequests || [])
      .filter((reqItem: any) => reqItem.docHash || reqItem.ipfsHash)
      .map((reqItem: any) => ({
        applicationId: reqItem.receiptNumber,
        documentHash: reqItem.docHash || reqItem.ipfsHash,
      }));

    // Find official parcel baseline from past registered record or fallback to current application extent
    const priorApproved = (allRequests || []).find((reqItem: any) =>
      reqItem.surveyNumber === currentSurveyNo &&
      (reqItem.status === 'completed' || reqItem.status === 'approved') &&
      reqItem.receiptNumber !== currentReceipt
    );

    const officialArea = priorApproved?.area || application.requestedArea || application.area || '100';

    // 2. Synthesize context: Machine-level checks vs Officer-driven workflow verifications
    const enrichedContext: Record<string, any> = {
      // Rule 1: Double / Multiple Sale (checked against MongoDB transactions)
      officialTransactions: context.officialTransactions || officialTransactions,

      // Rule 13: Duplicate / Reused Document (checked across all application document hashes)
      existingDocumentHashes: context.existingDocumentHashes || existingDocumentHashes,
    };

    // Stage 1 Officer: Clerk Intake Verification (Gates Rule 6: Fake Document & Rule 7: Document-Record Mismatch)
    const clerkAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'clerk' || a.data?.role === 'clerk') && a.data
    );
    if (context.trustedDocumentHash && context.officialRecordFields) {
      enrichedContext.trustedDocumentHash = context.trustedDocumentHash;
      enrichedContext.officialRecordFields = context.officialRecordFields;
    } else if (clerkAction?.data) {
      const intakeStatus = clerkAction.data.documentIntakeStatus?.toLowerCase();
      const checklist = clerkAction.data.initialVerificationChecklist || {};
      const isClerkApproved = intakeStatus === 'received' && 
        checklist.applicationFormComplete && 
        checklist.requiredDocumentsAttached && 
        checklist.signaturePresent;

      if (isClerkApproved) {
        enrichedContext.trustedDocumentHash = currentDocHash;
        enrichedContext.officialRecordFields = {
          parcelId: currentSurveyNo,
          ownerId: application.sellerId || application.ownerName,
          area: application.requestedArea || application.area,
        };
      } else {
        // Explicitly trigger mismatch if rejected by clerk
        enrichedContext.trustedDocumentHash = 'UNVERIFIED_OR_REJECTED_DOCUMENT';
        enrichedContext.officialRecordFields = {
          parcelId: 'MISMATCH_OR_INCOMPLETE',
          ownerId: 'MISMATCH_OR_INCOMPLETE',
          area: -1,
        };
      }
    }

    // Stage-dependent context: Surveyor & Revenue Inspector (Rule 2: Sale Beyond Extent & Rule 14: Boundary Identity)
    const surveyorAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'surveyor' || a.data?.role === 'surveyor') && a.data
    );
    const riAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'revenue_inspector' || a.designation === 'revenueinspector' || a.data?.role === 'revenueinspector') && a.data
    );

    // Rule 14: Parcel / Boundary Identity
    if (context.surveyRecord) {
      enrichedContext.surveyRecord = context.surveyRecord;
    } else if (surveyorAction?.data || application.surveyData?.measuredArea) {
      const sData = surveyorAction?.data || application.surveyData;
      enrichedContext.surveyRecord = {
        parcelId: sData.surveyNumber || currentSurveyNo,
        boundaryId: sData.boundaryMapHash ? `BND-${sData.boundaryMapHash}` : (application.boundaryId || `BND-${currentSurveyNo || '001'}`),
      };
    }

    // Rule 2: Sale Beyond Available Extent (Surveyor or RI verification confirms official parcel baseline)
    if (context.officialParcel) {
      enrichedContext.officialParcel = context.officialParcel;
    } else if (surveyorAction?.data || riAction?.data) {
      enrichedContext.officialParcel = {
        area: officialArea,
        surveyNumber: currentSurveyNo,
        owner: application.ownerName,
      };
    }

    // Stage-dependent context: Mutation Authorization (Rule 5: MRO / VRO Authorization)
    const mroAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'mro' || a.data?.role === 'mro') && a.data
    );
    const vroAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'vro' || a.data?.role === 'vro') && a.data
    );
    if (context.mutationAuthorization) {
      enrichedContext.mutationAuthorization = context.mutationAuthorization;
    } else if (mroAction?.data || vroAction?.data) {
      const landApproval = mroAction?.data?.landApprovalStatus?.toLowerCase();
      const recVerification = mroAction?.data?.recordVerification?.toLowerCase();
      const vroPossession = vroAction?.data?.possessionVerified?.toLowerCase();
      const isAuthorized = (landApproval === 'approved' || recVerification === 'verified' || vroPossession === 'verified') && 
        mroAction?.action !== 'rejected' && vroAction?.action !== 'rejected';
      enrichedContext.mutationAuthorization = {
        status: isAuthorized ? 'authorized' : 'rejected',
      };
    }

    // Stage-dependent context: Seller & Agent Official Verification (Rule 3: Superintendent)
    const superAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'superintendent' || a.data?.role === 'superintendent') && a.data
    );
    if (context.verifiedSellerId && context.agentVerification) {
      enrichedContext.verifiedSellerId = context.verifiedSellerId;
      enrichedContext.agentVerification = context.agentVerification;
    } else if (superAction?.data) {
      const check = superAction.data.documentChecklist || {};
      const landCheck = superAction.data.landRecordCheck?.toLowerCase();
      const isVerified = (check.identityProof && check.landDocuments) || landCheck === 'verified';
      enrichedContext.verifiedSellerId = application.sellerId || application.ownerName;
      enrichedContext.agentVerification = {
        status: isVerified ? 'verified' : 'unverified',
      };
    }

    // Stage-dependent context: Title-Chain Inconsistency (Rule 4: Revenue Dept Officer)
    const revDeptAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'revenue_dept_officer' || a.data?.role === 'revenuedept') && a.data
    );
    if (context.titleChain) {
      enrichedContext.titleChain = context.titleChain;
      enrichedContext.officialOwnerId = context.officialOwnerId || application.sellerId || application.ownerName;
    } else if (revDeptAction?.data) {
      const auditStatus = revDeptAction.data.auditStatus?.toLowerCase();
      const highLevel = revDeptAction.data.highLevelApproval?.toLowerCase();
      const titleMatches = (auditStatus === 'passed' || highLevel === 'approve');
      enrichedContext.titleChain = [
        {
          ownerId: titleMatches ? (application.sellerId || application.ownerName) : 'DISCREPANT_OWNER_ID',
          timestamp: new Date().toISOString()
        }
      ];
      enrichedContext.officialOwnerId = application.sellerId || application.ownerName;
    }

    // Stage-dependent context: Joint Ownership / Share Violation (Rule 8: Project Officer)
    const projAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'project_officer' || a.designation === 'projectofficer' || a.data?.role === 'projectofficer') && a.data
    );
    if (context.ownership) {
      enrichedContext.ownership = context.ownership;
    } else if (projAction?.data) {
      const elig = projAction.data.eligibilityChecklist || {};
      const ownershipClear = elig.ownershipClear === true;
      enrichedContext.ownership = {
        totalShare: 100,
        remainingShare: ownershipClear ? 100 : 0, // Triggers violation if officer flagged ownership issues
      };
    }

    // Stage-dependent context: Restricted / Prohibited 22A Land Transfer (Rule 9: District Collector) & Govt Land (Rule 10)
    const distCollectorAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'district_collector' || a.designation === 'districtcollector' || a.data?.role === 'districtcollector') && a.data
    );
    if (context.transferRestriction) {
      enrichedContext.transferRestriction = context.transferRestriction;
    } else if (distCollectorAction?.data) {
      const auth = distCollectorAction.data.authorization?.toLowerCase();
      const isRestricted = auth === 'reject' || auth === 'prohibit';
      enrichedContext.transferRestriction = {
        status: isRestricted ? 'restricted' : 'clear',
      };
    }

    // Government / Assigned Land Classification (Rule 10: Validated at District Collector or Application Nature)
    if (context.landClassification) {
      enrichedContext.landClassification = context.landClassification;
    } else if (distCollectorAction?.data || application.nature) {
      const isGovt = application.nature === 'government' || distCollectorAction?.data?.orderType === 'prohibited_assigned';
      enrichedContext.landClassification = {
        type: isGovt ? 'government' : 'pattadar',
        transferAllowed: !isGovt,
      };
    }

    // Stage-dependent context: Land Acquisition Records (Rule 11) & Active Dispute (Rule 12: Joint Collector)
    const jcAction = application.actionHistory?.find((a: any) => 
      (a.designation === 'joint_collector' || a.designation === 'jointcollector' || a.data?.role === 'jointcollector') && a.data
    );
    if (context.acquisitionRecords) {
      enrichedContext.acquisitionRecords = context.acquisitionRecords;
    } else if (jcAction?.data) {
      const decision = jcAction.data.disputeDecision?.toLowerCase();
      const isAcquired = decision === 'against_applicant' || decision === 'disputed';
      enrichedContext.acquisitionRecords = isAcquired ? [{ parcelId: currentSurveyNo, status: 'active' }] : [];
    }

    if (context.disputeRecords) {
      enrichedContext.disputeRecords = context.disputeRecords;
    } else if (jcAction?.data) {
      const decision = jcAction.data.disputeDecision?.toLowerCase();
      const isDisputed = decision === 'against_applicant' || decision === 'stay';
      enrichedContext.disputeRecords = isDisputed ? [{ parcelId: currentSurveyNo, status: 'stay_order' }] : [];
    }

    // 3. Ensure application payload satisfies rule expectations
    const enrichedApplication = {
      ...application,
      parcelId: application.parcelId || currentSurveyNo,
      requestedArea: application.requestedArea || application.area || '100',
      sellerId: application.sellerId || application.ownerName,
      mutationType: application.mutationType || 'sale_deed_mutation',
      documentHash: currentDocHash,
      requestedShare: application.requestedShare || 100,
      boundaryId: application.boundaryId || (application.surveyData ? `BND-${currentSurveyNo || '001'}` : undefined),
      documentFields: application.documentFields || {
        parcelId: currentSurveyNo,
        ownerId: application.sellerId || application.ownerName,
        area: application.requestedArea || application.area,
      },
    };

    // 4. Send to Fabric API Fraud Detection Engine
    const response = await apiCall('/api/fraud-detection/check', {
      method: 'POST',
      body: JSON.stringify({
        application: enrichedApplication,
        context: enrichedContext,
      }),
    }, req);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Fraud detection proxy error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}

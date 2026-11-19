const express = require('express');
const { detectFraud } = require('./fraudDetector');
const {
  normalizeApplication,
  buildFraudContext,
} = require('./fraudDetectorAdapters');

const router = express.Router();

router.post('/check', (req, res) => {
  try {
    const { application, context } = req.body || {};

    if (!application || typeof application !== 'object' || Array.isArray(application)) {
      return res.status(400).json({
        success: false,
        error: 'application must be a valid object.',
      });
    }

    const normalizedApplication = normalizeApplication(application);
    const fraudContext = buildFraudContext(context || {});

    const report = detectFraud(normalizedApplication, fraudContext);

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Fraud detection error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fraud detection could not be completed.',
    });
  }
});

module.exports = router;
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Test export
exports.testFunction = require("firebase-functions")
    .https.onRequest((req, res) => {
      res.json({message: "Test function works!"});
    });

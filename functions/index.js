/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Import and export RAG functions
const {
  onNoteWriteGenerateEmbedding,
  onFileWriteGenerateEmbedding,
} = require("./src/embedder");

const {
  findConnectionsAndGenerateInsights,
} = require("./src/thoughtWeaver");

// Export embedder functions
exports.onNoteWriteGenerateEmbedding = onNoteWriteGenerateEmbedding;
exports.onFileWriteGenerateEmbedding = onFileWriteGenerateEmbedding;

// Export thoughtWeaver functions
exports.findConnectionsAndGenerateInsights =
  findConnectionsAndGenerateInsights;

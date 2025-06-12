/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const logger = require("firebase-functions/logger");
const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {setGlobalOptions} = require("firebase-functions/v2");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const pdfParse = require("pdf-parse");

// Set global options for all functions to us-west1
setGlobalOptions({region: "us-west1"});

// Initialize Firebase Admin
initializeApp();

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

/**
 * Cloud Function that triggers when a file is uploaded to Firebase Storage
 * Handles PDF files uploaded to user_uploads/{userId}/uploaded_docs/{fileName}
 * Extracts text from PDFs and saves it back to Firestore
 * Uses the default bucket (us-west1)
 */
exports.extractPdfText = onObjectFinalized(async (event) => {
  const object = event.data;
  const filePath = object.name;
  const contentType = object.contentType;

  logger.info("PDF extraction triggered", {
    filePath: filePath,
    contentType: contentType,
    structuredData: true,
  });

  // Only process PDF files in the correct path
  if (!contentType || contentType !== "application/pdf") {
    logger.info("File is not a PDF, skipping", {filePath});
    return null;
  }

  if (!filePath.includes("user_uploads/") ||
      !filePath.includes("/uploaded_docs/")) {
    logger.info("File is not in the expected upload path, skipping",
        {filePath});
    return null;
  }

  try {
    // Parse the file path to extract userId and fileName
    const pathParts = filePath.split("/");
    if (pathParts.length < 4) {
      logger.error("Invalid file path structure", {filePath});
      return null;
    }

    const userId = pathParts[1];
    const fileName = pathParts[pathParts.length - 1];

    logger.info("Processing PDF for user", {
      userId: userId,
      fileName: fileName,
      structuredData: true,
    });

    // Download the file from Storage (default bucket)
    const bucket = getStorage().bucket();
    const file = bucket.file(filePath);
    const storageFileName = filePath.split('/').pop();

    logger.info("Downloading PDF file...");
    const [fileBuffer] = await file.download();

    logger.info("Extracting text from PDF...", {
      bufferSize: fileBuffer.length,
      structuredData: true,
    });

    // Extract text from PDF using pdf-parse
    const pdfData = await pdfParse(fileBuffer);
    const extractedText = pdfData.text;

    logger.info("Successfully extracted text from PDF", {
      textLength: extractedText.length,
      pageCount: pdfData.numpages,
      structuredData: true,
    });

    // Find the corresponding Firestore document
    const db = getFirestore();
    const uploadedFilesRef = db.collection("artifacts");
    const snapshot = await uploadedFilesRef.get();

    let documentUpdated = false;

    // Look through all app collections for the matching file
    for (const appDoc of snapshot.docs) {
      const appId = appDoc.id;
      const userFilesRef = db.collection(
          `artifacts/${appId}/users/${userId}/uploaded_files`);
      const userFilesSnapshot = await userFilesRef.get();

      for (const fileDoc of userFilesSnapshot.docs) {
        const fileData = fileDoc.data();

        // Match by storageFileName (best), or fallback to downloadURL
        if (
          fileData.storageFileName === storageFileName ||
          (fileData.downloadURL && fileData.downloadURL.includes(storageFileName))
        ) {
          logger.info("Found matching Firestore document", {
            appId: appId,
            userId: userId,
            docId: fileDoc.id,
            structuredData: true,
          });

          // Update the document with extracted text
          await fileDoc.ref.update({
            extractedContent: extractedText,
            contentExtracted: true,
            lastProcessed: new Date(),
            textExtractionDate: new Date(),
            pageCount: pdfData.numpages,
          });

          documentUpdated = true;
          logger.info("Successfully updated Firestore document");
          break;
        }
      }

      if (documentUpdated) break;
    }

    if (!documentUpdated) {
      logger.warn("Could not find matching Firestore document for file", {
        fileName: fileName,
        userId: userId,
        structuredData: true,
      });
    }

    return null;
  } catch (error) {
    logger.error("Error processing PDF file", {
      filePath: filePath,
      error: error.message,
      stack: error.stack,
      structuredData: true,
    });

    // Try to update the Firestore document with error status
    try {
      const pathParts = filePath.split("/");
      const userIdFromPath = pathParts[1];
      const fileNameFromPath = pathParts[pathParts.length - 1];

      const db = getFirestore();
      const uploadedFilesRef = db.collection("artifacts");
      const snapshot = await uploadedFilesRef.get();

      for (const appDoc of snapshot.docs) {
        const appId = appDoc.id;
        const userFilesRef = db.collection(
            `artifacts/${appId}/users/${userIdFromPath}/uploaded_files`);
        const userFilesSnapshot = await userFilesRef.get();

        for (const fileDoc of userFilesSnapshot.docs) {
          const fileData = fileDoc.data();

          if (fileData.fileName === fileNameFromPath) {
            await fileDoc.ref.update({
              contentExtracted: false,
              extractionError: error.message,
              lastProcessed: new Date(),
            });
            break;
          }
        }
      }
    } catch (updateError) {
      logger.error("Failed to update document with error status", {
        error: updateError.message,
        structuredData: true,
      });
    }

    throw error;
  }
});

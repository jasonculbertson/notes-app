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
 * Handles PDF files uploaded to artifacts/{appId}/users/{userId}/files/
 * Extracts text from PDFs and saves it back to Firestore
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

  // Only process PDF files
  if (!contentType || contentType !== "application/pdf") {
    logger.info("File is not a PDF, skipping", {filePath});
    return null;
  }

  // Check if file is in the correct path
  const hasArtifacts = filePath.includes("artifacts/");
  const hasUsers = filePath.includes("/users/");
  const hasFiles = filePath.includes("/files/");
  if (!hasArtifacts || !hasUsers || !hasFiles) {
    logger.info("File is not in the expected upload path, skipping",
        {filePath});
    return null;
  }

  try {
    // Parse the file path: artifacts/{appId}/users/{userId}/files/{file}
    const pathParts = filePath.split("/");
    if (pathParts.length < 5) {
      logger.error("Invalid file path structure", {filePath});
      return null;
    }

    const appId = pathParts[1];
    const userId = pathParts[3];
    const fullFileName = pathParts[pathParts.length - 1];

    // Extract original filename (remove timestamp prefix)
    const originalFileName = fullFileName.includes("_") ?
      fullFileName.substring(fullFileName.indexOf("_") + 1) : fullFileName;

    logger.info("Processing PDF for user", {
      appId: appId,
      userId: userId,
      fullFileName: fullFileName,
      originalFileName: originalFileName,
      structuredData: true,
    });

    // Download the file from Storage
    const bucket = getStorage().bucket();
    const file = bucket.file(filePath);

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
    const collectionPath = `artifacts/${appId}/users/${userId}/uploaded_files`;
    const userFilesRef = db.collection(collectionPath);
    const userFilesSnapshot = await userFilesRef.get();

    let documentUpdated = false;

    for (const fileDoc of userFilesSnapshot.docs) {
      const fileData = fileDoc.data();

      // Match by fileName or downloadURL containing the file
      const matchesFileName = fileData.fileName === originalFileName;
      const matchesUrl = fileData.downloadURL &&
        fileData.downloadURL.includes(fullFileName);

      if (matchesFileName || matchesUrl) {
        logger.info("Found matching Firestore document", {
          appId: appId,
          userId: userId,
          docId: fileDoc.id,
          fileName: fileData.fileName,
          structuredData: true,
        });

        // Update the document with extracted text
        await fileDoc.ref.update({
          extractedContent: extractedText,
          contentExtracted: true,
          lastProcessed: new Date(),
          textExtractionDate: new Date(),
          pageCount: pdfData.numpages,
          processingStatus: "completed",
        });

        documentUpdated = true;
        logger.info("Successfully updated Firestore document");
        break;
      }
    }

    if (!documentUpdated) {
      logger.warn("Could not find matching Firestore document for file", {
        originalFileName: originalFileName,
        fullFileName: fullFileName,
        userId: userId,
        appId: appId,
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
      const appId = pathParts[1];
      const userId = pathParts[3];
      const fullFileName = pathParts[pathParts.length - 1];
      const originalFileName = fullFileName.includes("_") ?
        fullFileName.substring(fullFileName.indexOf("_") + 1) : fullFileName;

      const db = getFirestore();
      const collectionPath =
        `artifacts/${appId}/users/${userId}/uploaded_files`;
      const userFilesRef = db.collection(collectionPath);
      const userFilesSnapshot = await userFilesRef.get();

      for (const fileDoc of userFilesSnapshot.docs) {
        const fileData = fileDoc.data();

        if (fileData.fileName === originalFileName) {
          await fileDoc.ref.update({
            contentExtracted: false,
            extractionError: error.message,
            lastProcessed: new Date(),
            processingStatus: "failed",
          });
          logger.info("Updated document with error status");
          break;
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

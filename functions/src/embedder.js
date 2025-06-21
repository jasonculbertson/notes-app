// functions/src/embedder.js
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const {GoogleGenerativeAI} = require("@google/generative-ai");
const {createClient} = require("@supabase/supabase-js");

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Helper function to get Supabase client
 * @return {object} Supabase client instance
 */
function getSupabaseClient() {
  const supabaseUrl = functions.config().supabase.url;
  const supabaseKey = functions.config().supabase.key;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Generates embeddings for a note when it's created or updated
 */
exports.onNoteWriteGenerateEmbedding = onDocumentWritten(
    "artifacts/{appId}/users/{userId}/notes/{noteId}",
    async (event) => {
      const {appId, userId, noteId} = event.params;
      const {data} = event;

      try {
      // Get the note data
        const noteData = data.after?.data();
        if (
          !noteData ||
        !noteData.content ||
        noteData.embeddingStatus === "processing"
        ) {
          console.log("Note has no content or already processing");
          return;
        }

        // Check if content has changed (avoid re-processing)
        const previousData = data.before?.data();
        if (
          previousData &&
        previousData.content === noteData.content &&
        previousData.embeddingStatus === "completed"
        ) {
          console.log("Note content unchanged, skipping");
          return;
        }

        // Mark as processing
        await event.data.after.ref.update({
          embeddingStatus: "processing",
          embeddingError: null,
        });

        // Generate embedding using Gemini
        const model = genAI.getGenerativeModel({
          model: "text-embedding-004",
        });

        const embeddingResult = await model.embedContent(noteData.content);
        const embedding = embeddingResult.embedding.values;

        // Store in Supabase
        const supabase = getSupabaseClient();
        const {error: supabaseError} = await supabase
            .from("document_embeddings")
            .upsert({
              document_id: `${appId}_${userId}_${noteId}`,
              user_id: userId,
              app_id: appId,
              document_type: "note",
              content: noteData.content,
              title: noteData.title || "Untitled Note",
              embedding: embedding,
              metadata: {
                note_id: noteId,
                created_at: noteData.createdAt,
                updated_at: noteData.updatedAt,
              },
            });

        if (supabaseError) {
          throw new Error(`Supabase error: ${supabaseError.message}`);
        }

        // Mark as completed
        await event.data.after.ref.update({
          embeddingStatus: "completed",
          embeddingLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Generated embedding for note ${noteId}`);
      } catch (error) {
        console.error(
            `Error generating embedding for note ${noteId}:`,
            error,
        );

        // Mark as failed
        await event.data.after.ref.update({
          embeddingStatus: "failed",
          embeddingError: error.message,
          embeddingLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }).catch((updateError) => {
          console.error("Failed to update error status:", updateError);
        });
      }
    },
);

/**
 * Generates embeddings for a PDF file when its extracted text is saved
 */
exports.onFileWriteGenerateEmbedding = onDocumentWritten(
    "artifacts/{appId}/users/{userId}/files/{fileId}",
    async (event) => {
      const {appId, userId, fileId} = event.params;
      const {data} = event;

      try {
      // Get the file data
        const fileData = data.after?.data();
        if (
          !fileData ||
        !fileData.extractedText ||
        fileData.embeddingStatus === "processing"
        ) {
          console.log("File has no extracted text or already processing");
          return;
        }

        // Check if extracted text has changed
        const previousData = data.before?.data();
        if (
          previousData &&
        previousData.extractedText === fileData.extractedText &&
        previousData.embeddingStatus === "completed"
        ) {
          console.log("File extracted text unchanged, skipping");
          return;
        }

        // Mark as processing
        await event.data.after.ref.update({
          embeddingStatus: "processing",
          embeddingError: null,
        });

        // Generate embedding using Gemini
        const model = genAI.getGenerativeModel({
          model: "text-embedding-004",
        });

        const embeddingResult = await model
            .embedContent(fileData.extractedText);
        const embedding = embeddingResult.embedding.values;

        // Store in Supabase
        const supabase = getSupabaseClient();
        const {error: supabaseError} = await supabase
            .from("document_embeddings")
            .upsert({
              document_id: `${appId}_${userId}_${fileId}`,
              user_id: userId,
              app_id: appId,
              document_type: "file",
              content: fileData.extractedText,
              title: fileData.name || "Untitled File",
              embedding: embedding,
              metadata: {
                file_id: fileId,
                file_name: fileData.name,
                file_type: fileData.type,
                file_size: fileData.size,
                uploaded_at: fileData.uploadedAt,
                extracted_at: fileData.extractedAt,
              },
            });

        if (supabaseError) {
          throw new Error(`Supabase error: ${supabaseError.message}`);
        }

        // Mark as completed
        await event.data.after.ref.update({
          embeddingStatus: "completed",
          embeddingLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Generated embedding for file ${fileId}`);
      } catch (error) {
        console.error(
            `Error generating embedding for file ${fileId}:`,
            error,
        );

        // Mark as failed
        await event.data.after.ref.update({
          embeddingStatus: "failed",
          embeddingError: error.message,
          embeddingLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }).catch((updateError) => {
          console.error("Failed to update error status:", updateError);
        });
      }
    },
);

// functions/src/thoughtWeaver.js
const {onRequest} = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const {convert} = require("html-to-text");

const {GoogleGenerativeAI} = require("@google/generative-ai");
const {createClient} = require("@supabase/supabase-js");

// Initialize clients
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

// Rate limiting
const lastCallTimes = new Map();

/**
 * Converts HTML to plain text for better LLM processing
 * @param {string} htmlString HTML content
 * @return {string} Plain text content
 */
function convertHtmlToPlainText(htmlString) {
  if (!htmlString) return "";
  return convert(htmlString, {
    wordwrap: 80,
    selectors: [
      {selector: "a", options: {ignoreHref: true}},
      {selector: "img", format: "skip"},
      {selector: "pre", format: "literal"},
    ],
  });
}

/**
 * Rate limiting function
 * @param {string} userId User ID for rate limiting
 * @param {number} minIntervalMs Minimum interval between calls
 * @return {boolean} Whether the call is allowed
 */
function isRateLimited(userId, minIntervalMs = 60000) {
  const now = Date.now();
  const lastCall = lastCallTimes.get(userId);
  if (lastCall && now - lastCall < minIntervalMs) {
    return true;
  }
  lastCallTimes.set(userId, now);
  return false;
}

/**
 * Finds connections and generates insights for notes
 */
exports.findConnectionsAndGenerateInsights = onRequest(
    {cors: true, maxInstances: 3},
    async (req, res) => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({error: "Method not allowed"});
        }

        const {userId, appId, content, title} = req.body;
        if (!userId || !appId || !content) {
          return res.status(400).json({
            error: "Missing required fields: userId, appId, content",
          });
        }

        // Rate limiting (60 seconds between requests per user)
        if (isRateLimited(userId)) {
          return res.status(429).json({
            error: "Too many requests. Please wait before trying again.",
          });
        }

        // Generate embedding for current content
        const model = genAI.getGenerativeModel({
          model: "text-embedding-004",
        });
        const plainTextContent = convertHtmlToPlainText(content);
        const embeddingResult = await model.embedContent(plainTextContent);
        const queryEmbedding = embeddingResult.embedding.values;

        // Find similar documents in Supabase
        const supabase = getSupabaseClient();
        const {data: similarDocs, error: searchError} = await supabase
            .rpc("match_documents", {
              query_embedding: queryEmbedding,
              match_threshold: 0.8,
              match_count: 5,
              user_id_filter: userId,
            });

        if (searchError) {
          console.error("Supabase search error:", searchError);
          return res.status(500).json({
            error: "Failed to search for similar documents",
          });
        }

        // Return early if no similar documents found
        if (!similarDocs || similarDocs.length === 0) {
          return res.json({
            connections: [],
            insights: "No related documents found to generate insights from.",
          });
        }

        // Generate insights using Gemini
        const chatModel = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: {
            temperature: 0.3,
            topK: 32,
            topP: 0.8,
            maxOutputTokens: 800,
          },
        });

        // Prepare context for LLM
        const contextDocuments = similarDocs.map((doc, index) => ({
          title: doc.title,
          content: doc.content.substring(0, 500),
          similarity: doc.similarity,
        }));

        const prompt = `You are an intelligent writing assistant that helps 
identify connections and generate insights.

Current document:
Title: ${title || "Untitled"}
Content: ${plainTextContent.substring(0, 1000)}

Related documents found:
${contextDocuments
      .map(
          (doc) =>
            `- "${doc.title}" (similarity: ${doc.similarity.toFixed(2)})
${doc.content.substring(0, 200)}...`,
      )
      .join("\n")}

Please provide:
1. Key themes and connections between the current document and related ones
2. Insights or patterns you notice across these documents
3. Questions or ideas that emerge from these connections

Keep your response concise and actionable. Focus on meaningful connections 
rather than surface-level similarities.`;

        const result = await chatModel.generateContent(prompt);
        const generatedInsights = result.response.text();

        // Return results
        res.json({
          connections: similarDocs.map((doc) => ({
            title: doc.title,
            similarity: doc.similarity,
            documentType: doc.document_type,
            preview: doc.content.substring(0, 200),
          })),
          insights: generatedInsights,
          metadata: {
            queryProcessedAt: new Date().toISOString(),
            documentsAnalyzed: similarDocs.length,
          },
        });
      } catch (error) {
        console.error("Error in findConnectionsAndGenerateInsights:", error);
        res.status(500).json({
          error: "Internal server error",
          details: error.message,
        });
      }
    },
);

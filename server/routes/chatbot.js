const express = require("express");
const router = express.Router();
require("dotenv").config();

// Use dynamic import for node-fetch
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

router.post("/chat", async (req, res) => {
  const { message } = req.body;

  console.log("Received chatbot message:", message);

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid message input" });
  }

  try {
    // Check if API key exists
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not found in environment variables");
      return res.status(500).json({ error: "API key not configured" });
    }

    console.log("Making request to Gemini API...");
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a helpful educational assistant for a learning platform. Answer the following question in a friendly and informative way: ${message}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        }),
      }
    );

    console.log("Gemini API Response Status:", response.status);
    
    const data = await response.json();
    console.log("Gemini API Response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(500).json({ 
        error: "Gemini API Error", 
        detail: data,
        status: response.status
      });
    }

    // More robust response parsing
    let botReply = "Sorry, I couldn't generate a response.";
    
    if (data && data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        botReply = candidate.content.parts[0].text || botReply;
      }
    }

    console.log("Bot reply:", botReply);
    res.json({ reply: botReply });

  } catch (error) {
    console.error("Server Error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message 
    });
  }
});

module.exports = router;
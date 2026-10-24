import { useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import { apiConnector } from "../../services/apiConnector";
import { chatbotEndpoints } from "../../services/apis";

const { CHATBOT_API } = chatbotEndpoints;

export default function ChatBot() {
  const location = useLocation();
  const { token } = useSelector((state) => state.auth);
  // ChatBot is mounted outside of any <Route>, so useParams() won't see the
  // matched course — pull it straight out of the URL instead when the
  // student is on a course-viewing page, so the assistant can ground its
  // answers in that course's content.
  const courseMatch = location.pathname.match(/^\/view-course\/([^/]+)/);
  const courseId = courseMatch?.[1];

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "bot", text: "Hi! I'm here to help you with your learning journey. Ask me anything!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const response = await apiConnector(
        "POST",
        CHATBOT_API,
        { message: userMsg, courseId },
        { Authorization: `Bearer ${token}` }
      );

      const data = response.data;

      if (data && data.reply) {
        setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "bot", text: "Sorry, something went wrong." },
        ]);
      }
    } catch (err) {
      console.error("Chatbot request failed:", err);
      const data = err?.response?.data;
      let errorMsg =
        "I'm having connection issues. Please check your internet connection and try again.";

      if (err?.response?.status === 429) {
        errorMsg = "You're sending messages too quickly. Please wait a moment and try again.";
      } else if (data?.error === "API key not configured") {
        errorMsg = "Chatbot service is currently unavailable. Please try again later.";
      } else if (data?.error === "Gemini API Error") {
        errorMsg = "I'm having trouble connecting to my knowledge base. Please try again.";
      }

      setMessages((prev) => [...prev, { role: "bot", text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="w-[min(20rem,calc(100vw-2rem))] h-96 rounded-2xl bg-richblack-800 shadow-card border border-richblack-700 flex flex-col overflow-hidden">
          <div className="bg-yellow-50 text-richblack-900 px-4 py-3 flex justify-between items-center font-semibold">
            <div className="flex flex-col">
              <span>🤖 Learning Assistant</span>
              {courseId && <span className="text-xs font-normal opacity-80">Aware of this course</span>}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="hover:bg-yellow-100 rounded px-2 py-1 transition-colors"
            >
              ×
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-richblack-900">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                    msg.role === "user"
                      ? "bg-yellow-50 text-richblack-900 rounded-br-none"
                      : "bg-richblack-800 text-richblack-5 rounded-bl-none shadow-sm border border-richblack-700"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-richblack-800 text-richblack-300 px-3 py-2 rounded-lg text-sm shadow-sm border border-richblack-700">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-richblack-300 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-richblack-300 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-richblack-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex border-t border-richblack-700 bg-richblack-800 p-3">
            <input
              className="flex-1 border border-richblack-600 bg-richblack-900 text-richblack-5 placeholder:text-richblack-400 rounded-l-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-50/40"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about learning..."
              disabled={loading}
            />
            <button
              className={`px-4 rounded-r-lg text-richblack-900 font-medium transition-colors ${
                loading || !input.trim()
                  ? "bg-richblack-600 cursor-not-allowed"
                  : "bg-yellow-50 hover:bg-yellow-100"
              }`}
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-yellow-50 text-richblack-900 p-4 rounded-full shadow-card hover:scale-105 transition-all duration-200"
          title="Open Learning Assistant"
        >
          <span className="text-xl">🤖</span>
        </button>
      )}
    </div>
  );
}
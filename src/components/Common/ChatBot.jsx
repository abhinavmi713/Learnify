import { useState } from "react";

export default function ChatBot() {
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
      console.log("Sending message to backend:", userMsg);
      
      const res = await fetch("http://localhost:4000/chatbot/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ message: userMsg }),
      });

      console.log("Response status:", res.status);
      
      const data = await res.json();
      console.log("Response data:", data);

      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
      } else {
        // Handle specific error cases
        let errorMsg = "Sorry, something went wrong.";
        
        if (data.error === "API key not configured") {
          errorMsg = "Chatbot service is currently unavailable. Please try again later.";
        } else if (data.error === "Gemini API Error") {
          errorMsg = "I'm having trouble connecting to my knowledge base. Please try again.";
        } else if (data.details) {
          console.error("Backend error details:", data.details);
        }
        
        setMessages((prev) => [...prev, { role: "bot", text: errorMsg }]);
      }
    } catch (err) {
      console.error("Network or fetch error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "I'm having connection issues. Please check your internet connection and try again." },
      ]);
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
        <div className="w-80 h-96 bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black px-4 py-3 flex justify-between items-center font-semibold">
            <span>🤖 Learning Assistant</span>
            <button 
              onClick={() => setOpen(false)}
              className="hover:bg-yellow-600 rounded px-2 py-1 transition-colors"
            >
              ×
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white rounded-br-none"
                      : "bg-white text-gray-800 rounded-bl-none shadow-sm border"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-500 px-3 py-2 rounded-lg text-sm shadow-sm border">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex border-t bg-white p-3">
            <input
              className="flex-1 border border-gray-300 rounded-l-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about learning..."
              disabled={loading}
            />
            <button
              className={`px-4 rounded-r-lg text-black font-medium transition-colors ${
                loading || !input.trim()
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-yellow-400 hover:bg-yellow-500"
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
          className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black p-4 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 border-2 border-white"
          title="Open Learning Assistant"
        >
          <span className="text-xl">🤖</span>
        </button>
      )}
    </div>
  );
}
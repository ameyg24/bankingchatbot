import { useState, useRef, useEffect } from "react";
import "./App.css";
import {
  GoogleOAuthProvider,
  GoogleLogin,
  googleLogout,
} from "@react-oauth/google";
import { saveToStorage, loadFromStorage, getEnv } from "./persist";

interface Message {
  sender: "user" | "bot";
  text: string;
}

interface UserInfo {
  name: string;
  email: string;
  picture: string;
  token: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(() =>
    loadFromStorage("user", null)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    saveToStorage("messages", messages);
  }, [messages]);

  useEffect(() => {
    const saved = loadFromStorage<Message[]>("messages", []);
    if (saved.length > 0) setMessages(saved);
  }, []);

  // Fetch chat history from backend after login
  useEffect(() => {
    if (user) {
      fetch("http://localhost:8000/persist/chat", {
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setMessages(data);
        });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      // Persist chat history to backend
      fetch("http://localhost:8000/persist/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(messages),
      });
    }
  }, [messages, user]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { sender: "user", text: input };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput("");
    setLoading(true);
    const formData = new FormData();
    formData.append("message", userMsg.text);
    try {
      const res = await fetch("http://localhost:8000/chat/", {
        method: "POST",
        body: formData,
        headers: user ? { Authorization: `Bearer ${user.token}` } : {},
      });
      const data = await res.json();
      setMessages((msgs) => [...msgs, { sender: "bot", text: data.answer }]);
    } catch (e) {
      setMessages((msgs) => [
        ...msgs,
        { sender: "bot", text: "Error: Could not connect to backend." },
      ]);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(false);
    if (!e.target.files?.length) return;
    setUploading(true);
    const file = e.target.files[0];
    setUploadedFile(file);
    setPdfUrl(URL.createObjectURL(file));
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("http://localhost:8000/upload_pdf/", {
        method: "POST",
        body: formData,
        headers: user ? { Authorization: `Bearer ${user.token}` } : {},
      });
      if (!res.ok) throw new Error("Upload failed");
      setUploadSuccess(true);
    } catch (e) {
      setUploadError("Error uploading PDF. Please try again.");
      setUploadedFile(null);
      setPdfUrl(null);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearChat = () => setMessages([]);

  const handleLoginSuccess = async (credentialResponse: any) => {
    // Decode JWT to get user info
    const token = credentialResponse.credential;
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    const userInfo: UserInfo = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      token,
    };
    setUser(userInfo);
    saveToStorage("user", userInfo);
  };

  const handleLogout = () => {
    setUser(null);
    saveToStorage("user", null);
    googleLogout();
  };

  return (
    <GoogleOAuthProvider clientId={getEnv("VITE_GOOGLE_CLIENT_ID") || ""}>
      <div className="banking-bg split-layout">
        {/* Login Bar - always top right */}
        <div className="login-bar-fixed">
          {user ? (
            <div className="login-user">
              <img src={user.picture} alt="avatar" className="login-avatar" />
              <span>{user.name}</span>
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={() => alert("Login Failed")}
            />
          )}
        </div>
        {/* Main content split: PDF left, Chat right */}
        <div className="main-content">
          {/* PDF Section */}
          <section className="pdf-section">
            <div className="upload-row-top">
              <label className="upload-label" htmlFor="pdf-upload">
                Upload PDF Statement:
              </label>
              <div className="file-upload-group">
                <input
                  id="pdf-upload"
                  className="upload-input"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  disabled={uploading}
                />
                {uploadedFile && (
                  <span className="file-name-display">{uploadedFile.name}</span>
                )}
                {uploading && (
                  <span className="file-status uploading">Uploading...</span>
                )}
                {uploadSuccess && (
                  <span className="file-status success">Uploaded</span>
                )}
                {uploadError && (
                  <span className="file-status error">{uploadError}</span>
                )}
              </div>
            </div>
            <div className="pdf-viewer">
              {pdfUrl ? (
                <iframe
                  className="pdf-iframe"
                  src={pdfUrl}
                  title="PDF Preview"
                />
              ) : (
                <div className="pdf-placeholder">No PDF uploaded</div>
              )}
            </div>
          </section>
          {/* Chat Section */}
          <section className="chat-section">
            <div className="chatbot-header">
              <div className="bank-logo">🏦</div>
              <div className="chatbot-title">BankBot</div>
              <div className="subtitle">Your AI Banking Assistant</div>
            </div>
            <div className="chatbot-main">
              <div className="chat-history-bar">
                <span>Conversation</span>
                <button className="clear-btn" onClick={clearChat}>
                  Clear
                </button>
              </div>
              <div className="chat-window" ref={chatWindowRef}>
                {messages.length === 0 && (
                  <div className="empty-chat">
                    Start a conversation with BankBot!
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={msg.sender === "user" ? "user-msg" : "bot-msg"}
                  >
                    <div className="msg-bubble">{msg.text}</div>
                  </div>
                ))}
                {loading && (
                  <div className="bot-msg">
                    <div className="msg-bubble loading-ellipsis">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </div>
                  </div>
                )}
              </div>
              <form
                className="input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!loading) sendMessage();
                }}
                autoComplete="off"
              >
                <input
                  className="chat-input"
                  type="text"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
                <button
                  className="send-btn"
                  type="submit"
                  disabled={loading || !input.trim()}
                >
                  Send
                </button>
              </form>
            </div>
            <div className="chatbot-footer">
              Banking Chatbot &copy; {new Date().getFullYear()}
            </div>
          </section>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}

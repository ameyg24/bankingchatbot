import { useState, useRef, useEffect } from "react";
import "./App.css";
import { GoogleLogin, googleLogout } from "@react-oauth/google";
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

interface DocumentEntry {
  id: string;
  filename: string;
  summary: string;
  blobUrl?: string;
  status?: "ok" | "error";
  errorMsg?: string;
}

export default function App() {
  console.log("Google Client ID:", getEnv("VITE_GOOGLE_CLIENT_ID"));

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(() =>
    loadFromStorage("user", null)
  );
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<"summary" | "preview">(
    "summary"
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

  useEffect(() => {
    if (user) {
      fetch("http://localhost:8000/documents", {
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then((r) => r.json())
        .then((docs: DocumentEntry[]) => setDocuments(docs));
    }
  }, [user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(false);
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    if (!user) {
      setUploadError("Please sign in first.");
      return;
    }
    setUploading(true);
    const uploads: Promise<DocumentEntry>[] = Array.from(fileList).map(
      async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch("http://localhost:8000/upload_pdf/", {
            method: "POST",
            body: formData,
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (!res.ok) {
            let detail = "Upload failed";
            try {
              const err = await res.json();
              detail = err.detail || detail;
            } catch {}
            return {
              id: crypto.randomUUID(),
              filename: file.name,
              summary: detail,
              blobUrl: undefined,
              status: "error",
              errorMsg: detail,
            };
          }
          const data = await res.json();
          return {
            ...data.document,
            blobUrl: URL.createObjectURL(file),
            status: "ok",
          };
        } catch (err: any) {
          return {
            id: crypto.randomUUID(),
            filename: file.name,
            summary: "Network error",
            status: "error",
            errorMsg: err?.message,
          };
        }
      }
    );
    const results = await Promise.all(uploads);
    setDocuments((prev) => {
      let mutated = [...prev];
      for (const r of results) {
        if (r.status === "ok") {
          const idx = mutated.findIndex((d) => d.filename === r.filename);
          if (idx >= 0) {
            mutated[idx] = { ...mutated[idx], ...r }; // overwrite existing
          } else {
            mutated.push(r);
          }
        } else {
          mutated.push(r);
        }
      }
      return mutated;
    });
    const okDocs = results.filter((r) => r.status === "ok");
    if (okDocs.length) {
      const last = okDocs[okDocs.length - 1];
      setActiveDocId(last.id);
      setPdfUrl(last.blobUrl || null);
      setActiveDocTab("preview");
      setUploadSuccess(true);
    }
    const errorDocs = results.filter((r) => r.status === "error");
    if (errorDocs.length) setUploadError(`${errorDocs.length} file(s) failed.`);
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

  const activeDoc = documents.find((d) => d.id === activeDocId);

  useEffect(() => {
    document.title = "Banking Chatbot"; // Set page title
  }, []);

  return (
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
            <div className="upload-row-top doc-upload-bar">
              <label className="upload-label" htmlFor="pdf-upload">
                Upload PDF Document(s):
              </label>
              <div className="file-upload-group">
                <input
                  id="pdf-upload"
                  className="upload-input"
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  disabled={uploading}
                />
                {uploading && <span className="file-status uploading">Uploading...</span>}
                {uploadSuccess && <span className="file-status success">Uploaded</span>}
                {uploadError && <span className="file-status error">{uploadError}</span>}
                {documents.length > 0 && user && (
                  <button
                    type="button"
                    style={{ marginLeft: '1rem' }}
                    className="clear-docs-btn"
                    onClick={async () => {
                      try {
                        const res = await fetch('http://localhost:8000/documents', { method: 'DELETE', headers: { Authorization: `Bearer ${user.token}` } });
                        if (res.ok) {
                          setDocuments([]);
                          setActiveDocId(null);
                          setPdfUrl(null);
                        }
                      } catch {}
                    }}
                  >
                    Clear Documents
                  </button>
                )}
              </div>
            </div>
            <div className="doc-split">
              <div className="docs-panel">
                <div className="docs-panel-header">Documents</div>
                {documents.length === 0 && <div className="docs-empty">No documents uploaded</div>}
                <div className="docs-scroll">
                  {documents.map(d => (
                    <div
                      key={d.id}
                      className={"doc-item" + (activeDocId === d.id ? " active" : "") + (d.status === 'error' ? " error" : "")}
                      onClick={() => {
                        setActiveDocId(d.id);
                        setActiveDocTab('summary');
                        if (!d.blobUrl && user && d.status !== 'error') {
                          fetch(`http://localhost:8000/documents/${d.id}/file`, { headers: { Authorization: `Bearer ${user.token}` } })
                            .then(r => r.blob())
                            .then(b => {
                              const url = URL.createObjectURL(b);
                              setDocuments(prev => prev.map(p => p.id === d.id ? { ...p, blobUrl: url } : p));
                              setPdfUrl(url);
                            })
                            .catch(() => {});
                        } else {
                          setPdfUrl(d.blobUrl || null);
                        }
                      }}
                    >
                      <div className="doc-filename" title={d.filename}>{d.filename}</div>
                      <div className="doc-summary-line" title={d.summary}>{d.summary}</div>
                      {d.status === 'error' && <div className="doc-error-msg">{d.errorMsg}</div>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="doc-viewer-wrapper">
                {activeDoc ? (
                  <>
                    <div className="doc-tabs">
                      <button type="button" className={"doc-tab" + (activeDocTab === 'summary' ? ' active' : '')} onClick={() => setActiveDocTab('summary')}>Summary</button>
                      <button type="button" className={"doc-tab" + (activeDocTab === 'preview' ? ' active' : '')} onClick={() => setActiveDocTab('preview')}>Preview</button>
                    </div>
                    {activeDocTab === 'summary' && (
                      <div className="doc-summary-card">
                        <h4>{activeDoc.filename}</h4>
                        <p>{activeDoc.summary}</p>
                        {activeDoc.status === 'error' && <p className="doc-summary-error">This file failed to process.</p>}
                      </div>
                    )}
                    {activeDocTab === 'preview' && (
                      pdfUrl ? <iframe className="pdf-iframe" src={pdfUrl} title="PDF Preview" /> : <div className="pdf-placeholder">No preview available</div>
                    )}
                  </>
                ) : (
                  <div className="pdf-placeholder">No PDF selected</div>
                )}
              </div>
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
            {/* Remove footer copyright (moved to page title) */}
            {/* <div className="chatbot-footer">
              Banking Chatbot &copy; {new Date().getFullYear()}
            </div> */}
          </section>
        </div>
      </div>
  );
}

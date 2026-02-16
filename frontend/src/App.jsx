import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const room = "general";

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const connect = () => {
    if (!username.trim() || isConnected) return;
    setConnectionError("");

    const socket = new WebSocket("ws://localhost:8080");
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          username,
        })
      );
    };

    socket.onerror = () => {
      setConnectionError("Could not connect to the chat server.");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
      } catch (err) {
        console.error("Invalid message payload", err);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      socketRef.current = null;
    };
  };

  const leaveChat = () => {
    setConnectionError("");
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "message",
        room,
        username,
        message,
      })
    );

    setMessage("");
  };

  const canJoin = username.trim().length > 0 && !isConnected;
  const canSend = message.trim().length > 0 && isConnected;

  return (
    <div className="app-shell">
      <div className="chat-card">
        <header className="chat-header">
          <p className="chat-tag">Live room</p>
          <h1>WebSocket Chat</h1>
          <p className="chat-subtitle">
            Room: <strong>{room}</strong>
          </p>
        </header>

        <form
          className="join-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (isConnected) {
              leaveChat();
              return;
            }
            connect();
          }}
        >
          <input
            className="text-input"
            placeholder="Enter your name"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isConnected}
          />
          <button
            className={`primary-btn ${isConnected ? "danger-btn" : ""}`}
            type="submit"
            disabled={!isConnected && !canJoin}
          >
            {isConnected ? "Leave chat" : "Join chat"}
          </button>
        </form>

        {isConnected && (
          <div className="status-pill">
            Connected as <strong>{username}</strong>
          </div>
        )}

        {connectionError && <p className="error-text">{connectionError}</p>}

        <section className="messages-panel">
          {messages.length === 0 && (
            <p className="empty-state">Messages will appear here.</p>
          )}

          {messages.map((msg, idx) => {
            const isSelf = !msg.system && msg.username === username;

            return (
              <article
                className={`chat-message ${msg.system ? "system" : ""} ${isSelf ? "self" : ""}`}
                key={`${msg.timestamp ?? "no-ts"}-${idx}`}
              >
                {msg.system ? (
                  <p>{msg.message}</p>
                ) : (
                  <>
                    <p className="message-meta">
                      <strong>{msg.username}</strong>
                      <span>{formatTime(msg.timestamp)}</span>
                    </p>
                    <p>{msg.message}</p>
                  </>
                )}
              </article>
            );
          })}
          <div ref={messagesEndRef} />
        </section>

        <form
          className="message-form"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <input
            className="text-input"
            placeholder={isConnected ? "Type a message..." : "Join to send messages"}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!isConnected}
          />
          <button className="primary-btn" type="submit" disabled={!canSend}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;

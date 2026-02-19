import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthToken, getAuthToken, getAuthUser, setAuthToken } from "../lib/auth";

const FIXED_ROOMS = [
  { id: "room-1", label: "Room 1" },
  { id: "room-2", label: "Room 2" },
  { id: "room-3", label: "Room 3" },
];

function HomePage() {
  const navigate = useNavigate();
  const authUser = useMemo(() => getAuthUser(), []);
  const authToken = useMemo(() => getAuthToken(), []);
  const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8080";
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

  const [profile, setProfile] = useState({
    email: authUser?.email || "",
    username: authUser?.username || authUser?.name || "",
    role: authUser?.role || "influencer",
  });
  const [usernameInput, setUsernameInput] = useState(
    authUser?.username || authUser?.name || ""
  );
  const [roleInput, setRoleInput] = useState(authUser?.role || "influencer");
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [roomId, setRoomId] = useState("room-1");
  const [activeUsername, setActiveUsername] = useState(
    authUser?.username || authUser?.name || ""
  );
  const [participants, setParticipants] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const handleUnauthorized = useCallback(
    (text = "Session expired. Please sign in again.") => {
      clearAuthToken();
      navigate(`/login?error=${encodeURIComponent(text)}`, { replace: true });
    },
    [navigate]
  );

  useEffect(() => {
    if (!authUser || !authToken) {
      navigate("/login", { replace: true });
    }
  }, [authToken, authUser, navigate]);

  useEffect(() => {
    if (!authToken) return;

    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/users/me`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (res.status === 401) {
          handleUnauthorized();
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          setProfileError(data.error || "Failed to load profile.");
          return;
        }

        if (cancelled) return;

        const user = data.user || {};
        setProfile({
          email: user.email || "",
          username: user.username || "",
          role: user.role || "influencer",
        });
        setUsernameInput(user.username || "");
        setRoleInput(user.role || "influencer");
        setActiveUsername(user.username || "");
      } catch {
        if (!cancelled) {
          setProfileError("Unable to load profile.");
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, authToken, handleUnauthorized]);

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

  const selectedRoomLabel =
    FIXED_ROOMS.find((item) => item.id === roomId)?.label || roomId;

  const formatTime = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const leaveChat = () => {
    setConnectionError("");
    setTypingUsers([]);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setParticipants([]);
  };

  const logout = () => {
    leaveChat();
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  const updateProfile = async () => {
    const nextUsername = usernameInput.trim();
    if (!nextUsername) {
      setProfileError("Username is required.");
      setProfileNotice("");
      return;
    }

    const nextRole = roleInput;
    if (!["influencer", "brand"].includes(nextRole)) {
      setProfileError("Role must be influencer or brand.");
      setProfileNotice("");
      return;
    }

    setIsSavingProfile(true);
    setProfileError("");
    setProfileNotice("");

    const previousUsername = profile.username;
    const previousRole = profile.role;

    try {
      const res = await fetch(`${apiBaseUrl}/users/me/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ username: nextUsername, role: nextRole }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || "Failed to update profile.");
        return;
      }

      const updatedUser = data.user || {};
      const updatedUsername = updatedUser.username || nextUsername;
      const updatedRole = updatedUser.role || nextRole;
      if (data.token) {
        setAuthToken(data.token);
      }

      setProfile((prev) => ({
        ...prev,
        email: updatedUser.email || prev.email,
        username: updatedUsername,
        role: updatedRole,
      }));
      setUsernameInput(updatedUsername);
      setRoleInput(updatedRole);
      setActiveUsername(updatedUsername);
      setParticipants((prev) =>
        prev.map((entry) =>
          entry.username === previousUsername
            ? { ...entry, username: updatedUsername }
            : entry
        )
      );
      setProfileNotice("Profile updated.");

      if (isConnected && previousRole !== updatedRole) {
        leaveChat();
        setProfileNotice("Role updated. Rejoin a room with your new role.");
      } else if (
        isConnected &&
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.send(
          JSON.stringify({
            type: "sync_username",
            authToken,
          })
        );
      }
    } catch {
      setProfileError("Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const connect = () => {
    if (isConnected || isConnecting) return;
    if (!authToken) {
      setConnectionError("You must sign in first.");
      return;
    }

    setConnectionError("");
    setMessages([]);
    setIsConnecting(true);

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "join",
          room: roomId,
          authToken,
        })
      );
    };

    socket.onerror = () => {
      setConnectionError("Could not connect to the chat server.");
      setIsConnecting(false);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "error") {
          const text = data.message || "Unable to join this room.";
          setConnectionError(text);

          if (text.includes("Invalid or expired authentication token")) {
            handleUnauthorized();
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
          return;
        }

        if (data.type === "joined") {
          setIsConnected(true);
          setIsConnecting(false);
          setRoomId(data.room || roomId);
          setActiveUsername(data.user?.username || data.username || profile.username);
          if (data.user?.role) {
            setProfile((prev) => ({ ...prev, role: data.user.role }));
            setRoleInput(data.user.role);
          }
          return;
        }

        if (data.type === "history") {
          setMessages(Array.isArray(data.messages) ? data.messages : []);
          return;
        }

        if (data.type === "room_state") {
          setParticipants(Array.isArray(data.occupants) ? data.occupants : []);
          return;
        }

        if (data.type === "typing_state") {
          const incoming = Array.isArray(data.users) ? data.users : [];
          setTypingUsers(incoming);
          return;
        }

        setMessages((prev) => [...prev, data]);
      } catch (error) {
        console.error("Invalid message payload", error);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
      setParticipants([]);
      setTypingUsers([]);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      isTypingRef.current = false;
      socketRef.current = null;
    };
  };

  const updateTypingState = (nextIsTyping) => {
    if (!isConnected || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    if (isTypingRef.current === nextIsTyping) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "typing",
        isTyping: nextIsTyping,
      })
    );
    isTypingRef.current = nextIsTyping;
  };

  const handleMessageChange = (nextValue) => {
    setMessage(nextValue);

    if (!isConnected) return;

    const hasText = nextValue.trim().length > 0;
    if (!hasText) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      updateTypingState(false);
      return;
    }

    updateTypingState(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingState(false);
      typingTimeoutRef.current = null;
    }, 1200);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    updateTypingState(false);

    socketRef.current.send(
      JSON.stringify({
        type: "message",
        message,
      })
    );

    setMessage("");
  };

  const canSend = message.trim().length > 0 && isConnected;
  const visibleTypingUsers = typingUsers.filter(
    (entry) => entry.username !== activeUsername
  );
  const typingLabel =
    visibleTypingUsers.length === 1
      ? `${visibleTypingUsers[0].username} is typing`
      : visibleTypingUsers.length > 1
      ? `${visibleTypingUsers.map((entry) => entry.username).join(", ")} are typing`
      : "";
  const canUpdateProfile =
    usernameInput.trim().length > 0 &&
    (usernameInput.trim() !== profile.username || roleInput !== profile.role) &&
    !isSavingProfile;

  return (
    <div className="app-shell">
      <div className="chat-card">
        <header className="chat-header">
          <p className="chat-tag">Live room</p>
          <h1>WebSocket Chat</h1>
          <p className="chat-subtitle">
            3 fixed rooms. Each room allows 1 influencer + 1 brand.
          </p>
        </header>

        <section className="settings-topbar">
          <div className="topbar-meta">
            <p className="auth-label">Logged in email</p>
            <p className="auth-value">{profile.email || authUser?.email || "Unknown"}</p>
          </div>

          <div className="username-editor">
            <label className="auth-label" htmlFor="username-input">
              Username
            </label>
            <div className="username-row">
              <input
                id="username-input"
                className="text-input username-input"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="Set your username"
                maxLength={24}
                disabled={isSavingProfile}
              />
              <button
                className="secondary-btn"
                type="button"
                onClick={updateProfile}
                disabled={!canUpdateProfile}
              >
                {isSavingProfile ? "Saving..." : "Update"}
              </button>
            </div>
            <div className="role-row">
              <label className="auth-label" htmlFor="role-input">
                Role
              </label>
              <select
                id="role-input"
                className="text-input role-select"
                value={roleInput}
                onChange={(event) => setRoleInput(event.target.value)}
                disabled={isSavingProfile}
              >
                <option value="influencer">Influencer</option>
                <option value="brand">Brand</option>
              </select>
            </div>
          </div>

          <button className="secondary-btn logout-btn" type="button" onClick={logout}>
            Logout
          </button>
        </section>

        {profileError && <p className="error-text">{profileError}</p>}
        {profileNotice && <p className="success-text">{profileNotice}</p>}

        <section className="room-strip">
          {FIXED_ROOMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`room-chip ${roomId === item.id ? "active" : ""}`}
              onClick={() => {
                if (!isConnected && !isConnecting) {
                  setRoomId(item.id);
                }
              }}
              disabled={isConnected || isConnecting}
            >
              <span>{item.label}</span>
              <small>{item.id}</small>
            </button>
          ))}
        </section>

        <div className="join-actions">
          <button
            className={`primary-btn ${isConnected ? "danger-btn" : ""}`}
            type="button"
            onClick={() => {
              if (isConnected) {
                leaveChat();
                return;
              }
              connect();
            }}
          >
            {isConnected ? "Leave chat" : isConnecting ? "Joining..." : `Join ${selectedRoomLabel}`}
          </button>
        </div>

        {isConnected && (
          <div className="status-pill">
            Connected as <strong>{activeUsername}</strong> ({profile.role}) in{" "}
            <strong>{selectedRoomLabel}</strong>
          </div>
        )}

        <p className="participants-state">
          Participants:{" "}
          <strong>
            {participants.length > 0
              ? participants.map((entry) => `${entry.username} (${entry.role})`).join(", ")
              : "Waiting for someone to join"}
          </strong>
        </p>

        {connectionError && <p className="error-text">{connectionError}</p>}

        <section className="messages-panel">
          {messages.length === 0 && (
            <p className="empty-state">No messages yet. Chat history appears here.</p>
          )}

          {messages.map((msg, idx) => {
            const isSelf = !msg.system && msg.username === activeUsername;

            return (
              <article
                className={`chat-message ${msg.system ? "system" : ""} ${
                  isSelf ? "self" : ""
                }`}
                key={`${msg.timestamp ?? "no-ts"}-${idx}`}
              >
                {msg.system ? (
                  <p>{msg.message}</p>
                ) : (
                  <>
                    <p className="message-meta">
                      <strong>
                        {msg.username}
                        {msg.role ? ` (${msg.role})` : ""}
                      </strong>
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
          {typingLabel && (
            <p className="typing-indicator">
              {typingLabel}
              <span className="typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </p>
          )}
          <input
            className="text-input"
            placeholder={isConnected ? "Type a message..." : "Join a room to chat"}
            value={message}
            onChange={(event) => handleMessageChange(event.target.value)}
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

export default HomePage;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, GraduationCap, Hash, LogOut, MessageCircle, Moon, Send, Sun, Users, Wifi, WifiOff } from 'lucide-react';
import { socket, SERVER_URL } from './socket.js';

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function getInitials(name) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

function colorForName(name) {
  const colors = ['#0f8f83', '#4667c7', '#c2417c', '#c47f1f', '#6d5bd0', '#23845f', '#b94735', '#2f7ab8'];
  const value = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return colors[value % colors.length];
}

function getRoomIcon(roomId) {
  if (roomId === 'gaming') {
    return <Gamepad2 size={17} />;
  }

  if (roomId === 'study') {
    return <GraduationCap size={17} />;
  }

  return <Hash size={17} />;
}

export default function App() {
  const [auth, setAuth] = useState(() => ({
    token: localStorage.getItem('chat:token') || '',
    user: JSON.parse(localStorage.getItem('chat:user') || 'null')
  }));
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('chat:theme') === 'dark');
  const [draft, setDraft] = useState('');
  const [rooms, setRooms] = useState([]);
  const [activeChat, setActiveChat] = useState({ type: 'room', id: 'general', name: 'General' });
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socketId, setSocketId] = useState(socket.id);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const activeChatRef = useRef(activeChat);

  const trimmedDraft = draft.trim();
  const currentUser = auth.user;
  const activeRoom = rooms.find((room) => room.id === activeChat.id);
  const activeTitle = activeChat.type === 'direct' ? activeChat.name : activeRoom?.name || activeChat.name;
  const activeSubtitle =
    activeChat.type === 'direct'
      ? 'Private message'
      : `${onlineUsers.filter((user) => user.roomId === activeChat.id).length} in this room`;

  const status = useMemo(() => (connected ? 'Live' : 'Connecting'), [connected]);

  useEffect(() => {
    localStorage.setItem('chat:theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    async function loadSession() {
      if (!auth.token || auth.user) {
        return;
      }

      try {
        const response = await fetch(`${SERVER_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${auth.token}` }
        });

        if (!response.ok) {
          throw new Error('Session expired.');
        }

        const data = await response.json();
        setAuth({ token: auth.token, user: data.user });
        localStorage.setItem('chat:user', JSON.stringify(data.user));
      } catch (error) {
        localStorage.removeItem('chat:token');
        localStorage.removeItem('chat:user');
        setAuth({ token: '', user: null });
      }
    }

    loadSession();
  }, [auth.token, auth.user]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (!auth.token || !auth.user) {
      socket.disconnect();
      return undefined;
    }

    function handleConnect() {
      setConnected(true);
      setSocketId(socket.id);
      setError('');
      socket.emit('user:join');
      socket.emit('chat:joinRoom', { roomId: activeChatRef.current.type === 'room' ? activeChatRef.current.id : 'general' });
    }

    function handleDisconnect() {
      setConnected(false);
      setSocketId(undefined);
    }

    function handleHistory(history) {
      setMessages(history);
    }

    function handleMessage(message) {
      const currentChat = activeChatRef.current;
      const isActiveRoom = message.context === 'room' && currentChat.type === 'room' && message.roomId === currentChat.id;
      const isActiveDirect =
        message.context === 'direct' &&
        currentChat.type === 'direct' &&
        (message.userId === currentChat.id || message.recipientId === currentChat.id || message.userId === auth.user.id);

      if (isActiveRoom || isActiveDirect) {
        setMessages((current) => [...current, message]);
        return;
      }

      if (message.context === 'direct' && message.userId !== auth.user.id) {
        setMessages((current) => [
          ...current,
          {
            id: `notice-${message.id}`,
            type: 'system',
            text: `New private message from ${message.username}`,
            createdAt: message.createdAt
          }
        ]);
      }
    }

    function handleRooms(nextRooms) {
      setRooms(nextRooms);
    }

    function handleUsers(users) {
      setOnlineUsers(users);
    }

    function handlePresenceEvent(event) {
      if (activeChatRef.current.type === 'room') {
        setMessages((current) => [...current, { ...event, type: 'system' }]);
      }
    }

    function handleConnectError() {
      setError(`Cannot reach ${SERVER_URL}`);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('chat:history', handleHistory);
    socket.on('chat:message', handleMessage);
    socket.on('rooms:update', handleRooms);
    socket.on('users:update', handleUsers);
    socket.on('presence:event', handlePresenceEvent);
    socket.on('connect_error', handleConnectError);
    socket.auth = { token: auth.token };
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('chat:history', handleHistory);
      socket.off('chat:message', handleMessage);
      socket.off('rooms:update', handleRooms);
      socket.off('users:update', handleUsers);
      socket.off('presence:event', handlePresenceEvent);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
    };
  }, [auth.token, auth.user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const endpoint = authMode === 'signup' ? 'signup' : 'login';
      const payload =
        authMode === 'signup'
          ? authForm
          : {
              email: authForm.email,
              password: authForm.password
            };

      const response = await fetch(`${SERVER_URL}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      localStorage.setItem('chat:token', data.token);
      localStorage.setItem('chat:user', JSON.stringify(data.user));
      setAuth({ token: data.token, user: data.user });
      setAuthForm({ name: '', email: '', password: '' });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    socket.disconnect();
    localStorage.removeItem('chat:token');
    localStorage.removeItem('chat:user');
    setAuth({ token: '', user: null });
    setMessages([]);
    setOnlineUsers([]);
    setSocketId(undefined);
    setConnected(false);
  }

  function handleRoomSelect(room) {
    setActiveChat({ type: 'room', id: room.id, name: room.name });
    setMessages([]);
    socket.emit('chat:joinRoom', { roomId: room.id }, (response) => {
      if (!response?.ok) {
        setError(response?.error || 'Could not join room.');
      }
    });
  }

  function handleDirectSelect(user) {
    if (user.id === currentUser.id) {
      return;
    }

    setActiveChat({ type: 'direct', id: user.id, name: user.username });
    setMessages([]);
    socket.emit('chat:openDirect', { recipientId: user.id }, (response) => {
      if (!response?.ok) {
        setError(response?.error || 'Could not open private chat.');
      }
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!trimmedDraft || !currentUser) {
      return;
    }

    socket.emit(
      'chat:message',
      {
        text: trimmedDraft,
        context: activeChat.type,
        roomId: activeChat.type === 'room' ? activeChat.id : undefined,
        recipientId: activeChat.type === 'direct' ? activeChat.id : undefined
      },
      (response) => {
        if (!response?.ok) {
          setError(response?.error || 'Message could not be sent.');
        }
      }
    );

    setDraft('');
  }

  if (!currentUser) {
    return (
      <main className={darkMode ? 'app-shell dark' : 'app-shell'}>
        <section className="auth-panel" aria-label="Authentication">
          <div className="auth-brand">
            <span className="brand-icon" aria-hidden="true">
              <MessageCircle size={24} />
            </span>
            <div>
              <h1>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
              <p>Sign in to access rooms, online users, and private chats.</p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' ? (
              <label>
                <span>Name</span>
                <input
                  value={authForm.name}
                  maxLength={40}
                  onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Your name"
                  required
                />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <input
                value={authForm.email}
                type="email"
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                value={authForm.password}
                type="password"
                minLength={6}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 6 characters"
                required
              />
            </label>
            {authError ? <div className="error-banner">{authError}</div> : null}
            <button className="auth-submit" type="submit" disabled={authLoading}>
              {authLoading ? 'Please wait...' : authMode === 'signup' ? 'Sign up' : 'Log in'}
            </button>
          </form>

          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setAuthMode((current) => (current === 'signup' ? 'login' : 'signup'));
              setAuthError('');
            }}
          >
            {authMode === 'signup' ? 'Already have an account? Log in' : 'Need an account? Sign up'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={darkMode ? 'app-shell dark' : 'app-shell'}>
      <section className="chat-panel" aria-label="Realtime chat">
        <header className="chat-header">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true">
              {activeChat.type === 'direct' ? <MessageCircle size={24} /> : <Hash size={24} />}
            </span>
            <div>
              <h1>{activeTitle}</h1>
              <p>
                {activeSubtitle} · {onlineUsers.length} {onlineUsers.length === 1 ? 'user' : 'users'} online
              </p>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className={connected ? 'status online' : 'status offline'}>
              {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{status}</span>
            </div>
          </div>
        </header>

        <div className="profile-row">
          <div className="profile-card">
            <div className="avatar small" style={{ background: colorForName(currentUser.email) }}>
              {getInitials(currentUser.name)}
            </div>
            <div>
              <strong>{currentUser.name}</strong>
              <span>{currentUser.email}</span>
            </div>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="chat-body">
          <aside className="room-panel" aria-label="Rooms and direct messages">
            <div className="room-panel-section">
              <span className="section-label">Rooms</span>
              <div className="room-list">
                {rooms.map((room) => (
                  <button
                    className={activeChat.type === 'room' && activeChat.id === room.id ? 'room-button active' : 'room-button'}
                    key={room.id}
                    type="button"
                    onClick={() => handleRoomSelect(room)}
                  >
                    {getRoomIcon(room.id)}
                    <span>{room.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="room-panel-section">
              <span className="section-label">Direct Messages</span>
              <div className="room-list">
                {onlineUsers
                  .filter((user) => user.id !== currentUser.id)
                  .map((user) => (
                    <button
                      className={activeChat.type === 'direct' && activeChat.id === user.id ? 'dm-button active' : 'dm-button'}
                      key={user.id}
                      type="button"
                      onClick={() => handleDirectSelect(user)}
                    >
                      <div className="avatar tiny" style={{ background: user.color }}>
                        {getInitials(user.username)}
                      </div>
                      <span>{user.username}</span>
                    </button>
                  ))}
              </div>
            </div>
          </aside>

          <div className="message-list" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-state">
                <MessageCircle size={34} />
                <p>No messages yet.</p>
              </div>
            ) : (
              messages.map((message) => {
                if (message.type === 'system') {
                  return (
                    <div className="system-message" key={message.id}>
                      <span>{message.text}</span>
                      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                    </div>
                  );
                }

                const mine = message.userId === currentUser.id;
                const initials = getInitials(message.username);
                const avatarColor = message.color || colorForName(message.username);

                return (
                  <article className={mine ? 'message-row mine' : 'message-row'} key={message.id}>
                    {!mine ? (
                      <div className="avatar" style={{ background: avatarColor }}>
                        {initials}
                      </div>
                    ) : null}
                    <div className={mine ? 'message-bubble mine' : 'message-bubble'}>
                      <div className="message-meta">
                        <strong>{mine ? 'You' : message.username}</strong>
                        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                    {mine ? (
                      <div className="avatar mine" style={{ background: avatarColor }}>
                        {initials}
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <aside className="online-panel" aria-label="Online users">
            <div className="online-panel-header">
              <Users size={18} />
              <span>{onlineUsers.length} online</span>
            </div>
            <div className="online-list">
              {onlineUsers.map((user) => (
                <button
                  className={activeChat.type === 'direct' && activeChat.id === user.id ? 'online-user active' : 'online-user'}
                  key={user.id}
                  type="button"
                  onClick={() => handleDirectSelect(user)}
                  disabled={user.id === currentUser.id}
                >
                  <div className="avatar small" style={{ background: user.color }}>
                    {getInitials(user.username)}
                  </div>
                  <div>
                    <strong>{user.id === currentUser.id ? 'You' : user.username}</strong>
                    <span>{user.roomId ? `In ${rooms.find((room) => room.id === user.roomId)?.name || user.roomId}` : 'Online'}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            value={draft}
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={activeChat.type === 'direct' ? `Message ${activeTitle}` : `Message #${activeTitle}`}
            aria-label="Message"
          />
          <button type="submit" disabled={!trimmedDraft || !connected} aria-label="Send message">
            <Send size={20} />
          </button>
        </form>
      </section>
    </main>
  );
}

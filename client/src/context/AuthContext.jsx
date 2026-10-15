import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'lastActivity';
const ACTIVITY_WRITE_INTERVAL_MS = 30 * 1000;
const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastWriteRef = useRef(0);

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setMember(null);
  }, []);

  const touchActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastWriteRef.current < ACTIVITY_WRITE_INTERVAL_MS) return;
    lastWriteRef.current = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  }, []);

  const isIdle = useCallback(() => {
    const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    return last > 0 && Date.now() - last >= IDLE_TIMEOUT_MS;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    if (isIdle()) {
      clearSession();
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ member }) => setMember(member))
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [clearSession, isIdle]);

  useEffect(() => {
    if (!member) return;

    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      lastWriteRef.current = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }

    const logoutIfIdle = () => {
      if (isIdle()) clearSession();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, touchActivity, { passive: true }),
    );
    const interval = window.setInterval(logoutIfIdle, IDLE_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') logoutIfIdle();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', logoutIfIdle);

    const onStorage = (e) => {
      if (e.key === 'token' && !e.newValue) clearSession();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, touchActivity));
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', logoutIfIdle);
      window.removeEventListener('storage', onStorage);
    };
  }, [member, touchActivity, isIdle, clearSession]);

  const login = async (credentials) => {
    const { member, token } = await api.login(credentials);
    localStorage.setItem('token', token);
    lastWriteRef.current = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setMember(member);
    return member;
  };

  const logout = clearSession;

  const refresh = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const { member } = await api.me();
    setMember(member);
  };

  return (
    <AuthContext.Provider value={{ member, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

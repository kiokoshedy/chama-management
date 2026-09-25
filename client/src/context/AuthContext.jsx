import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ member }) => setMember(member))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const { member, token } = await api.login(credentials);
    localStorage.setItem('token', token);
    setMember(member);
    return member;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setMember(null);
  };

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
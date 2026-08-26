import { createContext, useContext, useState, ReactNode } from "react";

type AuthContextType = {
  token: string | null;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("utl_token"));

  return (
    <AuthContext.Provider
      value={{
        token,
        setToken: (value) => {
          if (value) {
            localStorage.setItem("utl_token", value);
          } else {
            localStorage.removeItem("utl_token");
          }

          setToken(value);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

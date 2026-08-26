import { createContext, useContext, useState, ReactNode } from "react";

import { clearAuthToken, logoutRequest } from "@/api/client";

type DashboardAuthContextType = {
  loggedIn: boolean;
  login: () => void;
  logout: () => void;
};

const DashboardAuthContext = createContext<DashboardAuthContextType | null>(null);

export function DashboardAuthProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return !!(
      localStorage.getItem("energyscope-token") || sessionStorage.getItem("energyscope-token")
    );
  });

  function login() {
    setLoggedIn(true);
  }

  async function logout() {
    try {
      await logoutRequest();
    } catch (err) {
      console.warn("Logout request failed:", err);
    }

    clearAuthToken();
    setLoggedIn(false);
  }

  return (
    <DashboardAuthContext.Provider
      value={{
        loggedIn,
        login,
        logout,
      }}
    >
      {children}
    </DashboardAuthContext.Provider>
  );
}

export function useDashboardAuth() {
  const context = useContext(DashboardAuthContext);

  if (!context) {
    throw new Error("useDashboardAuth must be used inside DashboardAuthProvider");
  }

  return context;
}

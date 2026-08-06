import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, KeyboardEvent } from "react";
import { useDashboardAuth } from "@/context/DashboardAuthContext";
import {
  setRememberMe as setClientRememberMe,
} from "@/api/client";
import { login as loginApi } from "@/api/auth";

export const Route = createFileRoute('/login')({
  component: RouteComponent,
  
})

function RouteComponent() {
  const { login } = useDashboardAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const [rememberMe, setRememberMe] = useState(true);
const [showPassword, setShowPassword] = useState(false);
  
async function handleLogin() {
  try {
    setLoading(true);
    setError("");

    setClientRememberMe(rememberMe);

    await loginApi(
      email,
      password,
      rememberMe
    );

    login();

    navigate({ to: "/" });
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Login failed"
    );
  } finally {
    setLoading(false);
  }
}
  

  return (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="w-full max-w-sm rounded-xl border p-6 space-y-4">

      <h1 className="text-2xl font-bold text-center">
        EnergyScope Login
      </h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleLogin();
        }}
        className="w-full rounded border p-3"
      />

      <div className="relative">
  <input
    type={showPassword ? "text" : "password"}
    placeholder="Password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleLogin();
    }}
    className="w-full rounded border p-3 pr-16"
  />

  <button
    type="button"
    onClick={() => setShowPassword((v) => !v)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
  >
    {showPassword ? "Hide" : "Show"}
  </button>
</div>

      {error && (
        <p className="text-sm text-red-500">
          {error}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
  />
  Remember Me
</label>

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full rounded-xl bg-primary px-6 py-3 text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Signing In..." : "Sign In"}
      </button>

    </div>
  </div>
);
}

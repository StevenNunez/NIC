import { useState, type FormEvent } from "react";
import { api } from "../api";
import Credit from "../components/Credit";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", json: { password } });
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <img src="/icon-192.png" alt="" width={84} height={84} className="login-icon" />
      <h1>Radar NIC</h1>
      <p className="muted">Dominios .cl que se liberan, antes que nadie.</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="btn primary block" disabled={busy || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <Credit />
    </main>
  );
}

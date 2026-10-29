"use client";
import { useEffect, useState } from "react";
export function GooglePanel() {
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((v) => setAddress(v.googleAddress ?? ""))
      .catch(() => {});
  }, []);
  async function connect() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/google", { method: "POST" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      window.location.assign(v.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Connection failed");
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const r = await fetch("/api/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const v = await r.json();
      setMessage(r.ok ? "Test email sent to your connected account." : v.error);
    } catch {
      setMessage("Test email failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-4">
      <h2 className="text-lg">Gmail connection</h2>
      <p className="text-sm text-zinc-400">
        {address
          ? `Connected: ${address}`
          : "Save OAuth credentials in Settings, then connect."}
      </p>
      {address && !address.endsWith("@gmail.com") && (
        <p className="text-xs text-amber-300">
          This is not a plain gmail.com address. ReachFlow still applies its
          personal-Gmail limits.
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn" disabled={busy} onClick={connect}>
          {address ? "Reconnect Google" : "Connect Google account"}
        </button>
        <button className="btn" disabled={busy || !address} onClick={test}>
          Send test email to myself
        </button>
      </div>
      <p role="status" className="text-sm text-zinc-400">
        {message}
      </p>
    </section>
  );
}

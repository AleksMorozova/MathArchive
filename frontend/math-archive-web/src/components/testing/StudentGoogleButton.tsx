import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { studentApi, type GoogleResult } from "../../api/studentApi";
import { getApiErrorMessage } from "../../api/apiErrors";

type GoogleIdentity = { initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void; renderButton: (element: HTMLElement, options: object) => void };
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }
let scriptPromise: Promise<void> | undefined;
function loadGoogle() {
  if (window.google?.accounts.id) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client?hl=uk"; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { script.remove(); scriptPromise = undefined; reject(new Error("Не вдалося завантажити Google. Спробуйте ще раз або скористайтеся PIN-кодом.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function StudentGoogleButton({ link = false, onSuccess }: { link?: boolean; onSuccess: (result: GoogleResult) => Promise<void> | void }) {
  const container = useRef<HTMLDivElement>(null); const alive = useRef(true); const busyRef = useRef(false);
  const [stage, setStage] = useState<"idle" | "loading" | "ready" | "submitting">("idle"); const [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function start() {
    if (busyRef.current) return;
    busyRef.current = true; setStage("loading"); setError("");
    try {
      const challenge = await studentApi.googleChallenge(link); await loadGoogle();
      if (!alive.current || !container.current) return;
      window.google!.accounts.id.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, callback: async ({ credential }) => {
        if (!alive.current || busyRef.current) return;
        busyRef.current = true; setStage("submitting"); setError("");
        try { const result = await studentApi.googleAuthenticate(credential); if (alive.current) await onSuccess(result); }
        catch (e) { if (alive.current) { setError(getApiErrorMessage(e)); setStage("idle"); container.current?.replaceChildren(); } }
        finally { busyRef.current = false; }
      } });
      container.current.replaceChildren();
      window.google!.accounts.id.renderButton(container.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "uk", width: Math.min(360, container.current.clientWidth || 280) });
      setStage("ready");
    } catch (e) { if (alive.current) { setError(getApiErrorMessage(e)); setStage("idle"); } }
    finally { busyRef.current = false; }
  }
  return <Stack gap={1} sx={{ mb: 2 }}>
    {(stage === "idle" || stage === "loading") && <Button variant="contained" className="student-primary-button" type="button" onClick={() => void start()} disabled={stage === "loading"}>{stage === "loading" ? "Підключаємо Google…" : link ? "Підключити Google" : "Продовжити з Google"}</Button>}
    <Box ref={container} sx={{ display: stage === "ready" ? "flex" : "none", justifyContent: "center", minHeight: stage === "ready" ? 44 : 0 }} />
    {stage === "ready" && <Typography variant="body2" textAlign="center">Оберіть свій Google-акаунт у кнопці вище.</Typography>}
    {stage === "submitting" && <Typography role="status">Підтверджуємо вхід…</Typography>}
    {error && <Alert severity="error">{error}</Alert>}
  </Stack>;
}

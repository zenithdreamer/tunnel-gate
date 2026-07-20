import { useEffect, useState } from "react";
import { api, unwrap } from "./api";
import { DEMO_AUTH_KEY, useSession } from "./auth";
import { LoadingPanel } from "./components/Feedback";
import { Dashboard } from "./Dashboard";
import { Login } from "./Login";

interface Setup {
  needsSetup: boolean;
  demo?: boolean;
  credentials?: { email: string; password: string };
  user?: { name: string; email: string };
}

export function App() {
  const { data: session, isPending } = useSession();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [demoAuthed, setDemoAuthed] = useState(() => sessionStorage.getItem(DEMO_AUTH_KEY) === "1");

  useEffect(() => {
    unwrap(api.setup.get())
      .then((r) => setSetup(r as Setup))
      .catch(() => setSetup({ needsSetup: false }));
  }, []);

  if (!setup) {
    return <LoadingPanel>Establishing session…</LoadingPanel>;
  }

  if (setup.demo) {
    return demoAuthed && setup.user ? (
      <Dashboard user={setup.user} />
    ) : (
      <Login demo={setup.credentials} onDemoAuthed={() => setDemoAuthed(true)} />
    );
  }

  if (isPending) {
    return <LoadingPanel>Establishing session…</LoadingPanel>;
  }
  return session ? <Dashboard user={session.user} /> : <Login needsSetup={setup.needsSetup} />;
}

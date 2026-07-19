import { useSession } from "./auth";
import { LoadingPanel } from "./components/Feedback";
import { Dashboard } from "./Dashboard";
import { Login } from "./Login";

export function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <LoadingPanel>Establishing session…</LoadingPanel>;
  }
  return session ? <Dashboard user={session.user} /> : <Login />;
}

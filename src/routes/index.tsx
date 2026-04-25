import { createFileRoute, redirect } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="label-mono">loading…</p>
      </div>
    );
  }
  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
}

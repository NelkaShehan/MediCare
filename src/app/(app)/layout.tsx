import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth-gate";
import { SessionTokenProvider } from "@/components/session-token";
import { getSession, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  const token = await getSessionToken();
  return (
    <SessionTokenProvider token={token}>
      <AuthGate initialUser={user}>{children}</AuthGate>
    </SessionTokenProvider>
  );
}

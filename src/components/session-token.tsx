"use client";

import { createContext, useContext, type ReactNode } from "react";

const SessionTokenContext = createContext<string | null>(null);

/** Shares the server-resolved session token so links can carry it during SSR. */
export function SessionTokenProvider({ token, children }: { token: string | null; children: ReactNode }) {
  return <SessionTokenContext.Provider value={token}>{children}</SessionTokenContext.Provider>;
}

export function useSessionToken() {
  return useContext(SessionTokenContext);
}

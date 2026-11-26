"use client";

import type { ComponentProps } from "react";
import NextLink from "next/link";

import { useSessionToken } from "@/components/session-token";
import { withToken } from "@/lib/client";

/**
 * Internal navigation link that carries the session token, so pages keep working
 * when cookies are blocked (embedded previews) and even without client JS — the
 * server renders the same href because the token comes from the session context.
 */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const token = useSessionToken();
  const resolved = typeof href === "string" ? withToken(href, token) : href;
  return <NextLink href={resolved} {...props} />;
}

export default Link;

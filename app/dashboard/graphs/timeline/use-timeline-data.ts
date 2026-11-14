"use client";

/** One `/api/timeline` request per mount and per retry, aborted when superseded or unmounted, with its loaded body and its last failure message. */

import { useEffect, useState } from "react";

/**
 * `failure` is the message for a failed response that names no error; `check` throws to reject an OK body the caller cannot use, its message becoming `error`.
 * Every argument must keep its identity across renders, or the request refires; a retry clears `error` but keeps the last loaded `data`.
 */
export function useTimelineData<T>(url: string, failure: string, check?: (body: T) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? failure);
        check?.(body);
        return body as T;
      })
      .then((body) => {
        if (!controller.signal.aborted) setData(body);
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => {
      controller.abort();
    };
  }, [url, failure, check, attempt]);
  return { data, error, retry: () => setAttempt((value) => value + 1) };
}

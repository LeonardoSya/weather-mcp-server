import { USER_AGENT } from "../index.js";
import { AlertFeature } from "./types.js";

export async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (error) {
    console.error("Error making NWS request: ", error);
    return null;
  }
}
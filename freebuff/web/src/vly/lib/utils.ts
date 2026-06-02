import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getDomain, getSubdomain as getTldtsSubdomain } from "tldts";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types for the result object with discriminated union
type Success<T> = [T, null];

type Failure<E> = [null, E];

export function Success<T>(data: T): Success<T> {
  return [data, null];
}

export function Failure<E>(error: E): Failure<E> {
  return [null, error];
}

export type Result<T, E = Error> = Success<T> | Failure<E>;

// Main wrapper function
export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error as E];
  }
}
/**
 * Extracts the root domain from a given domain, properly handling multi-part TLDs using tldts
 * Examples:
 * - test.co.in -> test.co.in
 * - sub.test.co.in -> test.co.in
 * - example.com -> example.com
 * - sub.example.com -> example.com
 */
export function getRootDomain(domain: string): string {
  const rootDomain = getDomain(domain.toLowerCase());
  return rootDomain || domain; // Return original if parsing fails
}

/**
 * Extracts the subdomain from a given domain, properly handling multi-part TLDs using tldts
 * Examples:
 * - sub.test.co.in -> sub
 * - www.sub.test.co.in -> www.sub
 * - test.co.in -> (empty string)
 */
export function getSubdomain(domain: string): string {
  const subdomain = getTldtsSubdomain(domain.toLowerCase());
  return subdomain || "";
}

export function filterTerminalOuptut(inputString: string) {
  // Define the escape sequence to match
  const escapeSequence = "\x1b[1A\x1b[0K";

  // Split the input string into lines
  const lines = inputString.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(escapeSequence)) {
      lines[i - 1] = "\x1b<del>" + lines[i - 1];
    }
  }

  // Filter out any lines containing the escape sequence
  const filteredLines = lines.filter((line) => !line.startsWith("\x1b<del>"));

  // Filter out lines with loading spinner characters
  const finalFilteredLines = filteredLines.filter(
    (line) => !/[⠸⠼⠴⠦⠧⠇⠏⠋⠙⠹⠸⠰⠤⠠⠢⠖⠦⠔⠪⠫⠩⠨⠂⠆⠄⠈]/.test(line),
  );

  // Remove ANSI codes from each line first to make text matching work properly
  const cleanedLines = finalFilteredLines.map((line) =>
    line
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, "")
      .replace(/\[\?25[hl]/g, "")
      .replace(/\[1G\[0K/g, "")
      .replace(/\[1A\[0K/g, "")
      .replace(/^\[1G$/g, "")
      .replace(/^\[0K$/g, "")
      .replace(/^\[1A$/g, "")
      .replace(/\x1b/g, ""),
  );

  // Remove empty lines
  const nonEmptyLines = cleanedLines.filter((line) => line.trim() !== "");

  // Remove lines with specific Convex deployment messages
  const filteredConvexLines = nonEmptyLines.filter(
    (line) =>
      !line.includes("Provisioned a dev deployment") &&
      !line.includes("Write your Convex") &&
      !line.includes("Give us feedback") &&
      !line.includes("View the Convex dashboard") &&
      !line.includes("Downloading current deployment") &&
      !line.includes("Diffing local code and deployment state") &&
      !line.includes("Analyzing and deploying source code") &&
      !line.includes("Collecting TypeScript errors") &&
      !line.includes("Preparing Convex functions") &&
      !line.includes("To ignore failing typecheck"),
  );

  // Join the remaining lines back together
  const cleanedString = filteredConvexLines.join("\n");

  return cleanedString;
}

export type OAuthStrategy = "oauth_google" | "oauth_github";

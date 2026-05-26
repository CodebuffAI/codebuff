"use node";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";

export const CODEX_DEVICE_AUTH_URL = "https://auth.openai.com/codex/device";

export type DeviceAuthInfo = {
  verificationUrl?: string;
  userCode?: string;
};

export type CodexAuthPayload = {
  auth_mode: "chatgpt";
  OPENAI_API_KEY: string | null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh?: string;
};

export type CodexAuthFileStatus = {
  hasAuthFile: boolean;
  isAuthenticated: boolean;
  authMode?: string;
  lastRefresh?: string;
  authFingerprint?: string;
  authPayload?: CodexAuthPayload;
  authPayloadJson?: string;
};

type EncryptedCodexAuthBlobV1 = {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
};

const AUTH_ENCRYPTION_VERSION = 1 as const;

export const getCodexAuthEncryptionSecret = () =>
  process.env.CODEX_AUTH_ENCRYPTION_KEY ||
  process.env.CONVEX_TOKEN_ENCRYPTION_KEY;

export const getCodexAuthHashSalt = () =>
  process.env.CODEX_AUTH_HASH_SALT || getCodexAuthEncryptionSecret();

const stripAnsiAndControlCodes = (value: string) =>
  value
    // Strip ANSI color/control codes from CLI output (e.g. trailing %1B[0m).
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");

const extractJsonObject = (rawValue: string): string | undefined => {
  const firstBrace = rawValue.indexOf("{");
  const lastBrace = rawValue.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return undefined;
  }
  return rawValue.slice(firstBrace, lastBrace + 1);
};

const normalizeCodexAuthPayload = (
  parsed: any,
): { payload?: CodexAuthPayload; authMode?: string; lastRefresh?: string } => {
  const authMode =
    typeof parsed?.auth_mode === "string" ? parsed.auth_mode : undefined;
  const lastRefresh =
    typeof parsed?.last_refresh === "string" ? parsed.last_refresh : undefined;

  const openaiApiKey =
    typeof parsed?.OPENAI_API_KEY === "string"
      ? parsed.OPENAI_API_KEY
      : parsed?.OPENAI_API_KEY === null
        ? null
        : null;

  const tokens = parsed?.tokens;
  const idToken = typeof tokens?.id_token === "string" ? tokens.id_token : "";
  const accessToken =
    typeof tokens?.access_token === "string" ? tokens.access_token : "";
  const refreshToken =
    typeof tokens?.refresh_token === "string" ? tokens.refresh_token : "";
  const accountId =
    typeof tokens?.account_id === "string" ? tokens.account_id : "";

  const isAuthenticated =
    authMode === "chatgpt" &&
    idToken.length > 0 &&
    accessToken.length > 0 &&
    refreshToken.length > 0 &&
    accountId.length > 0;

  if (!isAuthenticated) {
    return { payload: undefined, authMode, lastRefresh };
  }

  return {
    payload: {
      auth_mode: "chatgpt",
      OPENAI_API_KEY: openaiApiKey,
      tokens: {
        id_token: idToken,
        access_token: accessToken,
        refresh_token: refreshToken,
        account_id: accountId,
      },
      last_refresh: lastRefresh,
    },
    authMode,
    lastRefresh,
  };
};

const deriveEncryptionKey = (encryptionSecret: string): Buffer =>
  createHash("sha256").update(encryptionSecret, "utf8").digest();

const computeCodexAuthFingerprint = (
  payload: CodexAuthPayload,
  hashSalt?: string,
): string | undefined => {
  if (!hashSalt) {
    return undefined;
  }
  return createHmac("sha256", hashSalt)
    .update(
      [
        payload.tokens.id_token,
        payload.tokens.access_token,
        payload.tokens.refresh_token,
        payload.tokens.account_id,
      ].join(":"),
    )
    .digest("hex");
};

export const parseDeviceAuthInfo = (rawLog: string): DeviceAuthInfo => {
  const sanitizedLog = stripAnsiAndControlCodes(rawLog);

  const urls = sanitizedLog.match(/https?:\/\/[^\s"'<>]+/g) || [];
  const hasDeviceUrl = urls.some((url) =>
    /auth\.openai\.com\/codex\/device/i.test(url),
  );

  const codeWithKeywordMatch = sanitizedLog.match(
    /(?:one[-\s]*time\s*code|user\s*code|verification\s*code|enter\s*(?:this\s*)?(?:one[-\s]*time\s*)?code|code)\s*[:=]?\s*((?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)(?:[A-Z0-9]{4,}(?:-[A-Z0-9]{3,})+|[A-Z0-9]{8,}))/i,
  );
  const fallbackCodeMatch = sanitizedLog.match(
    /\b((?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)(?:[A-Z0-9]{4,}(?:-[A-Z0-9]{3,})+|[A-Z0-9]{8,}))\b/,
  );

  return {
    verificationUrl: hasDeviceUrl ? CODEX_DEVICE_AUTH_URL : undefined,
    userCode: codeWithKeywordMatch?.[1] || fallbackCodeMatch?.[1],
  };
};

export const parseCodexAuthFileStatus = (
  rawFileOutput: string,
  hashSalt?: string,
): CodexAuthFileStatus => {
  const rawJson = extractJsonObject(rawFileOutput);
  if (!rawJson) {
    return { hasAuthFile: false, isAuthenticated: false };
  }

  try {
    const parsed = JSON.parse(rawJson);
    const { payload, authMode, lastRefresh } =
      normalizeCodexAuthPayload(parsed);

    if (!payload) {
      return {
        hasAuthFile: true,
        isAuthenticated: false,
        authMode,
        lastRefresh,
      };
    }

    const authPayloadJson = JSON.stringify(payload);
    return {
      hasAuthFile: true,
      isAuthenticated: true,
      authMode,
      lastRefresh,
      authFingerprint: computeCodexAuthFingerprint(payload, hashSalt),
      authPayload: payload,
      authPayloadJson,
    };
  } catch {
    return { hasAuthFile: true, isAuthenticated: false };
  }
};

export const encryptCodexAuthPayload = (
  authPayloadJson: string,
  encryptionSecret: string,
): { encryptedPayload: string; encryptionVersion: number } | undefined => {
  if (!authPayloadJson || !encryptionSecret) {
    return undefined;
  }

  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(encryptionSecret),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(authPayloadJson, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const blob: EncryptedCodexAuthBlobV1 = {
      version: AUTH_ENCRYPTION_VERSION,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    return {
      encryptedPayload: JSON.stringify(blob),
      encryptionVersion: AUTH_ENCRYPTION_VERSION,
    };
  } catch {
    return undefined;
  }
};

export const decryptCodexAuthPayload = (
  encryptedPayload: string,
  encryptionSecret: string,
): { authPayload: CodexAuthPayload; authPayloadJson: string } | undefined => {
  if (!encryptedPayload || !encryptionSecret) {
    return undefined;
  }

  try {
    const parsedBlob = JSON.parse(encryptedPayload) as EncryptedCodexAuthBlobV1;
    if (
      parsedBlob.version !== AUTH_ENCRYPTION_VERSION ||
      typeof parsedBlob.iv !== "string" ||
      typeof parsedBlob.authTag !== "string" ||
      typeof parsedBlob.ciphertext !== "string"
    ) {
      return undefined;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(encryptionSecret),
      Buffer.from(parsedBlob.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(parsedBlob.authTag, "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsedBlob.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    const status = parseCodexAuthFileStatus(decrypted);
    if (
      !status.isAuthenticated ||
      !status.authPayload ||
      !status.authPayloadJson
    ) {
      return undefined;
    }

    return {
      authPayload: status.authPayload,
      authPayloadJson: status.authPayloadJson,
    };
  } catch {
    return undefined;
  }
};

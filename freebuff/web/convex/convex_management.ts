"use node";

import axios, { isAxiosError } from "axios";
import { randomUUID } from "crypto";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const convexAxiosV1 = axios.create({
  baseURL: "https://api.convex.dev/v1",
  headers: {
    Authorization: `Bearer ${process.env.CONVEX_ADMIN_KEY}`,
  },
});

export const convexAxiosOld = axios.create({
  baseURL: "https://api.convex.dev/api",
  headers: {
    Authorization: `Bearer ${process.env.CONVEX_ADMIN_KEY}`,
  },
});

const USAGE_LOG_WEBHOOK_URL = "https://convex-usage.vly.ai/webhook";

function isLogStreamAlreadyExistsError(data: unknown): boolean {
  if (!data) {
    return false;
  }

  if (typeof data === "string") {
    return (
      data.includes("LogStreamAlreadyExists") || data.includes("already exists")
    );
  }

  if (typeof data === "object") {
    const errorData = data as { code?: unknown; message?: unknown };
    return (
      errorData.code === "LogStreamAlreadyExists" ||
      (typeof errorData.message === "string" &&
        errorData.message.includes("already exists"))
    );
  }

  return false;
}

/**
 * Generate JWT key pair for Convex Auth
 * Returns JWT_PRIVATE_KEY (PEM format) and JWKS (JSON Web Key Set)
 */
export async function generateJWTKeyPair(): Promise<{
  privateKey: string;
  jwks: string;
}> {
  try {
    // Generate RS256 key pair
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });

    // Export private key in PKCS8 PEM format
    const privateKeyPem = await exportPKCS8(privateKey);
    const privateKeySingleLine = privateKeyPem.trimEnd().replace(/\n/g, " ");

    // Export public key as JWK
    const publicJwk = await exportJWK(publicKey);

    // Add required fields for JWKS
    publicJwk.use = "sig";

    // Create JWKS (JSON Web Key Set)
    const jwks = JSON.stringify({
      keys: [publicJwk],
    });

    return {
      privateKey: privateKeySingleLine,
      jwks,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate JWT key pair: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get environment variables for a Convex deployment using the Deployment API
 * Requires a deployment-specific deploy key (not the team admin key)
 */
export async function getConvexEnvironmentVariables(
  deploymentName: string,
  deployKey: string,
  deploymentUrl?: string,
): Promise<Record<string, string>> {
  try {
    const url = deploymentUrl ?? `https://${deploymentName}.convex.cloud`;

    const response = await axios.get<{
      environmentVariables: Record<string, string>;
    }>(`${url}/api/v1/list_environment_variables`, {
      headers: {
        Authorization: `Convex ${deployKey}`,
      },
    });

    // The API returns { environmentVariables: { KEY1: "value1", KEY2: "value2", ... } }
    const envVars = response.data?.environmentVariables;

    if (!envVars || typeof envVars !== "object") {
      console.error(
        `Unexpected response format from list_environment_variables:`,
        JSON.stringify(response.data),
      );
      return {};
    }


    return envVars;
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        `Failed to get environment variables for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
      throw new Error(
        `Failed to get environment variables: ${JSON.stringify(error.response?.data)}`,
      );
    }
    throw error;
  }
}

/**
 * Set environment variables for a Convex deployment using the Deployment API
 * Requires a deployment-specific deploy key (not the team admin key)
 */
export async function setConvexEnvironmentVariables(
  deploymentName: string,
  deployKey: string,
  variables: Record<string, string>,
  deploymentUrl?: string,
): Promise<void> {
  try {
    const url = deploymentUrl ?? `https://${deploymentName}.convex.cloud`;

    const changes = Object.entries(variables).map(([name, value]) => ({
      name,
      value,
    }));

    const requestBody = { changes };
    await axios.post(
      `${url}/api/v1/update_environment_variables`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );

    console.log(
      `Successfully set environment variables for ${deploymentName}:`,
      Object.keys(variables).join(", "),
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to set environment variables: ${JSON.stringify(error.response?.data)}`,
      );
    }
    throw error;
  }
}

/**
 * Delete an environment variable from a Convex deployment using the Deployment API
 * Sends value: null in the changes array to remove the variable
 */
export async function deleteConvexEnvironmentVariable(
  deploymentName: string,
  deployKey: string,
  variableName: string,
  deploymentUrl?: string,
): Promise<void> {
  try {
    const url = deploymentUrl ?? `https://${deploymentName}.convex.cloud`;

    const changes = [{ name: variableName, value: null }];

    await axios.post(
      `${url}/api/v1/update_environment_variables`,
      { changes },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );

    console.log(
      `Successfully deleted environment variable ${variableName} for ${deploymentName}`,
    );
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        `Failed to delete environment variable: ${JSON.stringify(error.response?.data)}`,
      );
    }
    throw error;
  }
}

export async function createDeployKey(
  deploymentName: string,
  keyName?: string,
) {
  keyName ??= randomUUID();

  try {
    const response = await convexAxiosV1.post<{ deployKey: string }>(
      `/deployments/${deploymentName}/create_deploy_key`,
      {
        name: keyName,
      },
    );

    return response.data.deployKey;
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        "Failed to create deploy key: " + JSON.stringify(error.response?.data),
      );
    }
    throw error;
  }
}

export async function createConvexProject() {
  if (!process.env.CONVEX_TEAM_ID) {
    throw new Error("CONVEX_TEAM_ID is not set");
  }

  const projectName = randomUUID();

  try {
    const response = await convexAxiosV1.post<{
      deploymentName: string;
      deploymentUrl: string;
      projectId: number;
    }>(`/teams/${process.env.CONVEX_TEAM_ID}/create_project`, {
      deploymentType: "dev",
      projectName,
    });

    return response.data;
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(
        "Failed to create project: " + JSON.stringify(error.response?.data),
      );
    }
    throw error;
  }
}

export async function createConvexDeployment({
  deploymentType,
  convexProjectId,
}: {
  deploymentType: "dev" | "prod";
  convexProjectId: number;
}) {
  const result = await convexAxiosV1.post<{ name: string }>(
    `/projects/${convexProjectId}/create_deployment`,
    { type: deploymentType },
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return result.data.name;
}

export async function configureUsageLogging(
  deploymentName: string,
  deployKey: string,
): Promise<string> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    // Use new Deployment API endpoint for creating log streams
    const response = await axios.post<{ id: string }>(
      `${deploymentUrl}/api/v1/create_log_stream`,
      {
        logStreamType: "webhook",
        url: USAGE_LOG_WEBHOOK_URL,
        format: "json",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );
    console.log(
      `Successfully configured usage logging for deployment ${deploymentName}, log stream ID: ${response.data.id}`,
    );
    return response.data.id;
  } catch (error) {
    if (isAxiosError(error)) {
      if (isLogStreamAlreadyExistsError(error.response?.data)) {
        console.warn(
          `Usage logging webhook already exists for deployment ${deploymentName}; reusing existing log stream`,
        );

        const existingSinks = await listConfiguredSinks(
          deploymentName,
          deployKey,
        );
        const existingWebhook = existingSinks.find(
          (sink) =>
            sink.logStreamType === "webhook" &&
            sink.url === USAGE_LOG_WEBHOOK_URL,
        );

        if (existingWebhook) {
          return existingWebhook.id;
        }

        const anyWebhook = existingSinks.find(
          (sink) => sink.logStreamType === "webhook",
        );
        if (anyWebhook) {
          return anyWebhook.id;
        }

        // If Convex reports it already exists, treat as configured even when
        // list_log_streams is stale or unavailable.
        return "already-exists";
      }

      console.error(
        "Failed to configure usage logging:",
        JSON.stringify(error.response?.data),
      );
      throw new Error(
        "Failed to configure usage logging: " +
          JSON.stringify(error.response?.data),
      );
    }
    throw error;
  }
}

/**
 * List configured log streams for a deployment using new Deployment API
 */
export async function listConfiguredSinks(
  deploymentName: string,
  deployKey: string,
): Promise<
  Array<{
    id: string;
    logStreamType: string;
    url: string;
    format: "json" | "jsonl";
    hmacSecret: string;
    status: {
      type: "failed" | "pending" | "active" | "deleting";
      reason?: string;
    };
  }>
> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    // Use new Deployment API endpoint for listing log streams
    const response = await axios.get<
      Array<{
        id: string;
        logStreamType: string;
        url: string;
        format: "json" | "jsonl";
        hmacSecret: string;
        status: {
          type: "failed" | "pending" | "active" | "deleting";
          reason?: string;
        };
      }>
    >(`${deploymentUrl}/api/v1/list_log_streams`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Convex ${deployKey}`,
      },
    });

    return response.data || [];
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        `Failed to list configured sinks for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
    }
    // Don't throw - return empty array so we can attempt to configure
    return [];
  }
}

/**
 * Ensure webhook is configured for a deployment.
 * Checks if webhook exists and is active, creates it if missing.
 * Returns the log stream ID.
 */
export async function ensureWebhookConfigured(
  deploymentName: string,
  deployKey: string,
): Promise<{
  success: boolean;
  action: "already_configured" | "configured" | "failed";
  message: string;
  logStreamId?: string;
}> {
  const targetUrl = USAGE_LOG_WEBHOOK_URL;

  try {
    // Check existing webhooks using new API
    const sinks = await listConfiguredSinks(deploymentName, deployKey);

    // Check if our webhook is already configured and active
    const existingWebhook = sinks.find(
      (sink) => sink.logStreamType === "webhook" && sink.url === targetUrl,
    );

    if (existingWebhook) {
      if (existingWebhook.status.type === "active") {
        console.log(
          `Webhook already active for deployment ${deploymentName}, log stream ID: ${existingWebhook.id}`,
        );
        return {
          success: true,
          action: "already_configured",
          message: `Webhook already active for ${deploymentName}`,
          logStreamId: existingWebhook.id,
        };
      } else {
        console.log(
          `Webhook exists but status is ${existingWebhook.status.type} for deployment ${deploymentName}. Reason: ${existingWebhook.status.reason || "none"}`,
        );
        // Webhook exists but is not active - we'll try to reconfigure
      }
    }

    // Configure the webhook using new API
    const logStreamId = await configureUsageLogging(deploymentName, deployKey);

    return {
      success: true,
      action: "configured",
      message: `Successfully configured webhook for ${deploymentName}`,
      logStreamId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to ensure webhook configured for ${deploymentName}:`,
      errorMessage,
    );
    return {
      success: false,
      action: "failed",
      message: `Failed to configure webhook for ${deploymentName}: ${errorMessage}`,
    };
  }
}

/**
 * Update an existing log stream configuration
 */
export async function updateLogStream(
  deploymentName: string,
  deployKey: string,
  logStreamId: string,
  newUrl: string,
  format?: "json" | "jsonl",
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    await axios.post(
      `${deploymentUrl}/api/v1/update_log_stream/${logStreamId}`,
      {
        logStreamType: "webhook",
        url: newUrl,
        format: format || null,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );

    console.log(
      `Successfully updated log stream ${logStreamId} for deployment ${deploymentName}`,
    );

    return {
      success: true,
      message: `Successfully updated log stream ${logStreamId}`,
    };
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        `Failed to update log stream for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
      return {
        success: false,
        message: `Failed to update log stream: ${JSON.stringify(error.response?.data)}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to update log stream for ${deploymentName}:`,
      errorMessage,
    );
    return {
      success: false,
      message: `Failed to update log stream: ${errorMessage}`,
    };
  }
}

/**
 * Delete a log stream
 */
export async function deleteLogStream(
  deploymentName: string,
  deployKey: string,
  logStreamId: string,
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    await axios.post(
      `${deploymentUrl}/api/v1/delete_log_stream/${logStreamId}`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );

    console.log(
      `Successfully deleted log stream ${logStreamId} for deployment ${deploymentName}`,
    );

    return {
      success: true,
      message: `Successfully deleted log stream ${logStreamId}`,
    };
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        `Failed to delete log stream for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
      return {
        success: false,
        message: `Failed to delete log stream: ${JSON.stringify(error.response?.data)}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to delete log stream for ${deploymentName}:`,
      errorMessage,
    );
    return {
      success: false,
      message: `Failed to delete log stream: ${errorMessage}`,
    };
  }
}

/**
 * Rotate webhook secret for a log stream
 */
export async function rotateWebhookLogStreamSecret(
  deploymentName: string,
  deployKey: string,
  logStreamId: string,
): Promise<{
  success: boolean;
  message: string;
  newSecret?: string;
}> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    const response = await axios.post<{ secret: string }>(
      `${deploymentUrl}/api/v1/rotate_webhook_secret/${logStreamId}`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );

    console.log(
      `Successfully rotated webhook secret for log stream ${logStreamId} on deployment ${deploymentName}`,
    );

    return {
      success: true,
      message: `Successfully rotated webhook secret`,
      newSecret: response.data.secret,
    };
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        `Failed to rotate webhook secret for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
      return {
        success: false,
        message: `Failed to rotate webhook secret: ${JSON.stringify(error.response?.data)}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to rotate webhook secret for ${deploymentName}:`,
      errorMessage,
    );
    return {
      success: false,
      message: `Failed to rotate webhook secret: ${errorMessage}`,
    };
  }
}

/**
 * Change deployment state (pause/unpause) using team access token
 */
export async function changeDeploymentStateWithTeamToken(
  deploymentName: string,
  newState: "paused" | "running",
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    await axios.post(
      `${deploymentUrl}/api/change_deployment_state`,
      {
        newState,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${process.env.CONVEX_TEAM_ACCESS_TOKEN}`,
        },
      },
    );

    console.log(
      `Successfully changed deployment ${deploymentName} state to ${newState}`,
    );

    return {
      success: true,
      message: `Successfully changed deployment ${deploymentName} state to ${newState}`,
    };
  } catch (error) {
    if (isAxiosError(error)) {
      // Handle "already in state" as success since desired state is achieved
      if (error.response?.data?.code === "DeploymentAlreadyInState") {
        console.log(`Deployment ${deploymentName} is already ${newState}`);
        return {
          success: true,
          message: `Deployment ${deploymentName} is already ${newState}`,
        };
      }

      console.error(
        `Failed to change deployment state for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
      return {
        success: false,
        message: `Failed to change deployment state for ${deploymentName}: ${JSON.stringify(error.response?.data)}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to change deployment state for ${deploymentName}:`,
      errorMessage,
    );
    return {
      success: false,
      message: `Failed to change deployment state for ${deploymentName}: ${errorMessage}`,
    };
  }
}

/**
 * Change deployment state (pause/unpause) using deployment admin key
 */
export async function changeDeploymentState(
  deploymentName: string,
  deployKey: string,
  newState: "paused" | "running",
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const deploymentUrl = `https://${deploymentName}.convex.cloud`;
    await axios.post(
      `${deploymentUrl}/api/change_deployment_state`,
      {
        newState,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${deployKey}`,
        },
      },
    );

    console.log(
      `Successfully changed deployment ${deploymentName} state to ${newState}`,
    );

    return {
      success: true,
      message: `Successfully changed deployment ${deploymentName} state to ${newState}`,
    };
  } catch (error) {
    if (isAxiosError(error)) {
      // Handle "already in state" as success since desired state is achieved
      if (error.response?.data?.code === "DeploymentAlreadyInState") {
        console.log(`Deployment ${deploymentName} is already ${newState}`);
        return {
          success: true,
          message: `Deployment ${deploymentName} is already ${newState}`,
        };
      }

      console.error(
        `Failed to change deployment state for ${deploymentName}:`,
        JSON.stringify(error.response?.data),
      );
      return {
        success: false,
        message: `Failed to change deployment state for ${deploymentName}: ${JSON.stringify(error.response?.data)}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to change deployment state for ${deploymentName}:`,
      errorMessage,
    );
    return {
      success: false,
      message: `Failed to change deployment state for ${deploymentName}: ${errorMessage}`,
    };
  }
}

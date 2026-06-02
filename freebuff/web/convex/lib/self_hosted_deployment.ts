"use node";

import axios, { isAxiosError } from "axios";

const DEFAULT_CONVEX_DOMAIN = ".convex.cloud";

interface ConvexConnection {
  dev_deployment_name?: string;
  dev_deployment_url?: string;
  prod_deployment_name?: string;
  prod_deployment_url?: string;
  dev_deploy_key?: string;
  prod_deploy_key?: string;
}

interface DeploymentInfo {
  deploymentUrl: string;
  region: string;
  name: string;
  deploymentType: string;
}

export class SelfHostedDeployment {
  private readonly deploymentName: string;
  private readonly deploymentUrl: string;
  private readonly deployKey: string;

  private constructor(
    deploymentName: string,
    deploymentUrl: string,
    deployKey: string,
  ) {
    this.deploymentName = deploymentName;
    this.deploymentUrl = deploymentUrl;
    this.deployKey = deployKey;
  }

  static fromConnection(
    connection: ConvexConnection,
    decryptedKey: string,
    type: "dev" | "prod",
  ): SelfHostedDeployment {
    const name =
      type === "dev"
        ? connection.dev_deployment_name
        : connection.prod_deployment_name;

    const url =
      type === "dev"
        ? connection.dev_deployment_url
        : connection.prod_deployment_url;

    if (!name) {
      throw new Error(
        `No ${type} deployment name found in self-hosted connection`,
      );
    }

    return new SelfHostedDeployment(
      name,
      url ?? SelfHostedDeployment.buildDefaultUrl(name),
      decryptedKey,
    );
  }

  static async resolveUrl(
    deploymentName: string,
    accessToken: string,
  ): Promise<string> {
    try {
      const response = await axios.get<DeploymentInfo>(
        `https://api.convex.dev/v1/deployments/${deploymentName}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.data.deploymentUrl) {
        return response.data.deploymentUrl;
      }

      return SelfHostedDeployment.buildDefaultUrl(deploymentName);
    } catch (error) {
      console.warn(
        `Failed to resolve URL for deployment ${deploymentName}, using default:`,
        error instanceof Error ? error.message : error,
      );
      return SelfHostedDeployment.buildDefaultUrl(deploymentName);
    }
  }

  static buildDefaultUrl(deploymentName: string): string {
    return `https://${deploymentName}${DEFAULT_CONVEX_DOMAIN}`;
  }

  getDeploymentUrl(): string {
    return this.deploymentUrl;
  }

  getDeploymentName(): string {
    return this.deploymentName;
  }

  async getEnvVars(): Promise<Record<string, string>> {
    try {
      const response = await axios.get<{
        environmentVariables: Record<string, string>;
      }>(`${this.deploymentUrl}/api/v1/list_environment_variables`, {
        headers: {
          Authorization: `Convex ${this.deployKey}`,
        },
      });

      const envVars = response.data?.environmentVariables;

      if (!envVars || typeof envVars !== "object") {
        console.error(
          `Unexpected response format from list_environment_variables:`,
          JSON.stringify(response.data),
        );
        return {};
      }

      console.log(
        `Successfully fetched ${Object.keys(envVars).length} environment variables for ${this.deploymentName}`,
      );

      return envVars;
    } catch (error) {
      if (isAxiosError(error)) {
        console.error(
          `Failed to get environment variables for ${this.deploymentName}:`,
          JSON.stringify(error.response?.data),
        );
        throw new Error(
          `Failed to get environment variables: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async setEnvVars(variables: Record<string, string>): Promise<void> {
    try {
      const changes = Object.entries(variables).map(([name, value]) => ({
        name,
        value,
      }));

      await axios.post(
        `${this.deploymentUrl}/api/v1/update_environment_variables`,
        { changes },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Convex ${this.deployKey}`,
          },
        },
      );

      console.log(
        `Successfully set environment variables for ${this.deploymentName}:`,
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

  async deleteEnvVar(variableName: string): Promise<void> {
    try {
      const changes = [{ name: variableName, value: null }];

      await axios.post(
        `${this.deploymentUrl}/api/v1/update_environment_variables`,
        { changes },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Convex ${this.deployKey}`,
          },
        },
      );

      console.log(
        `Successfully deleted environment variable ${variableName} for ${this.deploymentName}`,
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

  async changeState(
    newState: "paused" | "running",
  ): Promise<{ success: boolean; message: string }> {
    try {
      await axios.post(
        `${this.deploymentUrl}/api/change_deployment_state`,
        { newState },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Convex ${this.deployKey}`,
          },
        },
      );

      console.log(
        `Successfully changed deployment ${this.deploymentName} state to ${newState}`,
      );

      return {
        success: true,
        message: `Successfully changed deployment ${this.deploymentName} state to ${newState}`,
      };
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.data?.code === "DeploymentAlreadyInState") {
          return {
            success: true,
            message: `Deployment ${this.deploymentName} is already ${newState}`,
          };
        }

        return {
          success: false,
          message: `Failed to change deployment state: ${JSON.stringify(error.response?.data)}`,
        };
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to change deployment state: ${errorMessage}`,
      };
    }
  }

  async setEnvVarsOnProdDeployment(
    envVars: Record<string, string>,
  ): Promise<void> {
    const strippedKey = this.deployKey.split(":")[1] ?? this.deployKey;

    try {
      await axios.post(
        `${this.deploymentUrl}/api/v1/update_environment_variables`,
        {
          changes: Object.entries(envVars).map(([key, value]) => ({
            name: key,
            value,
          })),
        },
        {
          headers: {
            Authorization: `Convex ${strippedKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log(
        "Successfully set environment variables on deployment",
        this.deploymentName,
      );
    } catch (error) {
      console.error(
        `Error setting environment variables on deployment ${this.deploymentName}:`,
        error,
      );
      throw error;
    }
  }
}

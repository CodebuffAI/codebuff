import { describe, expect, it } from "bun:test";

import { extractGravitySearchResult } from "../gravity_parse";

describe("extractGravitySearchResult", () => {
  it("parses a typical SDK-enveloped search result", () => {
    const output = [
      {
        type: "json",
        value: {
          search_id: "srch_123",
          recommendation: { slug: "Resend", name: "Resend" },
          credential_request: {
            required_env_vars: ["RESEND_API_KEY"],
          },
        },
      },
    ];
    expect(extractGravitySearchResult(output)).toEqual({
      searchId: "srch_123",
      slug: "resend",
      requiredEnvVars: ["RESEND_API_KEY"],
    });
  });

  it("accepts a bare (non-enveloped) result object", () => {
    const output = {
      search_id: "srch_9",
      recommendation: { slug: "stripe" },
      credential_request: { required_env_vars: ["STRIPE_SECRET_KEY"] },
    };
    expect(extractGravitySearchResult(output)).toEqual({
      searchId: "srch_9",
      slug: "stripe",
      requiredEnvVars: ["STRIPE_SECRET_KEY"],
    });
  });

  it("falls back to install.env_vars when no credential_request", () => {
    const output = [
      {
        value: {
          search_id: "srch_x",
          recommendation: { slug: "twilio" },
          install: { env_vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] },
        },
      },
    ];
    expect(extractGravitySearchResult(output)).toEqual({
      searchId: "srch_x",
      slug: "twilio",
      requiredEnvVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    });
  });

  it("trims and de-dupes env var keys", () => {
    const output = {
      search_id: "  srch_t  ",
      recommendation: { slug: " Resend " },
      credential_request: {
        required_env_vars: [" RESEND_API_KEY ", "RESEND_API_KEY", ""],
      },
    };
    expect(extractGravitySearchResult(output)).toEqual({
      searchId: "srch_t",
      slug: "resend",
      requiredEnvVars: ["RESEND_API_KEY"],
    });
  });

  it("returns null without a search_id (e.g. get_service output)", () => {
    const output = {
      recommendation: { slug: "resend" },
      credential_request: { required_env_vars: ["RESEND_API_KEY"] },
    };
    expect(extractGravitySearchResult(output)).toBeNull();
  });

  it("returns null without a recommended slug", () => {
    const output = {
      search_id: "srch_1",
      credential_request: { required_env_vars: ["X"] },
    };
    expect(extractGravitySearchResult(output)).toBeNull();
  });

  it("returns null when no required env vars are known", () => {
    const output = {
      search_id: "srch_1",
      recommendation: { slug: "resend" },
    };
    expect(extractGravitySearchResult(output)).toBeNull();
  });

  it("tolerates garbage / non-object input", () => {
    expect(extractGravitySearchResult(null)).toBeNull();
    expect(extractGravitySearchResult("nope")).toBeNull();
    expect(extractGravitySearchResult([{ type: "text", value: "hi" }])).toBeNull();
    expect(extractGravitySearchResult([])).toBeNull();
  });
});

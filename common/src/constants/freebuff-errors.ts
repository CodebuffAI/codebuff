/** Provider billing failures observed from CrofAI, OpenRouter, and similar APIs. */
export const FREEBUFF_PROVIDER_USAGE_ERROR_PATTERN =
  /\b(?:(?:not enough|insufficient|out of)\s+credits?|(?:add|refill|top up)\s+(?:more\s+)?credits?)\b/i

/**
 * The Codebuff API's own 402 for a paid (non-free) request names the user's
 * balance page: "Out of credits. Please add credits at
 * https://www.codebuff.com/usage." That is the USER'S account running dry, so it
 * must reach the ordinary out-of-credits flow; it also matches
 * FREEBUFF_PROVIDER_USAGE_ERROR_PATTERN ("add credits"), which told a paying
 * user "this is on us, not your account" (2026-09-26, CLI, lite mode).
 */
export const CODEBUFF_OWN_CREDITS_ERROR_PATTERN = /codebuff\.com\/usage/i

/** Shared copy keeps every Freebuff surface clear that the user is not billed. */
export const FREEBUFF_PROVIDER_USAGE_MESSAGE =
  'Freebuff ran out of provider usage and needs a refill. This is on us, not your account.'

/** Legacy older-server refusal, retained by SDK/CLI/Web recovery handlers.
 * Current servers no longer emit this spend cutoff. */
export const FREEBUFF_TURN_SPEND_LIMIT_ERROR_CODE = 'turn_spend_limit'

export const FREEBUFF_TURN_SPEND_LIMIT_MESSAGE =
  'This turn reached its model usage limit. Your session is still available — send a new message to continue from here.'

/**
 * DeepSeek's platform content filter: HTTP 400 `invalid_request_error`,
 * "Content Exists Risk (request_id: …)". Applied upstream of every V4.1 Flash
 * lane — Luminal returns the identical body — so no divert escapes it, and
 * because clients re-send the whole history, a conversation that trips it
 * keeps tripping it on DeepSeek.
 */
export const FREEBUFF_PROVIDER_CONTENT_FILTER_ERROR_PATTERN =
  /\bcontent exists risk\b/i

/** Says what to DO: the raw string reads like our bug, and the same request
 *  will be refused again, so the only way forward is a different model. */
export const FREEBUFF_PROVIDER_CONTENT_FILTER_MESSAGE =
  "DeepSeek's provider declined this request (content filter). Retrying on DeepSeek will be declined again, since the whole conversation is re-sent. Try again with another model, e.g. GLM 5.3 Flash or MiMo."

/**
 * OpenAI's cybersecurity safeguard: 403 "This content was flagged for possible
 * cybersecurity risk. If this seems wrong, try rephrasing your request. …
 * apply for Daybreak access …". Seen on GPT-6.1 Sol (2026-09-30). Applied to
 * the request's content, so the same conversation is refused again on retry.
 */
export const FREEBUFF_PROVIDER_CYBER_RISK_ERROR_PATTERN =
  /flagged for possible cybersecurity risk/i

/** Says what happened and what to DO. OpenAI's own text points at an
 *  organization-access form a Freebuff user cannot use, and after a fallback
 *  it used to surface as an unrelated "organization" 401 instead. */
export const FREEBUFF_PROVIDER_CYBER_RISK_MESSAGE =
  "OpenAI declined this request: it was flagged as a possible cybersecurity risk. The same conversation will be declined again, so rephrase the request (for example, say what you are securing and why), or continue with another model such as DeepSeek V4.1 Flash or GLM 5.3 Flash."

/**
 * OpenRouter's upstream-429 template, which every lane behind it reproduces
 * verbatim: "Provider returned error [<Upstream>: <model> is temporarily
 * rate-limited upstream. Please retry shortly, or add your own key to
 * accumulate your rate limits: https://openrouter.ai/settings/integrations]".
 *
 * Both clauses are matched because either one alone identifies the class, and
 * a gateway that re-words one still means the same thing: the upstream is
 * rate-limiting us, not this user.
 *
 * Measured in the 12.3 hours to 2026-10-14T14:51Z: 3,217 requests, 265
 * distinct users, 543 agent runs, on Gemini 4 Argon (Google AI Studio) and
 * MiMo (Xiaomi). **None of them had sent their own provider key**, so the
 * link's advice could not work for a single one of them.
 */
export const FREEBUFF_PROVIDER_UPSTREAM_RATE_LIMIT_ERROR_PATTERN =
  /\brate-limited upstream\b|\badd your own key to accumulate your rate limits\b/i

/**
 * Says whose problem it is and what to DO. The provider's own sentence points
 * at an account page on a gateway the user has no relationship with — the same
 * defect as {@link FREEBUFF_PROVIDER_CYBER_RISK_MESSAGE}'s Daybreak link — and
 * its only advice, "retry shortly", is what a user does for an hour while
 * every attempt is refused for the same reason.
 *
 * Names no model, so it is also correct for a presented (bait) request, where
 * the served model's id may never be shown.
 */
export const FREEBUFF_PROVIDER_UPSTREAM_RATE_LIMIT_MESSAGE =
  'The provider serving this model is rate-limiting requests right now — this is not a problem with your account. Wait a minute and send it again, or continue with another model such as GLM 5.3 Flash or DeepSeek V4.1 Flash.'

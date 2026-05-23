import type {
  PostHogAutocaptureElement,
  PostHogFlagsResponse,
  PostHogFeatureFlagsResponse,
  PostHogCoreOptions,
  PostHogEventProperties,
  PostHogCaptureOptions,
  JsonType,
  PostHogRemoteConfig,
  FeatureFlagValue,
  FeatureFlagResult,
  FeatureFlagResultOptions,
  PostHogV2FlagsResponse,
  PostHogV1FlagsResponse,
  PostHogFeatureFlagDetails,
  PostHogFlagsStorageFormat,
  FeatureFlagDetail,
  Survey,
  SurveyResponse,
  PostHogGroupProperties,
  BeforeSendFn,
  CaptureEvent,
} from './types'
import {
  createFlagsResponseFromFlagsAndPayloads,
  getEnabledFromValue,
  getFeatureFlagValue,
  getFlagValuesFromFlags,
  getPayloadsFromFlags,
  getVariantFromValue,
  normalizeFlagsResponse,
  parsePayload,
  updateFlagValue,
} from './featureFlagUtils'
import { Compression, FeatureFlagError, PostHogPersistedProperty } from './types'
import { maybeAdd, PostHogCoreStateless, QuotaLimitedFeature } from './posthog-core-stateless'
import { uuidv7 } from './vendor/uuidv7'
import { isEmptyObject, isNullish, isPlainError, getPersonPropertiesHash, isObject } from './utils'

// Stores the parameters for a pending feature flags reload request
interface FlagsAsyncOptions {
  sendAnonDistinctId?: boolean
  fetchConfig?: boolean
  triggerOnRemoteConfig?: boolean
}

interface PendingFlagsRequest extends FlagsAsyncOptions {
  resolve: (value: PostHogFeatureFlagsResponse | undefined) => void
  reject: (reason?: unknown) => void
}

export abstract class PostHogCore extends PostHogCoreStateless {
  // options
  private sendFeatureFlagEvent: boolean
  private flagCallReported: { [key: string]: boolean } = {}
  private _beforeSend?: BeforeSendFn | BeforeSendFn[]

  // internal
  protected _flagsResponsePromise?: Promise<PostHogFeatureFlagsResponse | undefined>
  protected _sessionExpirationTimeSeconds: number
  private _sessionMaxLengthSeconds: number = 24 * 60 * 60 // 24 hours
  protected sessionProps: PostHogEventProperties = {}

  // Track if an additional reload was requested while a request was in flight
  // This prevents dropping reload requests (e.g., from identify()) when preload is in progress
  private _pendingFlagsRequest?: PendingFlagsRequest

  // person profiles
  protected _personProfiles: 'always' | 'identified_only' | 'never'

  // cache for person properties to avoid duplicate $set events
  protected _cachedPersonProperties: string | null = null

  constructor(apiKey: string, options?: PostHogCoreOptions) {
    // Default for stateful mode is to not disable geoip. Only override if explicitly set
    const disableGeoipOption = options?.disableGeoip ?? false

    // Default for stateful mode is to timeout at 10s. Only override if explicitly set
    const featureFlagsRequestTimeoutMs = options?.featureFlagsRequestTimeoutMs ?? 10000 // 10 seconds

    super(apiKey, { ...options, disableGeoip: disableGeoipOption, featureFlagsRequestTimeoutMs })

    this.sendFeatureFlagEvent = options?.sendFeatureFlagEvent ?? true
    this._sessionExpirationTimeSeconds = options?.sessionExpirationTimeSeconds ?? 1800 // 30 minutes
    this._personProfiles = options?.personProfiles ?? 'identified_only'
    this._beforeSend = options?.before_send
  }

  protected setupBootstrap(options?: Partial<PostHogCoreOptions>): void {
    const bootstrap = options?.bootstrap
    if (!bootstrap) {
      return
    }

    // bootstrap options are only set if no persisted values are found
    // this is to prevent overwriting existing values
    if (bootstrap.distinctId) {
      if (bootstrap.isIdentifiedId) {
        const distinctId = this.getPersistedProperty(PostHogPersistedProperty.DistinctId)

        if (!distinctId) {
          this.setPersistedProperty(PostHogPersistedProperty.DistinctId, bootstrap.distinctId)
          // Mark the user as identified if bootstrapping with an identified ID
          this.setPersistedProperty(PostHogPersistedProperty.PersonMode, 'identified')
        }
      } else {
        const anonymousId = this.getPersistedProperty(PostHogPersistedProperty.AnonymousId)

        if (!anonymousId) {
          this.setPersistedProperty(PostHogPersistedProperty.AnonymousId, bootstrap.distinctId)
        }
      }
    }

    const bootstrapFeatureFlags = bootstrap.featureFlags
    const bootstrapFeatureFlagPayloads = bootstrap.featureFlagPayloads ?? {}
    if (bootstrapFeatureFlags && Object.keys(bootstrapFeatureFlags).length) {
      const normalizedBootstrapFeatureFlagDetails = createFlagsResponseFromFlagsAndPayloads(
        bootstrapFeatureFlags,
        bootstrapFeatureFlagPayloads
      )

      if (Object.keys(normalizedBootstrapFeatureFlagDetails.flags).length > 0) {
        this.setBootstrappedFeatureFlagDetails(normalizedBootstrapFeatureFlagDetails)

        const currentFeatureFlagDetails = this.getKnownFeatureFlagDetails() || { flags: {}, requestId: undefined }
        const newFeatureFlagDetails = {
          flags: {
            ...normalizedBootstrapFeatureFlagDetails.flags,
            ...currentFeatureFlagDetails.flags,
          },
          requestId: normalizedBootstrapFeatureFlagDetails.requestId,
        }

        this.setKnownFeatureFlagDetails(newFeatureFlagDetails)
      }
    }
  }

  private clearProps(): void {
    this.props = undefined
    this.sessionProps = {}
    this.flagCallReported = {}
  }

  on(event: string, cb: (...args: any[]) => void): () => void {
    return this._events.on(event, cb)
  }

  reset(propertiesToKeep?: PostHogPersistedProperty[]): void {
    this.wrap(() => {
      const allPropertiesToKeep = [PostHogPersistedProperty.Queue, ...(propertiesToKeep || [])]

      // clean up props
      this.clearProps()

      // clear cached person properties
      this._cachedPersonProperties = null

      for (const key of <(keyof typeof PostHogPersistedProperty)[]>Object.keys(PostHogPersistedProperty)) {
        if (!allPropertiesToKeep.includes(PostHogPersistedProperty[key])) {
          this.setPersistedProperty((PostHogPersistedProperty as any)[key], null)
        }
      }

      this.reloadFeatureFlags()
    })
  }

  protected getCommonEventProperties(): PostHogEventProperties {
    const featureFlags = this.getFeatureFlags()

    const featureVariantProperties: Record<string, FeatureFlagValue> = {}
    if (featureFlags) {
      for (const [feature, variant] of Object.entries(featureFlags)) {
        featureVariantProperties[`$feature/${feature}`] = variant
      }
    }
    return {
      ...maybeAdd('$active_feature_flags', featureFlags ? Object.keys(featureFlags) : undefined),
      ...featureVariantProperties,
      ...super.getCommonEventProperties(),
    }
  }

  private enrichProperties(properties?: PostHogEventProperties): PostHogEventProperties {
    return {
      ...this.props, // Persisted properties first
      ...this.sessionProps, // Followed by session properties
      ...(properties || {}), // Followed by user specified properties
      ...this.getCommonEventProperties(), // Followed by FF props
      $session_id: this.getSessionId(),
    }
  }

  /**
   * Returns the current session_id.
   *
   * @remarks
   * This should only be used for informative purposes.
   * Any actual internal use case for the session_id should be handled by the sessionManager.
   *
   * @public
   *
   * @returns The stored session ID for the current session. This may be an empty string if the client is not yet fully initialized.
   */
  getSessionId(): string {
    if (!this._isInitialized) {
      return ''
    }

    let sessionId = this.getPersistedProperty<string>(PostHogPersistedProperty.SessionId)
    const sessionLastTimestamp = this.getPersistedProperty<number>(PostHogPersistedProperty.SessionLastTimestamp) || 0
    const sessionStartTimestamp = this.getPersistedProperty<number>(PostHogPersistedProperty.SessionStartTimestamp) || 0
    const now = Date.now()
    const sessionLastDif = now - sessionLastTimestamp
    const sessionStartDif = now - sessionStartTimestamp
    if (
      !sessionId ||
      sessionLastDif > this._sessionExpirationTimeSeconds * 1000 ||
      sessionStartDif > this._sessionMaxLengthSeconds * 1000
    ) {
      sessionId = uuidv7()
      this.setPersistedProperty(PostHogPersistedProperty.SessionId, sessionId)
      this.setPersistedProperty(PostHogPersistedProperty.SessionStartTimestamp, now)
    }
    this.setPersistedProperty(PostHogPersistedProperty.SessionLastTimestamp, now)

    return sessionId
  }

  resetSessionId(): void {
    this.wrap(() => {
      this.setPersistedProperty(PostHogPersistedProperty.SessionId, null)
      this.setPersistedProperty(PostHogPersistedProperty.SessionLastTimestamp, null)
      this.setPersistedProperty(PostHogPersistedProperty.SessionStartTimestamp, null)
    })
  }

  /**
   * Returns the current anonymous ID.
   *
   * This is the ID assigned to users before they are identified. It's used to track
   * anonymous users and link them to identified users when they sign up.
   *
   * {@label Identification}
   *
   * @example
   * ```js
   * // get the anonymous ID
   * const anonId = posthog.getAnonymousId()
   * console.log('Anonymous ID:', anonId)
   * ```
   *
   * @public
   *
   * @returns {string} The stored anonymous ID. This may be an empty string if the client is not yet fully initialized.
   */
  getAnonymousId(): string {
    if (!this._isInitialized) {
      return ''
    }

    let anonId = this.getPersistedProperty<string>(PostHogPersistedProperty.AnonymousId)
    if (!anonId) {
      anonId = uuidv7()
      this.setPersistedProperty(PostHogPersistedProperty.AnonymousId, anonId)
    }
    return anonId
  }

  /**
   * * @returns {string} The stored distinct ID. This may be an empty string if the client is not yet fully initialized.
   */
  getDistinctId(): string {
    if (!this._isInitialized) {
      return ''
    }

    return this.getPersistedProperty<string>(PostHogPersistedProperty.DistinctId) || this.getAnonymousId()
  }

  registerForSession(properties: PostHogEventProperties): void {
    this.sessionProps = {
      ...this.sessionProps,
      ...properties,
    }
  }

  unregisterForSession(property: string): void {
    delete this.sessionProps[property]
  }

  /***
   *** TRACKING
   ***/

  identify(distinctId?: string, properties?: PostHogEventProperties, options?: PostHogCaptureOptions): void {
    this.wrap(() => {
      if (!this._requirePersonProcessing('posthog.identify')) {
        return
      }

      const previousDistinctId = this.getDistinctId()
      distinctId = distinctId || previousDistinctId

      if (properties?.$groups) {
        this.groups(properties.$groups as PostHogGroupProperties)
      }

      // promote $set and $set_once to top level
      const userPropsOnce = properties?.$set_once
      delete properties?.$set_once

      // if no $set is provided we assume all properties are $set
      const userProps = properties?.$set || properties

      const allProperties = this.enrichProperties({
        $anon_distinct_id: this.getAnonymousId(),
        ...maybeAdd('$set', userProps),
        ...maybeAdd('$set_once', userPropsOnce),
      })

      // Safely cast userProps and userPropsOnce to object types for hash and setPersonProperties
      const userPropsObj = isObject(userProps) ? (userProps as { [key: string]: JsonType }) : undefined
      const userPropsOnceObj = isObject(userPropsOnce) ? (userPropsOnce as { [key: string]: JsonType }) : undefined

      if (distinctId !== previousDistinctId) {
        // We keep the AnonymousId to be used by flags calls and identify to link the previousId
        this.setPersistedProperty(PostHogPersistedProperty.AnonymousId, previousDistinctId)
        this.setPersistedProperty(PostHogPersistedProperty.DistinctId, distinctId)
        // Mark the user as identified
        this.setPersistedProperty(PostHogPersistedProperty.PersonMode, 'identified')
        this.reloadFeatureFlags()

        super.identifyStateless(distinctId, allProperties, options)

        // Update the cached person properties hash
        this._cachedPersonProperties = getPersonPropertiesHash(distinctId, userPropsObj, userPropsOnceObj)
      } else if (userPropsObj || userPropsOnceObj) {
        // If the distinct_id is not changing, but we have user properties to set, we can check if they have changed
        // and if so, send a $set event
        this.setPersonProperties(userPropsObj, userPropsOnceObj)
      }
    })
  }

  capture(event: string, properties?: PostHogEventProperties, options?: PostHogCaptureOptions): void {
    if (event === '$exception' && !options?._originatedFromCaptureException) {
      this._logger.warn(
        "Using `posthog.capture('$exception')` is unreliable because it does not attach required metadata. Use `posthog.captureException(error)` instead, which attaches required metadata automatically."
      )
    }

    this.wrap(() => {
      const distinctId = this.getDistinctId()

      if (properties?.$groups) {
        this.groups(properties.$groups as PostHogGroupProperties)
      }

      const allProperties = this.enrichProperties(properties)

      // Add $process_person_profile flag to event properties
      const hasPersonProcessing = this._hasPersonProcessing()
      allProperties['$process_person_profile'] = hasPersonProcessing
      allProperties['$is_identified'] = this._isIdentified()

      // If the event has person processing, ensure that all future events will too
      if (hasPersonProcessing) {
        this._requirePersonProcessing('capture')
      }

      super.captureStateless(distinctId, event, allProperties, options)
    })
  }

  alias(alias: string): void {
    this.wrap(() => {
      if (!this._requirePersonProcessing('posthog.alias')) {
        return
      }

      const distinctId = this.getDistinctId()
      const allProperties = this.enrichProperties({})

      super.aliasStateless(alias, distinctId, allProperties)
    })
  }

  autocapture(
    eventType: string,
    elements: PostHogAutocaptureElement[],
    properties: PostHogEventProperties = {},
    options?: PostHogCaptureOptions
  ): void {
    this.wrap(() => {
      const distinctId = this.getDistinctId()
      const payload = {
        distinct_id: distinctId,
        event: '$autocapture',
        properties: {
          ...this.enrichProperties(properties),
          $event_type: eventType,
          $elements: elements,
        },
      }

      this.enqueue('autocapture', payload, options)
    })
  }

  /***
   *** GROUPS
   ***/

  groups(groups: PostHogGroupProperties): void {
    this.wrap(() => {
      if (!this._requirePersonProcessing('posthog.group')) {
        return
      }

      // Get persisted groups
      const existingGroups = this.props.$groups || {}

      this.register({
        $groups: {
          ...(existingGroups as PostHogGroupProperties),
          ...groups,
        },
      })

      if (Object.keys(groups).find((type) => existingGroups[type as keyof typeof existingGroups] !== groups[type])) {
        this.reloadFeatureFlags()
      }
    })
  }

  group(
    groupType: string,
    groupKey: string | number,
    groupProperties?: PostHogEventProperties,
    options?: PostHogCaptureOptions
  ): void {
    this.wrap(() => {
      this.groups({
        [groupType]: groupKey,
      })

      if (groupProperties) {
        this.groupIdentify(groupType, groupKey, groupProperties, options)
      }
    })
  }

  groupIdentify(
    groupType: string,
    groupKey: string | number,
    groupProperties?: PostHogEventProperties,
    options?: PostHogCaptureOptions
  ): void {
    this.wrap(() => {
      if (!this._requirePersonProcessing('posthog.groupIdentify')) {
        return
      }

      const distinctId = this.getDistinctId()
      const eventProperties = this.enrichProperties({})
      super.groupIdentifyStateless(groupType, groupKey, groupProperties, options, distinctId, eventProperties)
    })
  }

  /***
   * PROPERTIES
   ***/
  setPersonPropertiesForFlags(properties: { [type: string]: JsonType }, reloadFeatureFlags = true): void {
    this.wrap(() => {
      // Get persisted person properties
      const existingProperties =
        this.getPersistedProperty<Record<string, JsonType>>(PostHogPersistedProperty.PersonProperties) || {}

      this.setPersistedProperty<PostHogEventProperties>(PostHogPersistedProperty.PersonProperties, {
        ...existingProperties,
        ...properties,
      })

      if (reloadFeatureFlags) {
        this.reloadFeatureFlags()
      }
    })
  }

  resetPersonPropertiesForFlags(): void {
    this.wrap(() => {
      this.setPersistedProperty<PostHogEventProperties>(PostHogPersistedProperty.PersonProperties, null)
    })
  }

  setGroupPropertiesForFlags(properties: { [type: string]: Record<string, string> }): void {
    this.wrap(() => {
      // Get persisted group properties
      const existingProperties =
        this.getPersistedProperty<Record<string, Record<string, string>>>(PostHogPersistedProperty.GroupProperties) ||
        {}

      if (Object.keys(existingProperties).length !== 0) {
        Object.keys(existingProperties).forEach((groupType) => {
          existingProperties[groupType] = {
            ...existingProperties[groupType],
            ...properties[groupType],
          }
          delete properties[groupType]
        })
      }

      this.setPersistedProperty<PostHogEventProperties>(PostHogPersistedProperty.GroupProperties, {
        ...existingProperties,
        ...properties,
      })
    })
  }

  resetGroupPropertiesForFlags(): void {
    this.wrap(() => {
      this.setPersistedProperty<PostHogEventProperties>(PostHogPersistedProperty.GroupProperties, null)
    })
  }

  private async remoteConfigAsync(): Promise<PostHogRemoteConfig | undefined> {
    await this._initPromise
    if (this._remoteConfigResponsePromise) {
      return this._remoteConfigResponsePromise
    }
    return this._remoteConfigAsync()
  }

  /***
   *** FEATURE FLAGS
   ***/
  protected async flagsAsync(options?: FlagsAsyncOptions): Promise<PostHogFeatureFlagsResponse | undefined> {
    const { sendAnonDistinctId = true, fetchConfig = false, triggerOnRemoteConfig = false } = options ?? {}
    await this._initPromise
    if (this._flagsResponsePromise) {
      // Queue the reload request instead of dropping it
      // This ensures that requests with $anon_distinct_id (from identify()) are not lost
      this._logger.info('Feature flags are being loaded already, queuing reload.')
      // Resolve any existing pending promise with the in-flight request's result to avoid hanging promises
      if (this._pendingFlagsRequest) {
        this._flagsResponsePromise.then(this._pendingFlagsRequest.resolve).catch(this._pendingFlagsRequest.reject)
      }
      // Return a promise that resolves when the pending request completes
      return new Promise((resolve, reject) => {
        this._pendingFlagsRequest = { sendAnonDistinctId, fetchConfig, triggerOnRemoteConfig, resolve, reject }
      })
    }
    return this._flagsAsync({ sendAnonDistinctId, fetchConfig, triggerOnRemoteConfig })
  }

  /**
   * Called when remote config has been loaded (from either the remote config endpoint or the flags endpoint).
   * Override in subclasses to react to remote config changes (e.g., gating error tracking, session replay features).
   *
   * The full response is passed so consumers can read whatever fields they need.
   * This is called exactly once per remote config load cycle.
   *
   * @param _response The remote config or flags response containing config fields
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onRemoteConfig(_response: PostHogRemoteConfig): void {
    // Override in subclasses
  }

  /**
   * Conditionally triggers onRemoteConfig if requested.
   * Only _remoteConfigAsync passes triggerOnRemoteConfig=true to apply remote config values
   * (errorTracking, capturePerformance, etc.) on initial load.
   * User-triggered reloadFeatureFlags/reloadFeatureFlagsAsync don't set this,
   * so they won't re-trigger onRemoteConfig or reinstall/uninstall integrations.
   */
  private maybeNotifyRemoteConfig(shouldTrigger: boolean, response: PostHogRemoteConfig): void {
    if (shouldTrigger) {
      try {
        this.onRemoteConfig(response)
      } catch (e) {
        this._logger.error('Error in onRemoteConfig callback:', e)
      }
    }
  }

  private cacheSessionReplay(source: string, response?: PostHogRemoteConfig): void {
    const sessionReplay = response?.sessionRecording
    if (sessionReplay) {
      this.setPersistedProperty(PostHogPersistedProperty.SessionReplay, sessionReplay)
      this._logger.info(`Session replay config from ${source}: `, JSON.stringify(sessionReplay))
    } else if (typeof sessionReplay === 'boolean' && sessionReplay === false) {
      // if session replay is disabled, we don't need to cache it
      // we need to check for this because the response might be undefined (/flags does not return sessionRecording yet)
      this._logger.info(`Session replay config from ${source} disabled.`)
      this.setPersistedProperty(PostHogPersistedProperty.SessionReplay, null)
    }
  }

  private async _remoteConfigAsync(): Promise<PostHogRemoteConfig | undefined> {
    this._remoteConfigResponsePromise = this._initPromise
      .then(() => {
        let remoteConfig = this.getPersistedProperty<Omit<PostHogRemoteConfig, 'surveys'>>(
          PostHogPersistedProperty.RemoteConfig
        )

        this._logger.info('Cached remote config: ', JSON.stringify(remoteConfig))

        return super.getRemoteConfig().then((response) => {
          if (response) {
            const remoteConfigWithoutSurveys = { ...response }
            delete remoteConfigWithoutSurveys.surveys

            this._logger.info('Fetched remote config: ', JSON.stringify(remoteConfigWithoutSurveys))

            if (this.disableSurveys === false) {
              const surveys = response.surveys

              let hasSurveys = true

              if (!Array.isArray(surveys)) {
                // If surveys is not an array, it means there are no surveys (its a boolean instead)
                this._logger.info('There are no surveys.')
                hasSurveys = false
              } else {
                this._logger.info('Surveys fetched from remote config: ', JSON.stringify(surveys))
              }

              if (hasSurveys) {
                this.setPersistedProperty<SurveyResponse['surveys']>(
                  PostHogPersistedProperty.Surveys,
                  surveys as Survey[]
                )
              } else {
                this.setPersistedProperty<SurveyResponse['surveys']>(PostHogPersistedProperty.Surveys, null)
              }
            } else {
              this.setPersistedProperty<SurveyResponse['surveys']>(PostHogPersistedProperty.Surveys, null)
            }
            // we cache the surveys in its own storage key
            this.setPersistedProperty<Omit<PostHogRemoteConfig, 'surveys'>>(
              PostHogPersistedProperty.RemoteConfig,
              remoteConfigWithoutSurveys
            )

            this.cacheSessionReplay('remote config', response)

            // we only dont load flags if the remote config has no feature flags
            let willLoadFlags = false
            if (response.hasFeatureFlags === false) {
              // resetting flags to empty object
              this.setKnownFeatureFlagDetails({ flags: {} })

              this._logger.warn('Remote config has no feature flags, will not load feature flags.')
            } else if (this.preloadFeatureFlags !== false) {
              willLoadFlags = true
              this.flagsAsync({ sendAnonDistinctId: true, fetchConfig: true, triggerOnRemoteConfig: true })
            }

            if (!response.supportedCompression?.includes(Compression.GZipJS)) {
              this.disableCompression = true
            }

            // Notify onRemoteConfig only if flags won't be loaded.
            // When flags will be loaded, _flagsAsync will call onRemoteConfig instead
            // (via triggerOnRemoteConfig=true), ensuring it fires exactly once.
            this.maybeNotifyRemoteConfig(!willLoadFlags, response)

            remoteConfig = response
          }

          return remoteConfig
        })
      })
      .finally(() => {
        this._remoteConfigResponsePromise = undefined
      })
    return this._remoteConfigResponsePromise
  }

  private async _flagsAsync(options?: FlagsAsyncOptions): Promise<PostHogFeatureFlagsResponse | undefined> {
    const sendAnonDistinctId = options?.sendAnonDistinctId ?? true
    const fetchConfig = options?.fetchConfig ?? false
    const triggerOnRemoteConfig = options?.triggerOnRemoteConfig ?? false
    this._flagsResponsePromise = this._initPromise
      .then(async () => {
        const distinctId = this.getDistinctId()
        const groups = this.props.$groups || {}
        const personProperties =
          this.getPersistedProperty<Record<string, string>>(PostHogPersistedProperty.PersonProperties) || {}
        const groupProperties =
          this.getPersistedProperty<Record<string, Record<string, string>>>(PostHogPersistedProperty.GroupProperties) ||
          {}

        const extraProperties = {
          $anon_distinct_id: sendAnonDistinctId ? this.getAnonymousId() : undefined,
        }

        const result = await super.getFlags(
          distinctId,
          groups as PostHogGroupProperties,
          personProperties,
          groupProperties,
          extraProperties,
          fetchConfig
        )

        if (!result.success) {
          this.setKnownFeatureFlagDetails({
            flags: this.getKnownFeatureFlagDetails()?.flags ?? {},
            requestError: result.error,
          })
          return undefined
        }

        const res = result.response

        if (res?.quotaLimited?.includes(QuotaLimitedFeature.FeatureFlags)) {
          this.setKnownFeatureFlagDetails({
            flags: this.getKnownFeatureFlagDetails()?.flags ?? {},
            quotaLimited: res.quotaLimited,
          })
          this._logger.warn(
            '[FEATURE FLAGS] Feature flags quota limit exceeded. Learn more about billing limits at https://posthog.com/docs/billing/limits-alerts'
          )
          this.maybeNotifyRemoteConfig(triggerOnRemoteConfig, res)
          return res
        }
        if (res?.featureFlags) {
          // clear flag call reported if we have new flags since they might have changed
          if (this.sendFeatureFlagEvent) {
            this.flagCallReported = {}
          }

          let newFeatureFlagDetails = res
          if (res.errorsWhileComputingFlags) {
            // if not all flags were computed, we upsert flags instead of replacing them
            const currentFlagDetails = this.getKnownFeatureFlagDetails()
            this._logger.info('Cached feature flags: ', JSON.stringify(currentFlagDetails))

            const filteredFlags: Record<string, FeatureFlagDetail> = {}
            for (const key in res.flags) {
              if (!res.flags[key].failed) {
                filteredFlags[key] = res.flags[key]
              }
            }

            newFeatureFlagDetails = {
              ...res,
              flags: { ...currentFlagDetails?.flags, ...filteredFlags },
            }
          }
          this.setKnownFeatureFlagDetails({
            flags: newFeatureFlagDetails.flags,
            requestId: res.requestId,
            evaluatedAt: res.evaluatedAt,
            errorsWhileComputingFlags: res.errorsWhileComputingFlags,
            quotaLimited: res.quotaLimited,
          })
          // Mark that we hit the /flags endpoint so we can capture this in the $feature_flag_called event
          this.setPersistedProperty(PostHogPersistedProperty.FlagsEndpointWasHit, true)
          this.cacheSessionReplay('flags', res)

          this.maybeNotifyRemoteConfig(triggerOnRemoteConfig, res)
        }
        return res
      })
      .finally(() => {
        this._flagsResponsePromise = undefined

        // Check if there's a pending reload request and execute it
        const pendingRequest = this._pendingFlagsRequest
        if (pendingRequest) {
          this._pendingFlagsRequest = undefined
          this._logger.info('Executing pending feature flags reload.')
          // Execute the pending request and resolve its promise with the result
          this.flagsAsync({
            sendAnonDistinctId: pendingRequest.sendAnonDistinctId,
            fetchConfig: pendingRequest.fetchConfig,
            triggerOnRemoteConfig: pendingRequest.triggerOnRemoteConfig,
          })
            .then(pendingRequest.resolve)
            .catch(pendingRequest.reject)
        }
      })
    return this._flagsResponsePromise
  }

  private setKnownFeatureFlagDetails(flagsResponse: PostHogFlagsStorageFormat | null): void {
    this.wrap(() => {
      this.setPersistedProperty<PostHogFlagsStorageFormat>(PostHogPersistedProperty.FeatureFlagDetails, flagsResponse)

      this._events.emit('featureflags', getFlagValuesFromFlags(flagsResponse?.flags ?? {}))
    })
  }

  private getKnownFeatureFlagDetails(): PostHogFeatureFlagDetails | undefined {
    const storedDetails = this.getPersistedProperty<PostHogFlagsStorageFormat>(
      PostHogPersistedProperty.FeatureFlagDetails
    )
    if (!storedDetails) {
      // Rebuild from the stored feature flags and feature flag payloads
      const featureFlags = this.getPersistedProperty<PostHogFlagsResponse['featureFlags']>(
        PostHogPersistedProperty.FeatureFlags
      )
      const featureFlagPayloads = this.getPersistedProperty<PostHogFlagsResponse['featureFlagPayloads']>(
        PostHogPersistedProperty.FeatureFlagPayloads
      )

      if (featureFlags === undefined && featureFlagPayloads === undefined) {
        return undefined
      }

      return createFlagsResponseFromFlagsAndPayloads(featureFlags ?? {}, featureFlagPayloads ?? {})
    }

    return normalizeFlagsResponse(
      storedDetails as PostHogV1FlagsResponse | PostHogV2FlagsResponse
    ) as PostHogFeatureFlagDetails
  }

  private getStoredFlagDetails(): PostHogFlagsStorageFormat | undefined {
    return this.getPersistedProperty<PostHogFlagsStorageFormat>(PostHogPersistedProperty.FeatureFlagDetails)
  }

  protected getKnownFeatureFlags(): PostHogFlagsResponse['featureFlags'] | undefined {
    const featureFlagDetails = this.getKnownFeatureFlagDetails()
    if (!featureFlagDetails) {
      return undefined
    }
    return getFlagValuesFromFlags(featureFlagDetails.flags)
  }

  private getBootstrappedFeatureFlagDetails(): PostHogFeatureFlagDetails | undefined {
    const details = this.getPersistedProperty<PostHogFeatureFlagDetails>(
      PostHogPersistedProperty.BootstrapFeatureFlagDetails
    )
    if (!details) {
      return undefined
    }
    return details
  }

  private setBootstrappedFeatureFlagDetails(details: PostHogFeatureFlagDetails): void {
    this.setPersistedProperty<PostHogFeatureFlagDetails>(PostHogPersistedProperty.BootstrapFeatureFlagDetails, details)
  }

  private getBootstrappedFeatureFlags(): PostHogFlagsResponse['featureFlags'] | undefined {
    const details = this.getBootstrappedFeatureFlagDetails()
    if (!details) {
      return undefined
    }
    return getFlagValuesFromFlags(details.flags)
  }

  private getBootstrappedFeatureFlagPayloads(): PostHogFlagsResponse['featureFlagPayloads'] | undefined {
    const details = this.getBootstrappedFeatureFlagDetails()
    if (!details) {
      return undefined
    }
    return getPayloadsFromFlags(details.flags)
  }

  getFeatureFlagResult(key: string, options?: FeatureFlagResultOptions): FeatureFlagResult | undefined {
    return this._getFeatureFlagResult(key, options)
  }

  protected _getFeatureFlagResult(
    key: string,
    options: {
      /** Whether to send an event that the flag was evaluated. This defaults to true,
       * but will respect the instance-level sendFeatureFlagEvent setting.
       */
      sendEvent?: boolean
      /**
       * Preserves the legacy missing-flag behavior of the named function.
       * Each value matches how that function handled missing flags before getFeatureFlagResult existed:
       * - 'getFeatureFlag': returns a default only when non-empty flags are cached
       * - 'getFeatureFlagPayload': returns a default whenever any flags response was stored (even if empty, e.g. error/quota)
       * Without this, missing flags simply return undefined (this is usually what you want).
       */
      missingFlagBehavior?: 'getFeatureFlag' | 'getFeatureFlagPayload'
    } = {}
  ): FeatureFlagResult | undefined {
    const storedDetails = this.getStoredFlagDetails()
    const details = this.getFeatureFlagDetails()
    const isQuotaLimited = storedDetails?.quotaLimited?.includes(QuotaLimitedFeature.FeatureFlags)
    const featureFlag = details?.flags[key]
    const sendEvent = (options.sendEvent ?? this.sendFeatureFlagEvent) && !this.flagCallReported[key]
    const flagValue: FeatureFlagValue | undefined = getFeatureFlagValue(featureFlag)

    if (sendEvent) {
      const errors: string[] = []
      if (storedDetails?.requestError) {
        const { type, statusCode } = storedDetails.requestError
        if (type === 'timeout') {
          errors.push(FeatureFlagError.TIMEOUT)
        } else if (type === 'api_error' && statusCode !== undefined) {
          errors.push(FeatureFlagError.apiError(statusCode))
        } else if (type === 'connection_error') {
          errors.push(FeatureFlagError.CONNECTION_ERROR)
        } else {
          errors.push(FeatureFlagError.UNKNOWN_ERROR)
        }
      } else if (storedDetails) {
        if (storedDetails.errorsWhileComputingFlags) {
          errors.push(FeatureFlagError.ERRORS_WHILE_COMPUTING)
        }
        if (isQuotaLimited) {
          errors.push(FeatureFlagError.QUOTA_LIMITED)
        } else if (flagValue === undefined && !featureFlag) {
          // Track missing flags only when we had a successful, non-limited request.
          // When quota limited or request failed, we cannot determine if the flag is truly missing.
          errors.push(FeatureFlagError.FLAG_MISSING)
        }
      }

      const bootstrappedResponse = this.getBootstrappedFeatureFlags()?.[key]
      const bootstrappedPayload = this.getBootstrappedFeatureFlagPayloads()?.[key]
      const featureFlagError = errors.length > 0 ? errors.join(',') : undefined

      this.flagCallReported[key] = true

      const properties: Record<string, any> = {
        $feature_flag: key,
        $feature_flag_response: flagValue,
        ...maybeAdd('$feature_flag_id', featureFlag?.metadata?.id),
        ...maybeAdd('$feature_flag_version', featureFlag?.metadata?.version),
        ...maybeAdd('$feature_flag_reason', featureFlag?.reason?.description ?? featureFlag?.reason?.code),
        ...maybeAdd('$feature_flag_bootstrapped_response', bootstrappedResponse),
        ...maybeAdd('$feature_flag_bootstrapped_payload', bootstrappedPayload),
        // If we haven't yet received a response from the /flags endpoint, we must have used the bootstrapped value
        $used_bootstrap_value: !this.getPersistedProperty(PostHogPersistedProperty.FlagsEndpointWasHit),
        ...maybeAdd('$feature_flag_request_id', details?.requestId),
        ...maybeAdd('$feature_flag_evaluated_at', details?.evaluatedAt),
        ...maybeAdd('$feature_flag_error', featureFlagError),
      }

      this.capture('$feature_flag_called', properties)
    }

    if (flagValue === undefined) {
      // TRICKY: getFeatureFlagPayload and getFeatureFlag had different criteria for
      //         "missing flag" vs "flags not loaded" return values before
      //         _getFeatureFlagResult existed. Preserved for backward compatibility.
      switch (options.missingFlagBehavior) {
        case 'getFeatureFlagPayload':
          return details ? { key, enabled: false, payload: null } : undefined
        case 'getFeatureFlag':
          return details && Object.keys(details.flags).length ? { key, enabled: false, payload: null } : undefined
        case undefined:
          return undefined
      }
    }

    const rawPayload = featureFlag?.metadata?.payload
    const payload = rawPayload !== undefined ? parsePayload(rawPayload) : null
    return {
      key,
      enabled: getEnabledFromValue(flagValue),
      variant: getVariantFromValue(flagValue),
      payload,
    }
  }

  getFeatureFlag(key: string): FeatureFlagValue | undefined {
    const result = this._getFeatureFlagResult(key, { missingFlagBehavior: 'getFeatureFlag' })
    return result?.variant ?? result?.enabled
  }

  getFeatureFlagPayload(key: string): JsonType | undefined {
    const result = this._getFeatureFlagResult(key, { missingFlagBehavior: 'getFeatureFlagPayload', sendEvent: false })
    return result?.payload
  }

  getFeatureFlagPayloads(): PostHogFlagsResponse['featureFlagPayloads'] | undefined {
    return this.getFeatureFlagDetails()?.featureFlagPayloads
  }

  getFeatureFlags(): PostHogFlagsResponse['featureFlags'] | undefined {
    // NOTE: We don't check for _initPromise here as the function is designed to be
    // callable before the state being loaded anyways
    return this.getFeatureFlagDetails()?.featureFlags
  }

  getFeatureFlagDetails(): PostHogFeatureFlagDetails | undefined {
    // NOTE: We don't check for _initPromise here as the function is designed to be
    // callable before the state being loaded anyways
    let details = this.getKnownFeatureFlagDetails()
    const overriddenFlags = this.getPersistedProperty<PostHogFlagsResponse['featureFlags']>(
      PostHogPersistedProperty.OverrideFeatureFlags
    )

    if (!overriddenFlags) {
      return details
    }

    details = details ?? { featureFlags: {}, featureFlagPayloads: {}, flags: {} }

    const flags: Record<string, FeatureFlagDetail> = details.flags ?? {}

    for (const key in overriddenFlags) {
      if (!overriddenFlags[key]) {
        delete flags[key]
      } else {
        flags[key] = updateFlagValue(flags[key], overriddenFlags[key])
      }
    }

    const result = {
      ...details,
      flags,
    }

    return normalizeFlagsResponse(result) as PostHogFeatureFlagDetails
  }

  getFeatureFlagsAndPayloads(): {
    flags: PostHogFlagsResponse['featureFlags'] | undefined
    payloads: PostHogFlagsResponse['featureFlagPayloads'] | undefined
  } {
    const flags = this.getFeatureFlags()
    const payloads = this.getFeatureFlagPayloads()

    return {
      flags,
      payloads,
    }
  }

  isFeatureEnabled(key: string): boolean | undefined {
    const response = this.getFeatureFlag(key)
    if (response === undefined) {
      return undefined
    }
    return !!response
  }

  // Used when we want to trigger the reload but we don't care about the result
  reloadFeatureFlags(options?: { cb?: (err?: Error, flags?: PostHogFlagsResponse['featureFlags']) => void }): void {
    this.flagsAsync({ sendAnonDistinctId: true })
      .then((res) => {
        options?.cb?.(undefined, res?.featureFlags)
      })
      .catch((e) => {
        options?.cb?.(e, undefined)
        if (!options?.cb) {
          this._logger.info('Error reloading feature flags', e)
        }
      })
  }

  async reloadRemoteConfigAsync(): Promise<PostHogRemoteConfig | undefined> {
    return await this.remoteConfigAsync()
  }

  async reloadFeatureFlagsAsync(
    sendAnonDistinctId?: boolean
  ): Promise<PostHogFlagsResponse['featureFlags'] | undefined> {
    return (await this.flagsAsync({ sendAnonDistinctId: sendAnonDistinctId }))?.featureFlags
  }

  onFeatureFlags(cb: (flags: PostHogFlagsResponse['featureFlags']) => void): () => void {
    return this.on('featureflags', async () => {
      const flags = this.getFeatureFlags()
      if (flags) {
        cb(flags)
      }
    })
  }

  onFeatureFlag(key: string, cb: (value: FeatureFlagValue) => void): () => void {
    return this.on('featureflags', async () => {
      const flagResponse = this.getFeatureFlag(key)
      if (flagResponse !== undefined) {
        cb(flagResponse)
      }
    })
  }

  async overrideFeatureFlag(flags: PostHogFlagsResponse['featureFlags'] | null): Promise<void> {
    this.wrap(() => {
      if (flags === null) {
        return this.setPersistedProperty(PostHogPersistedProperty.OverrideFeatureFlags, null)
      }
      return this.setPersistedProperty(PostHogPersistedProperty.OverrideFeatureFlags, flags)
    })
  }

  /**
   * Capture a caught exception manually
   *
   * {@label Error tracking}
   *
   * @public
   *
   * @example
   * ```js
   * // Capture a caught exception
   * try {
   *   // something that might throw
   * } catch (error) {
   *   posthog.captureException(error)
   * }
   * ```
   *
   * @example
   * ```js
   * // With additional properties
   * posthog.captureException(error, {
   *   customProperty: 'value',
   *   anotherProperty: ['I', 'can be a list'],
   *   ...
   * })
   * ```
   *
   * @param {Error} error The error to capture
   * @param {Object} [additionalProperties] Any additional properties to add to the error event
   * @returns {CaptureResult} The result of the capture
   */
  captureException(error: unknown, additionalProperties?: PostHogEventProperties): void {
    const properties: { [key: string]: any } = {
      $exception_level: 'error',
      $exception_list: [
        {
          type: isPlainError(error) ? error.name : 'Error',
          value: isPlainError(error) ? error.message : error,
          mechanism: {
            handled: true,
            synthetic: false,
          },
        },
      ],
      ...additionalProperties,
    }

    this.capture('$exception', properties, { _originatedFromCaptureException: true })
  }

  /**
   * Capture written user feedback for a LLM trace. Numeric values are converted to strings.
   *
   * {@label LLM analytics}
   *
   * @public
   *
   * @param traceId The trace ID to capture feedback for.
   * @param userFeedback The feedback to capture.
   */
  captureTraceFeedback(traceId: string | number, userFeedback: string): void {
    this.capture('$ai_feedback', {
      $ai_feedback_text: userFeedback,
      $ai_trace_id: String(traceId),
    })
  }

  /**
   * Capture a metric for a LLM trace. Numeric values are converted to strings.
   *
   * {@label LLM analytics}
   *
   * @public
   *
   * @param traceId The trace ID to capture the metric for.
   * @param metricName The name of the metric to capture.
   * @param metricValue The value of the metric to capture.
   */
  captureTraceMetric(traceId: string | number, metricName: string, metricValue: string | number | boolean): void {
    this.capture('$ai_metric', {
      $ai_metric_name: metricName,
      $ai_metric_value: String(metricValue),
      $ai_trace_id: String(traceId),
    })
  }

  /***
   *** PERSON PROFILES
   ***/

  /**
   * Returns whether the current user is identified (has a person profile).
   *
   * This checks:
   * 1. If PersonMode is explicitly set to 'identified'
   * 2. For backwards compatibility: if DistinctId differs from AnonymousId
   *    (meaning the user was identified before the SDK was upgraded)
   *
   * @internal
   */
  protected _isIdentified(): boolean {
    const personMode = this.getPersistedProperty<string>(PostHogPersistedProperty.PersonMode)

    // If PersonMode is explicitly set, use that
    if (personMode === 'identified') {
      return true
    }

    // For backwards compatibility: if PersonMode is not set but DistinctId differs from AnonymousId,
    // the user was identified before this SDK version was installed
    if (personMode === undefined) {
      const distinctId = this.getPersistedProperty<string>(PostHogPersistedProperty.DistinctId)
      const anonymousId = this.getPersistedProperty<string>(PostHogPersistedProperty.AnonymousId)

      // If both exist and are different, the user was previously identified
      if (distinctId && anonymousId && distinctId !== anonymousId) {
        return true
      }
    }

    return false
  }

  /**
   * Returns the current groups object from super properties.
   * @internal
   */
  protected _getGroups(): PostHogGroupProperties {
    return (this.props.$groups || {}) as PostHogGroupProperties
  }

  /**
   * Determines whether the current user should have person processing enabled.
   *
   * Returns true if:
   * - person_profiles is set to 'always', OR
   * - person_profiles is 'identified_only' AND (user is identified OR has groups OR person processing was explicitly enabled)
   *
   * Returns false if:
   * - person_profiles is 'never', OR
   * - person_profiles is 'identified_only' AND user is not identified AND has no groups AND person processing was not enabled
   *
   * @internal
   */
  protected _hasPersonProcessing(): boolean {
    if (this._personProfiles === 'always') {
      return true
    }

    if (this._personProfiles === 'never') {
      return false
    }

    // person_profiles === 'identified_only'
    // Check if user is identified, has groups, or person processing was explicitly enabled
    const isIdentified = this._isIdentified()
    const hasGroups = Object.keys(this._getGroups()).length > 0
    const personProcessingEnabled =
      this.getPersistedProperty<boolean>(PostHogPersistedProperty.EnablePersonProcessing) === true

    return isIdentified || hasGroups || personProcessingEnabled
  }

  /**
   * Enables person processing if the config allows it.
   *
   * If person_profiles is 'never', this logs an error and returns false.
   * Otherwise, it enables person processing and returns true.
   *
   * @param functionName - The name of the function calling this method (for error messages)
   * @returns true if person processing is enabled, false if it's blocked by config
   * @internal
   */
  protected _requirePersonProcessing(functionName: string): boolean {
    if (this._personProfiles === 'never') {
      this._logger.error(`${functionName} was called, but personProfiles is set to "never". This call will be ignored.`)
      return false
    }

    // Mark that person processing has been explicitly enabled
    this.setPersistedProperty(PostHogPersistedProperty.EnablePersonProcessing, true)
    return true
  }

  /**
   * Creates a person profile for the current user, if they don't already have one.
   *
   * If personProfiles is 'identified_only' and no profile exists, this will create one.
   * If personProfiles is 'never', this will log an error and do nothing.
   * If personProfiles is 'always' or a profile already exists, this is a no-op.
   *
   * @public
   */
  createPersonProfile(): void {
    if (this._hasPersonProcessing()) {
      // Person profile already exists, no need to do anything
      return
    }
    if (!this._requirePersonProcessing('posthog.createPersonProfile')) {
      return
    }
    // Capture a $set event to create the person profile
    // We don't set any properties here, but the server will create the profile
    this.capture('$set', { $set: {}, $set_once: {} })
  }

  /**
   * Sets properties on the person profile associated with the current `distinct_id`.
   * Learn more about [identifying users](https://posthog.com/docs/product-analytics/identify)
   *
   * {@label Identification}
   *
   * @remarks
   * Updates user properties that are stored with the person profile in PostHog.
   * If `personProfiles` is set to `identified_only` and no profile exists, this will create one.
   *
   * @example
   * ```js
   * // set user properties
   * posthog.setPersonProperties({
   *     email: 'user@example.com',
   *     plan: 'premium'
   * })
   * ```
   *
   * @example
   * ```js
   * // set properties with $set_once
   * posthog.setPersonProperties(
   *     { name: 'Max Hedgehog' },  // $set properties
   *     { initial_url: '/blog' }   // $set_once properties
   * )
   * ```
   *
   * @public
   *
   * @param userPropertiesToSet - Optional: An object of properties to store about the user.
   *   These properties will overwrite any existing values for the same keys.
   * @param userPropertiesToSetOnce - Optional: An object of properties to store about the user.
   *   If a property is previously set, this does not override that value.
   * @param reloadFeatureFlags - Whether to reload feature flags after setting the properties. Defaults to true.
   */
  setPersonProperties(
    userPropertiesToSet?: { [key: string]: JsonType },
    userPropertiesToSetOnce?: { [key: string]: JsonType },
    reloadFeatureFlags = true
  ): void {
    this.wrap(() => {
      const isSetEmpty = isNullish(userPropertiesToSet) || isEmptyObject(userPropertiesToSet)
      const isSetOnceEmpty = isNullish(userPropertiesToSetOnce) || isEmptyObject(userPropertiesToSetOnce)
      if (isSetEmpty && isSetOnceEmpty) {
        return
      }

      if (!this._requirePersonProcessing('posthog.setPersonProperties')) {
        return
      }

      const hash = getPersonPropertiesHash(this.getDistinctId(), userPropertiesToSet, userPropertiesToSetOnce)

      // If exactly this $set call has been sent before, don't send it again - determine based on hash of properties
      if (this._cachedPersonProperties === hash) {
        this._logger.info(
          'A duplicate setPersonProperties call was made with the same properties. It has been ignored.'
        )
        return
      }

      // Update person properties for feature flags evaluation
      // Merge setOnce first, then set to allow overwriting
      const mergedProperties = { ...(userPropertiesToSetOnce || {}), ...(userPropertiesToSet || {}) }
      this.setPersonPropertiesForFlags(mergedProperties, reloadFeatureFlags)

      this.capture('$set', { $set: userPropertiesToSet || {}, $set_once: userPropertiesToSetOnce || {} })

      this._cachedPersonProperties = hash
    })
  }

  /**
   * Override processBeforeEnqueue to run before_send hooks.
   * This runs after prepareMessage, giving users full control over the final event.
   *
   * The internal message contains many fields (event, distinct_id, properties, type, library,
   * library_version, timestamp, uuid). CaptureEvent exposes a subset matching the web SDK's
   * CaptureResult: uuid, event, properties, $set, $set_once, timestamp.
   * Note: $set/$set_once are extracted from properties.$set and properties.$set_once.
   */
  protected processBeforeEnqueue(message: PostHogEventProperties): PostHogEventProperties | null {
    if (!this._beforeSend) {
      return message
    }

    // Convert internal message format to CaptureEvent (user-facing interface matching web SDK's CaptureResult)
    const timestamp = message.timestamp
    const props = (message.properties || {}) as PostHogEventProperties
    const captureEvent: CaptureEvent = {
      uuid: message.uuid as string,
      event: message.event as string,
      properties: props,
      $set: props.$set as PostHogEventProperties | undefined,
      $set_once: props.$set_once as PostHogEventProperties | undefined,
      // Convert timestamp to Date if it's a string (from currentISOTime())
      timestamp: typeof timestamp === 'string' ? new Date(timestamp) : (timestamp as unknown as Date | undefined),
    }

    const result = this._runBeforeSend(captureEvent)

    if (!result) {
      return null
    }

    // Apply modifications from CaptureEvent back to internal message
    // Put $set/$set_once back into properties where they belong
    const resultProps = { ...(result.properties ?? props) } as PostHogEventProperties
    if (result.$set !== undefined) {
      resultProps.$set = result.$set as JsonType
    } else {
      delete resultProps.$set
    }
    if (result.$set_once !== undefined) {
      resultProps.$set_once = result.$set_once as JsonType
    } else {
      delete resultProps.$set_once
    }

    return {
      ...message,
      uuid: result.uuid ?? message.uuid,
      event: result.event,
      properties: resultProps,
      timestamp: result.timestamp as unknown as JsonType,
    }
  }

  /**
   * Runs the before_send hook(s) on the given capture event.
   * If any hook returns null, the event is dropped.
   *
   * @param captureEvent The event to process
   * @returns The processed event, or null if the event should be dropped
   */
  private _runBeforeSend(captureEvent: CaptureEvent): CaptureEvent | null {
    const beforeSend = this._beforeSend
    if (!beforeSend) {
      return captureEvent
    }
    const fns = Array.isArray(beforeSend) ? beforeSend : [beforeSend]
    let result: CaptureEvent | null = captureEvent

    for (const fn of fns) {
      try {
        result = fn(result)
        if (!result) {
          this._logger.info(`Event '${captureEvent.event}' was rejected in before_send function`)
          return null
        }
      } catch (e) {
        this._logger.error(`Error in before_send function for event '${captureEvent.event}':`, e)
      }
    }

    return result
  }
}

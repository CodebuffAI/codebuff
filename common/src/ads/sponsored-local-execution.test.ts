import { describe, expect, it } from 'bun:test'

import {
  SPONSORED_LOCAL_ENV_ALLOWLIST,
  SPONSORED_LOCAL_UNAVAILABLE_COPY,
  SPONSORED_LOCAL_UNCONTAINED_GRANT,
  SPONSORED_LOCAL_V1_GRANT,
  commandInstallsDependencies,
  evaluateSponsoredLocalToolCall,
  looksLikeCredentialEnvVar,
  scrubSponsoredLocalEnv,
  sponsoredLocalAvailability,
  sponsoredLocalContainment,
  sponsoredLocalGrant,
  sponsoredLocalToolNames,
  sponsoredLocalUnavailableReason,
} from './sponsored-local-execution'

describe('the local grant is its own constant (COD-336 acceptance 2)', () => {
  it('grants the shell only where something can contain it', () => {
    const contained = sponsoredLocalGrant(sponsoredLocalContainment('darwin'))
    expect(contained.has('run_commands')).toBe(true)
    expect(contained).toBe(SPONSORED_LOCAL_V1_GRANT)

    const windows = sponsoredLocalGrant(sponsoredLocalContainment('win32'))
    expect(windows.has('run_commands')).toBe(false)
    expect(windows).toBe(SPONSORED_LOCAL_UNCONTAINED_GRANT)
    // Denying the shell must not quietly deny the write tools with it: they
    // are the whole reason the uncontained grant exists rather than being an
    // empty set.
    expect(windows.has('write_workspace')).toBe(true)
    expect(windows.has('read_workspace')).toBe(true)
  })

  it('refuses the two capabilities local execution does not change the case for', () => {
    for (const grant of [
      SPONSORED_LOCAL_V1_GRANT,
      SPONSORED_LOCAL_UNCONTAINED_GRANT,
    ]) {
      expect(grant.has('human_in_loop')).toBe(false)
      expect(grant.has('delegate')).toBe(false)
    }
    expect(evaluateSponsoredLocalToolCall('ask_user').allowed).toBe(false)
    expect(evaluateSponsoredLocalToolCall('spawn_agents').allowed).toBe(false)
  })

  it('refuses a tool it has never heard of rather than passing it through', () => {
    const decision = evaluateSponsoredLocalToolCall('some_mcp_tool')
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('unknown_tool')
    // The prototype names a model can produce, all of which used to be truthy
    // under a direct index.
    for (const name of ['__proto__', 'toString', 'constructor']) {
      const answer = evaluateSponsoredLocalToolCall(name)
      expect(answer.allowed === false && answer.code).toBe('unknown_tool')
    }
  })

  it('narrows a host toolset without inventing tools the host lacks', () => {
    const host = ['read_files', 'run_terminal_command', 'ask_user', 'write_file']
    expect(sponsoredLocalToolNames(host)).toEqual([
      'read_files',
      'run_terminal_command',
      'write_file',
    ])
    expect(
      sponsoredLocalToolNames(host, SPONSORED_LOCAL_UNCONTAINED_GRANT),
    ).toEqual(['read_files', 'write_file'])
    expect(sponsoredLocalToolNames(['read_files'])).not.toContain('code_search')
  })
})

describe('containment availability, as the card reads it', () => {
  it('renders a reason a surface can show', () => {
    expect(sponsoredLocalAvailability(sponsoredLocalContainment('darwin'))).toBe(
      'available',
    )
    expect(sponsoredLocalAvailability(sponsoredLocalContainment('win32'))).toBe(
      'unavailable:windows-no-containment',
    )
    expect(
      sponsoredLocalAvailability(
        sponsoredLocalContainment('linux', { bwrapAvailable: false }),
      ),
    ).toBe('unavailable:bubblewrap-missing')
  })

  it('never blames the operating system for a missing consent bridge', () => {
    // `no-consent-bridge` is reached most often on a perfectly supported Mac
    // -- `dev:web`, a bare orchestrator, the ui-shots harness -- and it used
    // to share `unsupported-platform`'s sentence, which told that user their
    // OS could not run sponsored tasks. It can; nobody was there to ask them.
    expect(sponsoredLocalUnavailableReason('unavailable:no-consent-bridge')).toBe(
      'no-consent-bridge',
    )
    const consent = SPONSORED_LOCAL_UNAVAILABLE_COPY['no-consent-bridge']
    expect(consent).not.toBe(
      SPONSORED_LOCAL_UNAVAILABLE_COPY['unsupported-platform'],
    )
    expect(consent).not.toContain('operating system')
    // Fixable, and the sentence has to say how -- the same property the
    // bubblewrap line has and the two permanent ones do not.
    expect(consent).toContain('app')
    // `sponsoredLocalContainment` answers about CONTAINMENT only. It must
    // never produce this reason: the caller that has no bridge is the only
    // thing that knows.
    for (const platform of ['darwin', 'linux', 'win32', 'freebsd'] as const) {
      const containment = sponsoredLocalContainment(platform)
      if (!containment.available) {
        expect(containment.reason).not.toBe('no-consent-bridge')
      }
    }
  })

  it('parses its own answer back, and refuses one it did not write', () => {
    expect(sponsoredLocalUnavailableReason('available')).toBeNull()
    expect(sponsoredLocalUnavailableReason('unavailable:windows-no-containment')).toBe(
      'windows-no-containment',
    )
    expect(sponsoredLocalUnavailableReason('unavailable:made-up')).toBeNull()
  })
})

describe('the environment a local run gets', () => {
  it('is an allowlist, so an unforeseen variable is absent by default', () => {
    const env = scrubSponsoredLocalEnv(
      {
        PATH: '/usr/bin',
        LANG: 'en_US.UTF-8',
        SOME_FUTURE_VENDOR_CREDENTIAL: 'value',
        HOME: '/Users/owen',
      },
      { home: '/run/home', tmp: '/run/tmp' },
    )
    expect(Object.keys(env).sort()).toEqual(
      [
        'GIT_ASKPASS',
        'GIT_CONFIG_COUNT',
        'GIT_CONFIG_KEY_0',
        'GIT_CONFIG_VALUE_0',
        'GIT_TERMINAL_PROMPT',
        'HOME',
        'LANG',
        'PATH',
        'TEMP',
        'TMP',
        'TMPDIR',
        'USERPROFILE',
      ].sort(),
    )
    expect(env.HOME).toBe('/run/home')
  })

  it('disables git hooks in both directions, by config rather than by asking', () => {
    const env = scrubSponsoredLocalEnv(
      { PATH: '/usr/bin' },
      { home: '/run/home', tmp: '/run/tmp' },
    )
    expect(env.GIT_CONFIG_COUNT).toBe('1')
    expect(env.GIT_CONFIG_KEY_0).toBe('core.hooksPath')
    // Under the run's own HOME, and a directory nothing creates: git finding
    // no hooks directory is the outcome, on every git invocation the run
    // makes rather than only the ones that remembered `--no-verify`.
    expect(env.GIT_CONFIG_VALUE_0).toBe('/run/home/no-hooks')
  })

  it('never lets a credential-shaped name onto the allowlist', () => {
    for (const key of SPONSORED_LOCAL_ENV_ALLOWLIST) {
      expect(looksLikeCredentialEnvVar(key)).toBe(false)
    }
    expect(looksLikeCredentialEnvVar('GITHUB_TOKEN')).toBe(true)
    expect(looksLikeCredentialEnvVar('AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(looksLikeCredentialEnvVar('NPM_CONFIG_REGISTRY')).toBe(true)
    expect(looksLikeCredentialEnvVar('OPENAI_API_KEY')).toBe(true)
  })
})

describe('no dependency installs in v1', () => {
  it('recognises the ordinary spellings, including inside a chain', () => {
    for (const command of [
      'npm install left-pad',
      'bun add @acme/sdk',
      'pnpm i',
      'yarn add --dev vitest',
      'pip3 install requests',
      'cargo add serde',
      'cd packages/web && npm ci',
      'brew install jq',
    ]) {
      expect(commandInstallsDependencies(command)).toBe(true)
    }
  })

  it('does not refuse the commands a run legitimately needs', () => {
    for (const command of [
      'npm test',
      'bun run typecheck',
      'git add -A',
      'ls node_modules',
      'echo "install"',
      'grep -r install src',
    ]) {
      expect(commandInstallsDependencies(command)).toBe(false)
    }
  })
})

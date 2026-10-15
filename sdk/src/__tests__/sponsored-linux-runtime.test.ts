import { describe, expect, test } from 'bun:test'

import {
  findBubblewrap,
  sponsoredLinuxRuntimePath,
  sponsoredLinuxSearchPath,
} from '../tools/sponsored-linux-runtime'

const store = '/nix/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('sponsored Linux runtime paths', () => {
  test('finds a profile-installed sandbox, ignoring project-local bwrap', () => {
    const binary = `${store}-bubblewrap/bin/bwrap`
    const links = new Map([
      ['/project/bin/bwrap', '/project/bin/bwrap'],
      ['/home/user/.nix-profile/bin/bwrap', binary],
    ])
    expect(
      findBubblewrap({
        searchPath: '.:relative/bin:/project/bin:/home/user/.nix-profile/bin',
        exists: (pathname) => pathname === binary,
        realpath: (pathname) => {
          const target = links.get(pathname)
          if (!target) throw new Error('missing')
          return target
        },
      }),
    ).toBe(binary)
  })

  test('preserves the system wrapper rather than bypassing it via PATH', () => {
    expect(
      findBubblewrap({
        searchPath: `${store}-bubblewrap/bin`,
        exists: (pathname) => pathname === '/run/wrappers/bin/bwrap',
        realpath: () => {
          throw new Error('the fixed wrapper must not be resolved')
        },
      }),
    ).toBe('/run/wrappers/bin/bwrap')
  })

  test('never treats an arbitrary PATH executable as the sandbox', () => {
    for (const resolved of [
      '/project/bin/bwrap',
      '/nix/store-copy/bwrap',
      '/nix/store/../../project/bwrap',
    ]) {
      expect(
        findBubblewrap({
          searchPath: '/project/bin',
          exists: (pathname) => pathname === resolved,
          realpath: () => resolved,
        }),
      ).toBeNull()
    }
  })

  test('uses store paths without granting the profile home or /run', () => {
    const profile = `${store}-user-environment/bin`
    const bash = `${store}-bash/bin/bash`
    const links = new Map([
      ['/home/user/.nix-profile/bin', profile],
      ['/run/current-system/sw/bin', `${store}-system-path/bin`],
      ['/home/user/.nix-profile/bin/bash', bash],
      ['/usr/bin', '/usr/bin'],
      ['/project/bin', '/outside/bin'],
    ])
    const realpath = (pathname: string) => {
      const target = links.get(pathname)
      if (!target) throw new Error('missing')
      return target
    }
    expect(
      sponsoredLinuxSearchPath(
        '/home/user/.nix-profile/bin:/usr/bin:/run/current-system/sw/bin:/project/bin:/missing:relative:',
        realpath,
      ),
    ).toBe(
      `${profile}:/usr/bin:${store}-system-path/bin:/project/bin:/missing:relative:`,
    )
    expect(
      sponsoredLinuxRuntimePath('/home/user/.nix-profile/bin/bash', realpath),
    ).toBe(bash)
    expect(sponsoredLinuxRuntimePath('bash', realpath)).toBe('bash')
  })
})

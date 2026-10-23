import { expect, test } from 'bun:test'
import { boatBrowserSize, isBoatBrowserSize } from './boat-browser-size'

test('browser dimensions preserve panel proportions and respect Chrome and encoder limits', () => {
  expect(boatBrowserSize(440, 832)).toEqual({ width: 512, height: 968 })
  expect(boatBrowserSize(800, 832)).toEqual({ width: 800, height: 832 })
  expect(boatBrowserSize(3840, 2160)).toEqual({ width: 2560, height: 1440 })
  expect(boatBrowserSize(800, 3000)).toEqual({ width: 576, height: 2160 })
  for (const input of [
    [0, 832],
    [440, 0],
    [-1, 800],
    [NaN, 800],
    [800, Infinity],
  ])
    expect(boatBrowserSize(input[0], input[1])).toBeNull()
  for (const input of [
    [1, 1],
    [440, 832],
    [2560, 1440],
    [10000, 1],
    [1, 10000],
  ])
    expect(isBoatBrowserSize(boatBrowserSize(input[0], input[1]))).toBe(true)
})

test('untrusted dimensions must be bounded aligned integers with no extra fields', () => {
  for (const value of [
    null,
    {},
    { width: '800', height: 832 },
    { width: 800, height: 833 },
    { width: 800, height: 0 },
    { width: 4096, height: 832 },
    { width: 800, height: 832, command: 'x' },
  ])
    expect(isBoatBrowserSize(value)).toBe(false)
  expect(isBoatBrowserSize({ width: 800, height: 832 })).toBe(true)
})

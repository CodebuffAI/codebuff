import { describe, expect, test } from 'bun:test'

import { parseFileStructure } from '../structure'

describe('parseFileStructure', () => {
  test('captures top-level const arrow/function definitions (exported and not)', async () => {
    const src = [
      'export const greet = (name: string) => {', // 1
      '  return `hi ${name}`', // 2
      '}', // 3
      '', // 4
      'const helper = function () {', // 5
      '  return 1', // 6
      '}', // 7
      '', // 8
      'export const MAX = 100', // 9
      '', // 10
      'function outer() {', // 11
      '  const localOnly = () => 2', // 12
      '  return localOnly', // 13
      '}', // 14
    ].join('\n')

    const syms = (await parseFileStructure(src, 'x.ts')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))

    expect(byName.greet).toMatchObject({ kind: 'function', startLine: 1, endLine: 3 })
    expect(byName.helper).toMatchObject({ kind: 'function', startLine: 5, endLine: 7 })
    expect(byName.MAX).toMatchObject({ kind: 'variable', startLine: 9 })
    expect(byName.outer).toMatchObject({ kind: 'function' })
    // The const INSIDE outer() is a local and must NOT pollute the outline.
    expect(byName.localOnly).toBeUndefined()
  })

  test('returns null for unsupported extensions', async () => {
    expect(await parseFileStructure('hello', 'notes.unknownext')).toBeNull()
  })

  test('extracts TypeScript functions, classes, methods, interfaces, types', async () => {
    const src = [
      'export interface Foo {', // 1
      '  a: number', // 2
      '}', // 3
      '', // 4
      'export type Bar = string | number', // 5
      '', // 6
      'export function greet(name: string) {', // 7
      '  return `hi ${name}`', // 8
      '}', // 9
      '', // 10
      'class Service {', // 11
      '  run() {', // 12
      '    return 1', // 13
      '  }', // 14
      '}', // 15
    ].join('\n')

    const syms = await parseFileStructure(src, 'x.ts')
    expect(syms).not.toBeNull()
    const byName = Object.fromEntries((syms ?? []).map((s) => [s.name, s]))

    expect(byName.Foo).toMatchObject({ kind: 'interface', startLine: 1, endLine: 3 })
    expect(byName.Bar).toMatchObject({ kind: 'type', startLine: 5 })
    expect(byName.greet).toMatchObject({ kind: 'function', startLine: 7, endLine: 9 })
    expect(byName.Service).toMatchObject({ kind: 'class', startLine: 11, endLine: 15 })
    // Method nested inside the class is reported with depth > 0.
    expect(byName.run).toMatchObject({ kind: 'method', startLine: 12, endLine: 14 })
    expect(byName.run.depth).toBeGreaterThan(0)
    expect(byName.Service.depth).toBe(0)
  })

  test('brace inside a string literal does not truncate the function span', async () => {
    // The old regex slicer brace-counted and would close the function early at
    // the "}" inside the string. tree-sitter spans the real function body.
    const src = [
      'function tricky() {', // 1
      '  const s = "a } b {{ c"', // 2
      '  const t = `${x} }`', // 3
      '  return s + t', // 4
      '}', // 5
      '', // 6
      'function after() {', // 7
      '  return 2', // 8
      '}', // 9
    ].join('\n')

    const syms = (await parseFileStructure(src, 'x.ts')) ?? []
    const tricky = syms.find((s) => s.name === 'tricky')
    const after = syms.find((s) => s.name === 'after')
    expect(tricky).toMatchObject({ startLine: 1, endLine: 5 })
    expect(after).toMatchObject({ startLine: 7, endLine: 9 })
  })

  test('extracts Python classes and functions (indentation-based)', async () => {
    const src = [
      'class Animal:', // 1
      '    def speak(self):', // 2
      '        return "..."', // 3
      '', // 4
      'def top_level():', // 5
      '    return 1', // 6
    ].join('\n')

    const syms = (await parseFileStructure(src, 'a.py')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.Animal).toMatchObject({ kind: 'class', startLine: 1, endLine: 3 })
    expect(byName.speak).toMatchObject({ kind: 'method', startLine: 2, endLine: 3 })
    expect(byName.top_level).toMatchObject({ kind: 'function', startLine: 5, endLine: 6 })
  })

  test('extracts Go funcs, methods, and types (no spurious reference symbols)', async () => {
    const src = [
      'package main', // 1
      '', // 2
      'type Server struct {', // 3
      '\tName string', // 4
      '}', // 5
      '', // 6
      'func New(name string) *Server {', // 7
      '\treturn &Server{Name: name}', // 8
      '}', // 9
      '', // 10
      'func (s *Server) Run(other Server) error {', // 11
      '\treturn nil', // 12
      '}', // 13
    ].join('\n')

    const syms = (await parseFileStructure(src, 'main.go')) ?? []
    const names = syms.map((s) => s.name).sort()
    // Server (type), New (func), Run (method). The `Server` used as a param
    // type on line 11 must NOT create a second/extra definition entry.
    expect(names).toEqual(['New', 'Run', 'Server'])
    expect(syms.find((s) => s.name === 'Run')).toMatchObject({
      kind: 'method',
      startLine: 11,
      endLine: 13,
    })
  })

  test('extracts Rust items', async () => {
    const src = [
      'struct Point {', // 1
      '    x: i32,', // 2
      '}', // 3
      '', // 4
      'impl Point {', // 5
      '    fn new() -> Self {', // 6
      '        Point { x: 0 }', // 7
      '    }', // 8
      '}', // 9
      '', // 10
      'fn main() {}', // 11
    ].join('\n')

    const syms = (await parseFileStructure(src, 'm.rs')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.Point).toMatchObject({ kind: 'struct', startLine: 1, endLine: 3 })
    // `new` lives inside `impl Point`, so it is reported as a method.
    expect(byName.new).toMatchObject({ kind: 'method', startLine: 6, endLine: 8 })
    expect(byName.main).toMatchObject({ kind: 'function', startLine: 11, endLine: 11 })
    expect(byName['impl Point']).toMatchObject({ kind: 'impl', startLine: 5, endLine: 9 })
  })
})

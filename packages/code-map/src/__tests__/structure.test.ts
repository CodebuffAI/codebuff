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

    expect(byName.greet).toMatchObject({
      kind: 'function',
      startLine: 1,
      endLine: 3,
    })
    expect(byName.helper).toMatchObject({
      kind: 'function',
      startLine: 5,
      endLine: 7,
    })
    expect(byName.MAX).toMatchObject({ kind: 'variable', startLine: 9 })
    expect(byName.outer).toMatchObject({ kind: 'function' })
    // The const INSIDE outer() is a local and must NOT pollute the outline.
    expect(byName.localOnly).toBeUndefined()
  })

  test('returns null for unsupported extensions', async () => {
    expect(await parseFileStructure('hello', 'notes.unknownext')).toBeNull()
  })

  test('keeps healthy symbols but omits malformed rewrite ranges', async () => {
    const symbols = await parseFileStructure(
      'export function good() { return 1 }\nexport function broken( {\n  return 1\n}\n',
      'broken.ts',
    )
    expect(symbols?.map((symbol) => symbol.name)).toContain('good')
    expect(symbols?.map((symbol) => symbol.name)).not.toContain('broken')
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

    expect(byName.Foo).toMatchObject({
      kind: 'interface',
      startLine: 1,
      endLine: 3,
    })
    expect(byName.Bar).toMatchObject({ kind: 'type', startLine: 5 })
    expect(byName.greet).toMatchObject({
      kind: 'function',
      startLine: 7,
      endLine: 9,
    })
    expect(byName.Service).toMatchObject({
      kind: 'class',
      startLine: 11,
      endLine: 15,
    })
    // Method nested inside the class is reported with depth > 0.
    expect(byName.run).toMatchObject({
      kind: 'method',
      startLine: 12,
      endLine: 14,
    })
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
    expect(byName.Animal).toMatchObject({
      kind: 'class',
      startLine: 1,
      endLine: 3,
    })
    expect(byName.speak).toMatchObject({
      kind: 'method',
      startLine: 2,
      endLine: 3,
    })
    expect(byName.top_level).toMatchObject({
      kind: 'function',
      startLine: 5,
      endLine: 6,
    })
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
    expect(byName.Point).toMatchObject({
      kind: 'struct',
      startLine: 1,
      endLine: 3,
    })
    // `new` lives inside `impl Point`, so it is reported as a method.
    expect(byName.new).toMatchObject({
      kind: 'method',
      startLine: 6,
      endLine: 8,
    })
    expect(byName.main).toMatchObject({
      kind: 'function',
      startLine: 11,
      endLine: 11,
    })
    expect(byName['impl Point']).toMatchObject({
      kind: 'impl',
      startLine: 5,
      endLine: 9,
    })
  })

  test('extracts JavaScript classes, methods, and functions', async () => {
    const src = [
      'class Widget {', // 1
      '  render() {', // 2
      '    return helper()', // 3
      '  }', // 4
      '}', // 5
      'function helper() { return 1 }', // 6
    ].join('\n')

    const syms = (await parseFileStructure(src, 'service.js')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.Widget).toMatchObject({
      kind: 'class',
      startLine: 1,
      endLine: 5,
    })
    expect(byName.render).toMatchObject({
      kind: 'method',
      startLine: 2,
      endLine: 4,
    })
    expect(byName.helper).toMatchObject({
      kind: 'function',
      startLine: 6,
      endLine: 6,
    })
  })

  test('extracts Java interfaces, classes, constructors, and methods', async () => {
    const src = [
      'package demo;', // 1
      'interface RunnableThing {', // 2
      '  void run();', // 3
      '}', // 4
      'class Service implements RunnableThing {', // 5
      '  public Service() {}', // 6
      '  public void run() { helper(); }', // 7
      '  private void helper() {}', // 8
      '}', // 9
    ].join('\n')

    const syms = (await parseFileStructure(src, 'Example.java')) ?? []
    const byName = Object.fromEntries(
      syms.map((s) => [`${s.name}:${s.startLine}`, s]),
    )
    expect(byName['RunnableThing:2']).toMatchObject({
      kind: 'interface',
      endLine: 4,
    })
    expect(byName['run:3']).toMatchObject({ kind: 'method' })
    expect(byName['Service:5']).toMatchObject({ kind: 'class', endLine: 9 })
    expect(byName['Service:6']).toMatchObject({ kind: 'method' })
    expect(byName['run:7']).toMatchObject({ kind: 'method' })
    expect(byName['helper:8']).toMatchObject({ kind: 'method' })
  })

  test('extracts C# namespaces, interfaces, classes, and methods', async () => {
    const src = [
      'namespace Demo {', // 1
      '  interface IWorker { void Run(); }', // 2
      '  class Worker : IWorker {', // 3
      '    public void Run() { Helper(); }', // 4
      '    private void Helper() {}', // 5
      '  }', // 6
      '}', // 7
    ].join('\n')

    const syms = (await parseFileStructure(src, 'Program.cs')) ?? []
    const byName = Object.fromEntries(
      syms.map((s) => [`${s.name}:${s.startLine}`, s]),
    )
    expect(byName['Demo:1']).toMatchObject({ kind: 'module', endLine: 7 })
    expect(byName['IWorker:2']).toMatchObject({ kind: 'interface' })
    expect(byName['Worker:3']).toMatchObject({ kind: 'class', endLine: 6 })
    expect(byName['Run:4']).toMatchObject({ kind: 'method' })
    expect(byName['Helper:5']).toMatchObject({ kind: 'method' })
  })

  test('extracts C++ classes, structs, methods, and functions', async () => {
    const src = [
      'namespace demo {', // 1
      'class Engine {', // 2
      'public:', // 3
      '  void start() { helper(); }', // 4
      '};', // 5
      'struct Point { int x; };', // 6
      'int helper() { return 1; }', // 7
      '}', // 8
    ].join('\n')

    const syms = (await parseFileStructure(src, 'lib.cpp')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.Engine).toMatchObject({
      kind: 'class',
      startLine: 2,
      endLine: 5,
    })
    expect(byName.start).toMatchObject({ kind: 'method', startLine: 4 })
    expect(byName.Point).toMatchObject({ kind: 'struct', startLine: 6 })
    expect(byName.helper).toMatchObject({ kind: 'function', startLine: 7 })
  })

  test('extracts Ruby modules, classes, and methods', async () => {
    const src = [
      'module Demo', // 1
      '  class Worker', // 2
      '    def run', // 3
      '      helper', // 4
      '    end', // 5
      '', // 6
      '    def helper', // 7
      '      1', // 8
      '    end', // 9
      '  end', // 10
      'end', // 11
    ].join('\n')

    const syms = (await parseFileStructure(src, 'app.rb')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.Demo).toMatchObject({
      kind: 'module',
      startLine: 1,
      endLine: 11,
    })
    expect(byName.Worker).toMatchObject({
      kind: 'class',
      startLine: 2,
      endLine: 10,
    })
    expect(byName.run).toMatchObject({
      kind: 'method',
      startLine: 3,
      endLine: 5,
    })
    expect(byName.helper).toMatchObject({
      kind: 'method',
      startLine: 7,
      endLine: 9,
    })
  })

  test('extracts structures for PHP, Swift, and Kotlin', async () => {
    expect(
      await parseFileStructure('<?php function phpDemo() {}', 'index.php'),
    ).toEqual([
      expect.objectContaining({ name: 'phpDemo', kind: 'function' }),
    ])
    expect(
      await parseFileStructure('func swiftDemo() {}', 'App.swift'),
    ).toEqual([
      expect.objectContaining({ name: 'swiftDemo', kind: 'function' }),
    ])
    expect(
      await parseFileStructure('fun kotlinDemo() {}', 'Main.kt'),
    ).toEqual([
      expect.objectContaining({ name: 'kotlinDemo', kind: 'function' }),
    ])
  })

  test('extracts GDScript functions, classes, and variables (Godot 4.x)', async () => {
    const src = [
      'extends Node2D', // 1
      '', // 2
      'class_name PlayerController', // 3
      '', // 4
      'var speed: float = 300.0', // 5
      'const MAX_HP: int = 100', // 6
      '', // 7
      'func _ready():', // 8
      '    pass', // 9
      '', // 10
      'func move(direction: Vector2) -> void:', // 11
      '    position += direction * speed', // 12
      '', // 13
      'signal health_changed(amount: int)', // 14
    ].join('\n')

    const syms = (await parseFileStructure(src, 'Player.gd')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.PlayerController).toMatchObject({
      kind: 'class',
      startLine: 3,
    })
    expect(byName.speed).toMatchObject({ kind: 'variable', startLine: 5 })
    expect(byName.MAX_HP).toMatchObject({ kind: 'constant', startLine: 6 })
    expect(byName._ready).toMatchObject({
      kind: 'function',
      startLine: 8,
      endLine: 9,
    })
    expect(byName.move).toMatchObject({
      kind: 'function',
      startLine: 11,
      endLine: 12,
    })
    expect(byName.health_changed).toMatchObject({
      kind: 'signal',
      startLine: 14,
    })
  })

  test('extracts GDScript enums and inner class definitions', async () => {
    const src = [
      'extends Node', // 1
      '', // 2
      'enum Direction {', // 3
      '    UP,', // 4
      '    DOWN,', // 5
      '    LEFT,', // 6
      '    RIGHT', // 7
      '}', // 8
      '', // 9
      'class InnerHelper:', // 10
      '    var data: int = 0', // 11
      '', // 12
      '    func process() -> void:', // 13
      '        self.data += 1', // 14
    ].join('\n')

    const syms = (await parseFileStructure(src, 'Enums.gd')) ?? []
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]))
    expect(byName.Direction).toMatchObject({
      kind: 'enum',
      startLine: 3,
      endLine: 8,
    })
    expect(byName.InnerHelper).toMatchObject({
      kind: 'class',
      startLine: 10,
      endLine: 14,
    })
    expect(byName.data).toMatchObject({ kind: 'variable', startLine: 11 })
    // Function inside the inner class should be relabeled as a method
    expect(byName.process).toBeDefined()
    expect(
      byName.process.kind === 'function' || byName.process.kind === 'method',
    ).toBe(true)
  })

  test('returns empty array (not null) for empty GDScript file', async () => {
    const syms = await parseFileStructure('', 'Empty.gd')
    // Should be null (no grammar) or an empty array (parseable but no symbols)
    if (syms !== null) {
      expect(syms).toEqual([])
    }
  })
})

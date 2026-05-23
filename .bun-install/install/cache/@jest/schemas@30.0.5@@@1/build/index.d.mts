import * as _sinclair_typebox0 from "@sinclair/typebox";
import { Static } from "@sinclair/typebox";

//#region src/index.d.ts

declare const SnapshotFormat: _sinclair_typebox0.TObject<{
  callToJSON: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  compareKeys: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNull>;
  escapeRegex: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  escapeString: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  highlight: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  indent: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
  maxDepth: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
  maxWidth: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
  min: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  printBasicPrototype: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  printFunctionName: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  theme: _sinclair_typebox0.TOptional<_sinclair_typebox0.TObject<{
    comment: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    content: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    prop: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    tag: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    value: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  }>>;
}>;
type SnapshotFormat = Static<typeof SnapshotFormat>;
declare const InitialOptions: _sinclair_typebox0.TObject<{
  automock: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  bail: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TBoolean, _sinclair_typebox0.TNumber]>>;
  cache: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  cacheDirectory: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  ci: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  clearMocks: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  changedFilesWithAncestor: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  changedSince: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  collectCoverage: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  collectCoverageFrom: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  coverageDirectory: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  coveragePathIgnorePatterns: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  coverageProvider: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"babel">, _sinclair_typebox0.TLiteral<"v8">]>>;
  coverageReporters: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"clover">, _sinclair_typebox0.TLiteral<"cobertura">, _sinclair_typebox0.TLiteral<"html-spa">, _sinclair_typebox0.TLiteral<"html">, _sinclair_typebox0.TLiteral<"json">, _sinclair_typebox0.TLiteral<"json-summary">, _sinclair_typebox0.TLiteral<"lcov">, _sinclair_typebox0.TLiteral<"lcovonly">, _sinclair_typebox0.TLiteral<"none">, _sinclair_typebox0.TLiteral<"teamcity">, _sinclair_typebox0.TLiteral<"text">, _sinclair_typebox0.TLiteral<"text-lcov">, _sinclair_typebox0.TLiteral<"text-summary">]>, _sinclair_typebox0.TTuple<[_sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"clover">, _sinclair_typebox0.TLiteral<"cobertura">, _sinclair_typebox0.TLiteral<"html-spa">, _sinclair_typebox0.TLiteral<"html">, _sinclair_typebox0.TLiteral<"json">, _sinclair_typebox0.TLiteral<"json-summary">, _sinclair_typebox0.TLiteral<"lcov">, _sinclair_typebox0.TLiteral<"lcovonly">, _sinclair_typebox0.TLiteral<"none">, _sinclair_typebox0.TLiteral<"teamcity">, _sinclair_typebox0.TLiteral<"text">, _sinclair_typebox0.TLiteral<"text-lcov">, _sinclair_typebox0.TLiteral<"text-summary">]>, _sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown>]>]>>>;
  coverageThreshold: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnsafe<{
    [path: string]: {
      branches?: number | undefined;
      functions?: number | undefined;
      lines?: number | undefined;
      statements?: number | undefined;
    };
    global: Static<_sinclair_typebox0.TObject<{
      branches: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
      functions: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
      lines: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
      statements: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
    }>>;
  }>>;
  dependencyExtractor: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  detectLeaks: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  detectOpenHandles: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  displayName: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TObject<{
    name: _sinclair_typebox0.TString;
    color: _sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"black">, _sinclair_typebox0.TLiteral<"red">, _sinclair_typebox0.TLiteral<"green">, _sinclair_typebox0.TLiteral<"yellow">, _sinclair_typebox0.TLiteral<"blue">, _sinclair_typebox0.TLiteral<"magenta">, _sinclair_typebox0.TLiteral<"cyan">, _sinclair_typebox0.TLiteral<"white">, _sinclair_typebox0.TLiteral<"gray">, _sinclair_typebox0.TLiteral<"grey">, _sinclair_typebox0.TLiteral<"blackBright">, _sinclair_typebox0.TLiteral<"redBright">, _sinclair_typebox0.TLiteral<"greenBright">, _sinclair_typebox0.TLiteral<"yellowBright">, _sinclair_typebox0.TLiteral<"blueBright">, _sinclair_typebox0.TLiteral<"magentaBright">, _sinclair_typebox0.TLiteral<"cyanBright">, _sinclair_typebox0.TLiteral<"whiteBright">]>;
  }>]>>;
  expand: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  extensionsToTreatAsEsm: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  fakeTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TIntersect<[_sinclair_typebox0.TObject<{
    enableGlobally: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  }>, _sinclair_typebox0.TUnion<[_sinclair_typebox0.TObject<{
    advanceTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TBoolean, _sinclair_typebox0.TNumber]>>;
    doNotFake: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"Date">, _sinclair_typebox0.TLiteral<"hrtime">, _sinclair_typebox0.TLiteral<"nextTick">, _sinclair_typebox0.TLiteral<"performance">, _sinclair_typebox0.TLiteral<"queueMicrotask">, _sinclair_typebox0.TLiteral<"requestAnimationFrame">, _sinclair_typebox0.TLiteral<"cancelAnimationFrame">, _sinclair_typebox0.TLiteral<"requestIdleCallback">, _sinclair_typebox0.TLiteral<"cancelIdleCallback">, _sinclair_typebox0.TLiteral<"setImmediate">, _sinclair_typebox0.TLiteral<"clearImmediate">, _sinclair_typebox0.TLiteral<"setInterval">, _sinclair_typebox0.TLiteral<"clearInterval">, _sinclair_typebox0.TLiteral<"setTimeout">, _sinclair_typebox0.TLiteral<"clearTimeout">]>>>;
    now: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
    timerLimit: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
    legacyFakeTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TLiteral<false>>;
  }>, _sinclair_typebox0.TObject<{
    legacyFakeTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TLiteral<true>>;
  }>]>]>>;
  filter: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  findRelatedTests: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  forceCoverageMatch: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  forceExit: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  json: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  globals: _sinclair_typebox0.TOptional<_sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown>>;
  globalSetup: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
  globalTeardown: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
  haste: _sinclair_typebox0.TOptional<_sinclair_typebox0.TObject<{
    computeSha1: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    defaultPlatform: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
    forceNodeFilesystemAPI: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    enableSymlinks: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    hasteImplModulePath: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    platforms: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
    throwOnModuleCollision: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    hasteMapModulePath: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    retainAllFiles: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  }>>;
  id: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  injectGlobals: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  reporters: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TTuple<[_sinclair_typebox0.TString, _sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown>]>]>>>;
  logHeapUsage: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  lastCommit: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  listTests: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  maxConcurrency: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
  maxWorkers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TInteger]>>;
  moduleDirectories: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  moduleFileExtensions: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  moduleNameMapper: _sinclair_typebox0.TOptional<_sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TArray<_sinclair_typebox0.TString>]>>>;
  modulePathIgnorePatterns: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  modulePaths: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  noStackTrace: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  notify: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  notifyMode: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  onlyChanged: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  onlyFailures: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  openHandlesTimeout: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
  outputFile: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  passWithNoTests: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  preset: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
  prettierPath: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
  projects: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown>]>>>;
  randomize: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  replname: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
  resetMocks: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  resetModules: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  resolver: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TNull]>>;
  restoreMocks: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  rootDir: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  roots: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  runner: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  runTestsByPath: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  runtime: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  sandboxInjectedGlobals: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  setupFiles: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  setupFilesAfterEnv: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  showSeed: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  silent: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  skipFilter: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  skipNodeResolution: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  slowTestThreshold: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
  snapshotResolver: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  snapshotSerializers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  snapshotFormat: _sinclair_typebox0.TOptional<_sinclair_typebox0.TObject<{
    callToJSON: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    compareKeys: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNull>;
    escapeRegex: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    escapeString: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    highlight: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    indent: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
    maxDepth: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
    maxWidth: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
    min: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    printBasicPrototype: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    printFunctionName: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
    theme: _sinclair_typebox0.TOptional<_sinclair_typebox0.TObject<{
      comment: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
      content: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
      prop: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
      tag: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
      value: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
    }>>;
  }>>;
  errorOnDeprecated: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  testEnvironment: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  testEnvironmentOptions: _sinclair_typebox0.TOptional<_sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown>>;
  testFailureExitCode: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
  testLocationInResults: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  testMatch: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  testNamePattern: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  testPathIgnorePatterns: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  testRegex: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TArray<_sinclair_typebox0.TString>]>>;
  testResultsProcessor: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  testRunner: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  testSequencer: _sinclair_typebox0.TOptional<_sinclair_typebox0.TString>;
  testTimeout: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
  transform: _sinclair_typebox0.TOptional<_sinclair_typebox0.TRecord<_sinclair_typebox0.TString, _sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TTuple<[_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown]>]>>>;
  transformIgnorePatterns: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  watchPathIgnorePatterns: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  unmockedModulePathPatterns: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TString>>;
  updateSnapshot: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  useStderr: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  verbose: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  waitForUnhandledRejections: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  watch: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  watchAll: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  watchman: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
  watchPlugins: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TString, _sinclair_typebox0.TTuple<[_sinclair_typebox0.TString, _sinclair_typebox0.TUnknown]>]>>>;
  workerIdleMemoryLimit: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TNumber, _sinclair_typebox0.TString]>>;
  workerThreads: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
}>;
type InitialOptions = Static<typeof InitialOptions>;
declare const FakeTimers: _sinclair_typebox0.TIntersect<[_sinclair_typebox0.TObject<{
  enableGlobally: _sinclair_typebox0.TOptional<_sinclair_typebox0.TBoolean>;
}>, _sinclair_typebox0.TUnion<[_sinclair_typebox0.TObject<{
  advanceTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TBoolean, _sinclair_typebox0.TNumber]>>;
  doNotFake: _sinclair_typebox0.TOptional<_sinclair_typebox0.TArray<_sinclair_typebox0.TUnion<[_sinclair_typebox0.TLiteral<"Date">, _sinclair_typebox0.TLiteral<"hrtime">, _sinclair_typebox0.TLiteral<"nextTick">, _sinclair_typebox0.TLiteral<"performance">, _sinclair_typebox0.TLiteral<"queueMicrotask">, _sinclair_typebox0.TLiteral<"requestAnimationFrame">, _sinclair_typebox0.TLiteral<"cancelAnimationFrame">, _sinclair_typebox0.TLiteral<"requestIdleCallback">, _sinclair_typebox0.TLiteral<"cancelIdleCallback">, _sinclair_typebox0.TLiteral<"setImmediate">, _sinclair_typebox0.TLiteral<"clearImmediate">, _sinclair_typebox0.TLiteral<"setInterval">, _sinclair_typebox0.TLiteral<"clearInterval">, _sinclair_typebox0.TLiteral<"setTimeout">, _sinclair_typebox0.TLiteral<"clearTimeout">]>>>;
  now: _sinclair_typebox0.TOptional<_sinclair_typebox0.TInteger>;
  timerLimit: _sinclair_typebox0.TOptional<_sinclair_typebox0.TNumber>;
  legacyFakeTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TLiteral<false>>;
}>, _sinclair_typebox0.TObject<{
  legacyFakeTimers: _sinclair_typebox0.TOptional<_sinclair_typebox0.TLiteral<true>>;
}>]>]>;
type FakeTimers = Static<typeof FakeTimers>;
//#endregion
export { FakeTimers, InitialOptions, SnapshotFormat };
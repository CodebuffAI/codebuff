import { SnapshotFormat } from "@jest/schemas";

//#region src/types.d.ts

type Colors = {
  comment: {
    close: string;
    open: string;
  };
  content: {
    close: string;
    open: string;
  };
  prop: {
    close: string;
    open: string;
  };
  tag: {
    close: string;
    open: string;
  };
  value: {
    close: string;
    open: string;
  };
};
type Indent = (arg0: string) => string;
type Refs = Array<unknown>;
type Print = (arg0: unknown) => string;
type Theme = Options['theme'];
type CompareKeys = ((a: string, b: string) => number) | null | undefined;
type RequiredOptions = Required<PrettyFormatOptions>;
interface Options extends Omit<RequiredOptions, 'compareKeys' | 'theme'> {
  compareKeys: CompareKeys;
  theme: Required<RequiredOptions['theme']>;
}
interface PrettyFormatOptions extends Omit<SnapshotFormat, 'compareKeys'> {
  compareKeys?: CompareKeys;
  plugins?: Plugins;
}
type OptionsReceived = PrettyFormatOptions;
type Config = {
  callToJSON: boolean;
  compareKeys: CompareKeys;
  colors: Colors;
  escapeRegex: boolean;
  escapeString: boolean;
  indent: string;
  maxDepth: number;
  maxWidth: number;
  min: boolean;
  plugins: Plugins;
  printBasicPrototype: boolean;
  printFunctionName: boolean;
  spacingInner: string;
  spacingOuter: string;
};
type Printer = (val: unknown, config: Config, indentation: string, depth: number, refs: Refs, hasCalledToJSON?: boolean) => string;
type Test = (arg0: any) => boolean;
type NewPlugin = {
  serialize: (val: any, config: Config, indentation: string, depth: number, refs: Refs, printer: Printer) => string;
  test: Test;
};
type PluginOptions = {
  edgeSpacing: string;
  min: boolean;
  spacing: string;
};
type OldPlugin = {
  print: (val: unknown, print: Print, indent: Indent, options: PluginOptions, colors: Colors) => string;
  test: Test;
};
type Plugin = NewPlugin | OldPlugin;
type Plugins = Array<Plugin>;
//#endregion
//#region src/index.d.ts
declare const DEFAULT_OPTIONS: {
  callToJSON: true;
  compareKeys: undefined;
  escapeRegex: false;
  escapeString: true;
  highlight: false;
  indent: number;
  maxDepth: number;
  maxWidth: number;
  min: false;
  plugins: never[];
  printBasicPrototype: true;
  printFunctionName: true;
  theme: Required<{
    comment?: string | undefined;
    content?: string | undefined;
    prop?: string | undefined;
    tag?: string | undefined;
    value?: string | undefined;
  }>;
};
/**
 * Returns a presentation string of your `val` object
 * @param val any potential JavaScript object
 * @param options Custom settings
 */
declare function format(val: unknown, options?: OptionsReceived): string;
declare const plugins: {
  AsymmetricMatcher: NewPlugin;
  DOMCollection: NewPlugin;
  DOMElement: NewPlugin;
  Immutable: NewPlugin;
  ReactElement: NewPlugin;
  ReactTestComponent: NewPlugin;
};
//#endregion
export { Colors, CompareKeys, Config, DEFAULT_OPTIONS, NewPlugin, OldPlugin, Options, OptionsReceived, Plugin, Plugins, PrettyFormatOptions, Printer, Refs, Theme, format as default, format, plugins };
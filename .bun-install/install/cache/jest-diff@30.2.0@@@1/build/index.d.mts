import { CompareKeys } from "pretty-format";

//#region src/cleanupSemantic.d.ts

/**
 * Diff Match and Patch
 * Copyright 2018 The diff-match-patch Authors.
 * https://github.com/google/diff-match-patch
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @fileoverview Computes the difference between two texts to create a patch.
 * Applies the patch onto another text, allowing for errors.
 * @author fraser@google.com (Neil Fraser)
 */
/**
 * CHANGES by pedrottimark to diff_match_patch_uncompressed.ts file:
 *
 * 1. Delete anything not needed to use diff_cleanupSemantic method
 * 2. Convert from prototype properties to var declarations
 * 3. Convert Diff to class from constructor and prototype
 * 4. Add type annotations for arguments and return values
 * 5. Add exports
 */
/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
declare var DIFF_DELETE: number;
declare var DIFF_INSERT: number;
declare var DIFF_EQUAL: number;
/**
 * Class representing one diff tuple.
 * Attempts to look like a two-element array (which is what this used to be).
 * @param {number} op Operation, one of: DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL.
 * @param {string} text Text to be deleted, inserted, or retained.
 * @constructor
 */
declare class Diff {
  0: number;
  1: string;
  constructor(op: number, text: string);
}
/**
 * Reduce the number of edits by eliminating semantically trivial equalities.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
//#endregion
//#region src/types.d.ts
type DiffOptionsColor = (arg: string) => string;
type DiffOptions = {
  aAnnotation?: string;
  aColor?: DiffOptionsColor;
  aIndicator?: string;
  bAnnotation?: string;
  bColor?: DiffOptionsColor;
  bIndicator?: string;
  changeColor?: DiffOptionsColor;
  changeLineTrailingSpaceColor?: DiffOptionsColor;
  commonColor?: DiffOptionsColor;
  commonIndicator?: string;
  commonLineTrailingSpaceColor?: DiffOptionsColor;
  contextLines?: number;
  emptyFirstOrLastLinePlaceholder?: string;
  expand?: boolean;
  includeChangeCounts?: boolean;
  omitAnnotationLines?: boolean;
  patchColor?: DiffOptionsColor;
  compareKeys?: CompareKeys;
};
//#endregion
//#region src/diffLines.d.ts
declare const diffLinesUnified: (aLines: Array<string>, bLines: Array<string>, options?: DiffOptions) => string;
declare const diffLinesUnified2: (aLinesDisplay: Array<string>, bLinesDisplay: Array<string>, aLinesCompare: Array<string>, bLinesCompare: Array<string>, options?: DiffOptions) => string;
declare const diffLinesRaw: (aLines: Array<string>, bLines: Array<string>) => Array<Diff>;
//#endregion
//#region src/printDiffs.d.ts
declare const diffStringsUnified: (a: string, b: string, options?: DiffOptions) => string;
declare const diffStringsRaw: (a: string, b: string, cleanup: boolean) => Array<Diff>;
//#endregion
//#region src/index.d.ts
declare function diff(a: any, b: any, options?: DiffOptions): string | null;
//#endregion
export { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, Diff, DiffOptions, DiffOptionsColor, diff, diffLinesRaw, diffLinesUnified, diffLinesUnified2, diffStringsRaw, diffStringsUnified };
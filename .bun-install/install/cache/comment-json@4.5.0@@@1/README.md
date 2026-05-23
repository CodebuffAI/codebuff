[![Build Status](https://github.com/kaelzhang/node-comment-json/actions/workflows/nodejs.yml/badge.svg)](https://github.com/kaelzhang/node-comment-json/actions/workflows/nodejs.yml)
[![Coverage](https://codecov.io/gh/kaelzhang/node-comment-json/branch/master/graph/badge.svg)](https://codecov.io/gh/kaelzhang/node-comment-json)
[![npm module downloads per month](http://img.shields.io/npm/dm/comment-json.svg)](https://www.npmjs.org/package/comment-json)
<!-- optional appveyor tst
[![Windows Build Status](https://ci.appveyor.com/api/projects/status/github/kaelzhang/node-comment-json?branch=master&svg=true)](https://ci.appveyor.com/project/kaelzhang/node-comment-json)
-->
<!-- optional npm version
[![NPM version](https://badge.fury.io/js/comment-json.svg)](http://badge.fury.io/js/comment-json)
-->
<!-- optional dependency status
[![Dependency Status](https://david-dm.org/kaelzhang/node-comment-json.svg)](https://david-dm.org/kaelzhang/node-comment-json)
-->

# comment-json

Parse and stringify JSON with comments. It will retain comments even after saved!

- [Parse](#parse) JSON strings with comments into JavaScript objects and MAINTAIN comments
  - supports comments everywhere, yes, **EVERYWHERE** in a JSON file, eventually 😆
  - fixes the known issue about comments inside arrays.
- [Stringify](#stringify) the objects into JSON strings with comments if there are

The usage of `comment-json` is exactly the same as the vanilla [`JSON`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON) object.

## Table of Contents

- [Why](#why) and [How](#how)
- [Usage and examples](#usage)
- API reference
  - [parse](#parse)
  - [stringify](#stringify)
  - [assign](#assigntarget-object-source-object-keys-array)
  - [moveComments](#movecommentssource-object-target-object-from-object-to-object-override-boolean)
  - [removeComments](#removecommentstarget-object-location-object)
  - [CommentArray](#commentarray)
- [Change Logs](https://github.com/kaelzhang/node-comment-json/releases)

## Why?

There are many other libraries that can deal with JSON with comments, such as [json5](https://npmjs.org/package/json5), or [strip-json-comments](https://npmjs.org/package/strip-json-comments), but none of them can stringify the parsed object and return back a JSON string the same as the original content.

Imagine that if the user settings are saved in `${library}.json`， and the user has written a lot of comments to improve readability. If the library `library` need to modify the user setting, such as modifying some property values and adding new fields, and if the library uses `json5` to read the settings, all comments will disappear after modified which will drive people insane.

So, **if you want to parse a JSON string with comments, modify it, then save it back**, `comment-json` is your must choice!

## How?

`comment-json` parse JSON strings with comments and save comment tokens into [symbol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) properties.

For JSON array with comments, `comment-json` extends the vanilla `Array` object into [`CommentArray`](#commentarray) whose instances could handle comments changes even after a comment array is modified.

## Install

```sh
$ npm i comment-json
```

~~For TypeScript developers, [`@types/comment-json`](https://www.npmjs.com/package/@types/comment-json) could be used~~

Since `2.4.1`, `comment-json` contains typescript declarations, so you might as well remove `@types/comment-json`.

## Usage

package.json:

```js
{
  // package name
  "name": "comment-json"
}
```

```js
const {
  parse,
  stringify,
  assign,
  moveComments,
  removeComments
} = require('comment-json')
const fs = require('fs')

const obj = parse(fs.readFileSync('package.json').toString())

console.log(obj.name) // comment-json

stringify(obj, null, 2)
// Will be the same as package.json, Oh yeah! 😆
// which will be very useful if we use a json file to store configurations.
```

### Sort keys

It is a common use case to sort the keys of a JSON file

```js
const parsed = parse(`{
  // b
  "b": 2,
  // a
  "a": 1
}`)

// Copy the properties including comments from `parsed` to the new object `{}`
// according to the sequence of the given keys
const sorted = assign(
  {},
  parsed,
  // You could also use your custom sorting function
  Object.keys(parsed).sort()
)

console.log(stringify(sorted, null, 2))
// {
//   // a
//   "a": 1,
//   // b
//   "b": 2
// }
```

For details about `assign`, see [here](#assigntarget-object-source-object-keys-array).

## parse()

```ts
parse(text, reviver? = null, remove_comments? = false)
  : object | string | number | boolean | null
```

- **text** `string` The string to parse as JSON. See the [JSON](http://json.org/) object for a description of JSON syntax.
- **reviver?** `Function() | null` Default to `null`. It acts the same as the second parameter of [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse). If a function, prescribes how the value originally produced by parsing is transformed, before being returned.
  - `comment-json` also passes the 3rd parameter `context` to the function `reviver`, as described in https://github.com/tc39/proposal-json-parse-with-source, which will be useful to parse a JSON string with `BigInt` values.
- **remove_comments?** `boolean = false` If true, the comments won't be maintained, which is often used when we want to get a clean object.

Returns `CommentJSONValue` (`object | string | number | boolean | null`) corresponding to the given JSON text.

If the `content` is:

```js
/**
 before-all
 */
// before-all
{ // before:foo
  // before:foo
  /* before:foo */
  "foo" /* after-prop:foo */: // after-colon:foo
  1 // after-value:foo
  // after-value:foo
  , // after:foo
  // before:bar
  "bar": [ // before:0
    // before:0
    "baz" // after-value:0
    // after-value:0
    , // after:0
    "quux"
    // after:1
  ] // after:bar
  // after:bar
}
// after-all
```

```js
const {inspect} = require('util')

const parsed = parse(content)

console.log(
  inspect(parsed, {
    // Since 4.0.0, symbol properties of comments are not enumerable,
    // use `showHidden: true` to print them
    showHidden: true
  })
)

console.log(Object.keys(parsed))
// > ['foo', 'bar']

console.log(stringify(parsed, null, 2))
// 🚀 Exact as the content above! 🚀
```

And the value of `parsed` will be:

```js
{
  // Comments before the JSON object
  [Symbol.for('before-all')]: [{
    type: 'BlockComment',
    value: '\n before-all\n ',
    inline: false,
    loc: {
      // The start location of `/**`
      start: {
        line: 1,
        column: 0
      },
      // The end location of `*/`
      end: {
        line: 3,
        column: 3
      }
    }
  }, {
    type: 'LineComment',
    value: ' before-all',
    inline: false,
    loc: ...
  }],
  ...

  [Symbol.for('after-prop:foo')]: [{
    type: 'BlockComment',
    value: ' after-prop:foo ',
    inline: true,
    loc: ...
  }],

  // The real value
  foo: 1,
  bar: [
    "baz",
    "quux",

    // The property of the array
    [Symbol.for('after-value:0')]: [{
      type: 'LineComment',
      value: ' after-value:0',
      inline: true,
    loc: ...
    }, ...],
    ...
  ]
}
```

There are **NINE** kinds of symbol properties:

```js
// Comments before everything
Symbol.for('before-all')

// If all things inside an object or an array are comments
Symbol.for('before')

// comment tokens before
// - a property of an object
// - an item of an array
// and after the previous comma(`,`) or the opening bracket(`{` or `[`)
Symbol.for(`before:${prop}`)

// comment tokens after property key `prop` and before colon(`:`)
Symbol.for(`after-prop:${prop}`)

// comment tokens after the colon(`:`) of property `prop` and before property value
Symbol.for(`after-colon:${prop}`)

// comment tokens after
// - the value of property `prop` inside an object
// - the item of index `prop` inside an array
// and before the next key-value/item delimiter(`,`)
// or the closing bracket(`}` or `]`)
Symbol.for(`after-value:${prop}`)

// comment tokens after
// - comma(`,`)
// - the value of property `prop` if it is the last property
Symbol.for(`after:${prop}`)

// Always at the inner end of an object or an array,
// only used for stringification
Symbol.for('after')

// Comments after everything
Symbol.for('after-all')
```

And the value of each symbol property is an **array** of `CommentToken`

```ts
interface CommentToken {
  type: 'BlockComment' | 'LineComment'
  // The content of the comment, including whitespaces and line breaks
  value: string
  // If the start location is the same line as the previous token,
  // then `inline` is `true`
  inline: boolean

  // But pay attention that,
  // locations will NOT be maintained when stringified
  loc: CommentLocation
}

interface CommentLocation {
  // The start location begins at the `//` or `/*` symbol
  start: Location
  // The end location of multi-line comment ends at the `*/` symbol
  end: Location
}

interface Location {
  line: number
  column: number
}
```

### Query comments in TypeScript

`comment-json` provides a `symbol`-type called `CommentSymbol` which can be used for querying comments.
Furthermore, a type `CommentDescriptor` is provided for enforcing properly formatted symbol names:

```ts
import {
  CommentDescriptor, CommentSymbol, parse, CommentArray
} from 'comment-json'

const parsed = parse(`{ /* test */ "foo": "bar" }`)
 // typescript only allows properly formatted symbol names here
const symbolName: CommentDescriptor = 'before:foo'

console.log((parsed as CommentArray<string>)[Symbol.for(symbolName) as CommentSymbol][0].value)
```

In this example, casting to `Symbol.for(symbolName)` to `CommentSymbol` is mandatory.
Otherwise, TypeScript won't detect that you're trying to query comments.

### Parse into an object without comments

```js
console.log(parse(content, null, true))
```

And the result will be:

```js
{
  foo: 1,
  bar: [
    "baz",
    "quux"
  ]
}
```

### Special cases

```js
const parsed = parse(`
// comment
1
`)

console.log(parsed === 1)
// false
```

If we parse a JSON of primative type with `remove_comments:false`, then the return value of `parse()` will be of object type.

The value of `parsed` is equivalent to:

```js
const parsed = new Number(1)

parsed[Symbol.for('before-all')] = [{
  type: 'LineComment',
  value: ' comment',
  inline: false,
  loc: ...
}]
```

Which is similar for:

- `Boolean` type
- `String` type

For example

```js
const parsed = parse(`
"foo" /* comment */
`)
```

Which is equivalent to

```js
const parsed = new String('foo')

parsed[Symbol.for('after-all')] = [{
  type: 'BlockComment',
  value: ' comment ',
  inline: true,
  loc: ...
}]
```

But there is one exception:

```js
const parsed = parse(`
// comment
null
`)

console.log(parsed === null) // true
```

## stringify()

```ts
stringify(object: any, replacer?, space?): string
```

The arguments are the same as the vanilla [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify).

And it does the similar thing as the vanilla one, but also deal with extra properties and convert them into comments.

```js
console.log(stringify(parsed, null, 2))
// Exactly the same as `content`
```

#### space

If space is not specified, or the space is an empty string, the result of `stringify()` will have no comments.

For the case above:

```js
console.log(stringify(result)) // {"a":1}
console.log(stringify(result, null, 2)) // is the same as `code`
```

## assign(target: object, source?: object, keys?: Array<string>)

- **target** `object` the target object
- **source?** `object` the source object. This parameter is optional but it is silly to not pass this argument.
- **keys?** `Array<string>` If not specified, all enumerable own properties of `source` will be used.

This method is used to copy the enumerable own properties and their corresponding comment symbol properties to the target object.

```js
const parsed = parse(`// before all
{
  // This is a comment
  "foo": "bar"
}`)

const obj = assign({
  bar: 'baz'
}, parsed)

stringify(obj, null, 2)
// // before all
// {
//   "bar": "baz",
//   // This is a comment
//   "foo": "bar"
// }
```

### Special cases about `keys`

But if argument `keys` is specified and is not empty, then comment ` before all`, which belongs to non-properties, will **NOT** be copied.

```js
const obj = assign({
  bar: 'baz'
}, parsed, ['foo'])

stringify(obj, null, 2)
// {
//   "bar": "baz",
//   // This is a comment
//   "foo": "bar"
// }
```

Specifying the argument `keys` as an empty array indicates that it will only copy non-property symbols of comments

```js
const obj = assign({
  bar: 'baz'
}, parsed, [])

stringify(obj, null, 2)
// // before all
// {
//   "bar": "baz",
// }
```

Non-property symbols include:

```js
Symbol.for('before-all')
Symbol.for('before')
Symbol.for('after')      // only for stringify
Symbol.for('after-all')
```

## moveComments(source: object, target?: object, from: object, to: object, override?: boolean)

- **source** `object` The source object containing comments to move.
- **target?** `object` The target object to move comments to. If not provided, defaults to source (move within same object).
- **from** `object` The source comment location.
  - **from.where** `CommentPrefix` The comment position (e.g., 'before', 'after', 'before-all', etc.).
  - **from.key?** `string` The property key for property-specific comments. Omit for non-property comments.
- **to** `object` The target comment location.
  - **to.where** `CommentPrefix` The comment position (e.g., 'before', 'after', 'before-all', etc.).
  - **to.key?** `string` The property key for property-specific comments. Omit for non-property comments.
- **override?** `boolean = false` Whether to override existing comments at the target location. If false, comments will be appended.

This method is used to move comments from one location to another within objects. It's particularly useful when you need to reorganize comments or move them between different comment positions.

```js
const {parse, stringify, moveComments} = require('comment-json')

const obj = parse(`{
  "foo": 1, // comment after foo
  "bar": 2
}`)

// Move comment from `after 'foo'` to `after`
moveComments(obj, obj,
  { where: 'after', key: 'foo' },
  { where: 'after' }
)

obj.baz = 3

console.log(stringify(obj, null, 2))
// {
//   "foo": 1,
//   "bar": 2,
//   "baz": 3
// // comment after foo
// }
```

### Moving non-property comments

```js
const obj = parse(`// top comment
{
  "foo": 1
}`)

// Move top comment to bottom
moveComments(obj, obj,
  { kind: 'before-all' },
  { kind: 'after-all' }
)

console.log(stringify(obj, null, 2))
// {
//   "foo": 1
// }
// // top comment
```

### Moving comments between objects

```js
const source = parse(`{
  "foo": 1 // source comment
}`)

const target = { bar: 2 }

// Move comment from source to target
moveComments(source, target,
  { kind: 'after-value', key: 'foo' },
  { kind: 'before', key: 'bar' }
)

console.log(stringify(target, null, 2))
// {
//   // source comment
//   "bar": 2
// }
```

### Appending vs overriding comments

```js
const obj = parse(`{
  // existing comment
  "foo": 1, // another comment
  "bar": 2
}`)

// By default, comments are appended (override = false)
moveComments(obj, obj,
  { kind: 'after-value', key: 'foo' },
  { kind: 'before', key: 'foo' }
)

console.log(stringify(obj, null, 2))
// {
//   // existing comment
//   // another comment
//   "foo": 1,
//   "bar": 2
// }

// With override = true, existing comments are replaced
moveComments(obj, obj,
  { kind: 'before', key: 'bar' },
  { kind: 'before', key: 'foo' },
  true // override existing comments
)
```

## removeComments(target: object, location: object)

- **target** `object` The target object to remove comments from.
- **location** `object` The comment location to remove.
  - **location.where** `CommentPrefix` The comment position (e.g., 'before', 'after', 'before-all', etc.).
  - **location.key?** `string` The property key for property-specific comments. Omit for non-property comments.

This method is used to remove comments from a specific location within objects. It's useful for cleaning up comments or removing unwanted comment annotations.

### Basic usage

```js
const {parse, stringify, removeComments} = require('comment-json')

const obj = parse(`{
  // comment before foo
  "foo": 1, // comment after foo
  "bar": 2
}`)

// Remove comment before 'foo'
removeComments(obj, { where: 'before', key: 'foo' })

console.log(stringify(obj, null, 2))
// {
//   "foo": 1, // comment after foo
//   "bar": 2
// }
```

### Removing non-property comments

```js
const obj = parse(`// top comment
{
  "foo": 1
}
// bottom comment`)

// Remove top comment
removeComments(obj, { where: 'before-all' })

// Remove bottom comment
removeComments(obj, { where: 'after-all' })

console.log(stringify(obj, null, 2))
// {
//   "foo": 1
// }
```

## `CommentArray`

> Advanced Section

All arrays of the parsed object are `CommentArray`s.

The constructor of `CommentArray` could be accessed by:

```js
const {CommentArray} = require('comment-json')
```

If we modify a comment array, its comment symbol properties could be handled automatically.

```js
const parsed = parse(`{
  "foo": [
    // bar
    "bar",
    // baz,
    "baz"
  ]
}`)

parsed.foo.unshift('qux')

stringify(parsed, null, 2)
// {
//   "foo": [
//     "qux",
//     // bar
//     "bar",
//     // baz
//     "baz"
//   ]
// }
```

Oh yeah! 😆

But pay attention, if you reassign the property of a comment array with a normal array, all comments will be gone:

```js
parsed.foo = ['quux'].concat(parsed.foo)
stringify(parsed, null, 2)
// {
//   "foo": [
//     "quux",
//     "qux",
//     "bar",
//     "baz"
//   ]
// }

// Whoooops!! 😩 Comments are gone
```

Instead, we should:

```js
parsed.foo = new CommentArray('quux').concat(parsed.foo)
stringify(parsed, null, 2)
// {
//   "foo": [
//     "quux",
//     "qux",
//     // bar
//     "bar",
//     // baz
//     "baz"
//   ]
// }
```

## Special Cases about Trailing Comma

If we have a JSON string `str`

```js
{
  "foo": "bar", // comment
}
```

```js
// When stringify, trailing commas will be eliminated
const stringified = stringify(parse(str), null, 2)
console.log(stringified)
```

And it will print:

```js
{
  "foo": "bar" // comment
}
```

## Dealing with `BigInt`s

> Advanced Section

`comment-json` implements the TC39 proposal [proposal-json-parse-with-source](https://github.com/tc39/proposal-json-parse-with-source)

```js
const {parse, stringify} = require('comment-json')

const parsed = parse(
  `{"foo": 9007199254740993}`,
  // The reviver function now has a 3rd param that contains the string source.
  (key, value, {source}) =>
    /^[0-9]+$/.test(source) ? BigInt(source) : value
)

console.log(parsed)
// {
//   "foo": 9007199254740993n
// }

stringify(parsed, (key, val) =>
  typeof value === 'bigint'
    // Pay attention that
    //   JSON.rawJSON is supported in node >= 21
    ? JSON.rawJSON(String(val))
    : value
)
// {"foo":9007199254740993}
```

## License

[MIT](LICENSE)

## Change Logs

See [releases](https://github.com/kaelzhang/node-comment-json/releases)

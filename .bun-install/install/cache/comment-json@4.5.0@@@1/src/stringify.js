const {
  isArray, isObject, isFunction, isNumber, isString
} = require('core-util-is')

const {
  PREFIX_BEFORE_ALL,
  PREFIX_BEFORE,
  PREFIX_AFTER_PROP,
  PREFIX_AFTER_COLON,
  PREFIX_AFTER_VALUE,
  PREFIX_AFTER,
  PREFIX_AFTER_ALL,

  BRACKET_OPEN,
  BRACKET_CLOSE,
  CURLY_BRACKET_OPEN,
  CURLY_BRACKET_CLOSE,
  COLON,
  COMMA,
  EMPTY,

  UNDEFINED,

  is_raw_json
} = require('./common')

// eslint-disable-next-line no-control-regex, no-misleading-character-class
const ESCAPABLE = /[\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g

// String constants
const SPACE = ' '
const LF = '\n'
const STR_NULL = 'null'

// Symbol tags
const BEFORE = prop => `${PREFIX_BEFORE}:${prop}`
const AFTER_PROP = prop => `${PREFIX_AFTER_PROP}:${prop}`
const AFTER_COLON = prop => `${PREFIX_AFTER_COLON}:${prop}`
const AFTER_VALUE = prop => `${PREFIX_AFTER_VALUE}:${prop}`
const AFTER = prop => `${PREFIX_AFTER}:${prop}`

// table of character substitutions
const meta = {
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\f': '\\f',
  '\r': '\\r',
  '"': '\\"',
  '\\': '\\\\'
}

const escape = string => {
  ESCAPABLE.lastIndex = 0

  if (!ESCAPABLE.test(string)) {
    return string
  }

  return string.replace(ESCAPABLE, a => {
    const c = meta[a]
    return typeof c === 'string'
      ? c
      : a
  })
}

// Escape no control characters, no quote characters,
// and no backslash characters,
// then we can safely slap some quotes around it.
const quote = string => `"${escape(string)}"`
const comment_stringify = (value, line) => line
  ? `//${value}`
  : `/*${value}*/`

// display_block `boolean` whether the
//   WHOLE block of comments is always a block group
const process_comments = (host, symbol_tag, deeper_gap, display_block) => {
  const comments = host[Symbol.for(symbol_tag)]
  if (!comments || !comments.length) {
    return EMPTY
  }

  let is_line_comment = false

  const str = comments.reduce((prev, {
    inline,
    type,
    value
  }) => {
    const delimiter = inline
      ? SPACE
      : LF + deeper_gap

    is_line_comment = type === 'LineComment'

    return prev + delimiter + comment_stringify(value, is_line_comment)
  }, EMPTY)

  return display_block
  // line comment should always end with a LF
  || is_line_comment
    ? str + LF + deeper_gap
    : str
}

let replacer = null
let indent = EMPTY

const clean = () => {
  replacer = null
  indent = EMPTY
}

const join = (one, two, gap) =>
  one
    ? two
      // Symbol.for('before') and Symbol.for('before:prop')
      // might both exist if user mannually add comments to the object
      // and make a mistake.
      // SO, we are not to only trimRight but trim for both sides
      ? one + two.trim() + LF + gap
      : one.trimRight() + LF + gap
    : two
      ? two.trimRight() + LF + gap
      : EMPTY

const join_content = (inside, value, gap) => {
  const comment = process_comments(value, PREFIX_BEFORE, gap + indent, true)

  return join(comment, inside, gap)
}

// | deeper_gap   |
// | gap | indent |
//       [
//                "foo",
//                "bar"
//       ]
const array_stringify = (value, gap) => {
  const deeper_gap = gap + indent

  const {length} = value

  // From the item to before close
  let inside = EMPTY
  let after_comma = EMPTY

  // Never use Array.prototype.forEach,
  // that we should iterate all items
  for (let i = 0; i < length; i ++) {
    if (i !== 0) {
      inside += COMMA
    }

    const before = join(
      after_comma,
      process_comments(value, BEFORE(i), deeper_gap),
      deeper_gap
    )

    inside += before || (LF + deeper_gap)

    // JSON.stringify([undefined])  => [null]
    inside += stringify(i, value, deeper_gap) || STR_NULL

    inside += process_comments(value, AFTER_VALUE(i), deeper_gap)

    after_comma = process_comments(value, AFTER(i), deeper_gap)
  }

  inside += join(
    after_comma,
    process_comments(value, PREFIX_AFTER, deeper_gap),
    deeper_gap
  )

  return BRACKET_OPEN
   + join_content(inside, value, gap)
   + BRACKET_CLOSE
}

// | deeper_gap   |
// | gap | indent |
//       {
//                "foo": 1,
//                "bar": 2
//       }
const object_stringify = (value, gap) => {
  // Due to a specification blunder in ECMAScript, typeof null is 'object',
  // so watch out for that case.
  if (!value) {
    return 'null'
  }

  const deeper_gap = gap + indent

  // From the first element to before close
  let inside = EMPTY
  let after_comma = EMPTY
  let first = true

  const keys = isArray(replacer)
    ? replacer
    : Object.keys(value)

  const iteratee = key => {
    // Stringified value
    const sv = stringify(key, value, deeper_gap)

    // If a value is undefined, then the key-value pair should be ignored
    if (sv === UNDEFINED) {
      return
    }

    // The treat ment
    if (!first) {
      inside += COMMA
    }

    first = false

    const before = join(
      after_comma,
      process_comments(value, BEFORE(key), deeper_gap),
      deeper_gap
    )

    inside += before || (LF + deeper_gap)

    inside += quote(key)
    + process_comments(value, AFTER_PROP(key), deeper_gap)
    + COLON
    + process_comments(value, AFTER_COLON(key), deeper_gap)
    + SPACE
    + sv
    + process_comments(value, AFTER_VALUE(key), deeper_gap)

    after_comma = process_comments(value, AFTER(key), deeper_gap)
  }

  keys.forEach(iteratee)

  // if (after_comma) {
  //   inside += COMMA
  // }

  inside += join(
    after_comma,
    process_comments(value, PREFIX_AFTER, deeper_gap),
    deeper_gap
  )

  return CURLY_BRACKET_OPEN
  + join_content(inside, value, gap)
  + CURLY_BRACKET_CLOSE
}

// @param {string} key
// @param {Object} holder
// @param {function()|Array} replacer
// @param {string} indent
// @param {string} gap
function stringify (key, holder, gap) {
  let value = holder[key]

  // If the value has a toJSON method, call it to obtain a replacement value.
  if (isObject(value) && isFunction(value.toJSON)) {
    value = value.toJSON(key)
  }

  // If we were called with a replacer function, then call the replacer to
  // obtain a replacement value.
  if (isFunction(replacer)) {
    value = replacer.call(holder, key, value)
  }

  switch (typeof value) {
  case 'string':
    return quote(value)

  case 'number':
    // JSON numbers must be finite. Encode non-finite numbers as null.
    return Number.isFinite(value) ? String(value) : STR_NULL

  case 'boolean':
  case 'null':

    // If the value is a boolean or null, convert it to a string. Note:
    // typeof null does not produce 'null'. The case is included here in
    // the remote chance that this gets fixed someday.
    return String(value)

  // If the type is 'object', we might be dealing with an object or an array or
  // null.
  case 'object':
    if (is_raw_json(value)) {
      return value.rawJSON
    }

    return isArray(value)
      ? array_stringify(value, gap)
      : object_stringify(value, gap)

  // undefined
  default:
    // JSON.stringify(undefined) === undefined
    // JSON.stringify('foo', () => undefined) === undefined
  }
}

const get_indent = space => isString(space)
  // If the space parameter is a string, it will be used as the indent string.
  ? space
  : isNumber(space)
    ? SPACE.repeat(space)
    : EMPTY

const {toString} = Object.prototype
const PRIMITIVE_OBJECT_TYPES = [
  '[object Number]',
  '[object String]',
  '[object Boolean]'
]

const is_primitive_object = subject => {
  if (typeof subject !== 'object') {
    return false
  }

  const str = toString.call(subject)
  return PRIMITIVE_OBJECT_TYPES.includes(str)
}

/**
 * Converts a JavaScript value to a JavaScript Object Notation (JSON) string
 * with comments preserved.
 *
 * @param {*} value A JavaScript value, usually an object or array, to be
 *   converted.
 * @param {function|Array|null} [replacer_] A function that transforms the
 *   results or an array of strings and numbers that acts as an approved list
 *   for selecting the object properties that will be stringified.
 * @param {string|number} [space] Adds indentation, white space, and line
 *   break characters to the return-value JSON text to make it easier to read.
 * @returns {string} A JSON string representing the given value with comments
 *   preserved.
 *
 * @example
 * const obj = parse('{"a": 1 // comment}')
 * stringify(obj, null, 2)
 * // Returns: '{\n  "a": 1 // comment\n}'
 *
 * @example
 * // With replacer function
 * stringify(obj, (key, value) => typeof value === 'number' ? value * 2 : value)
 *
 * @example
 * // With replacer array
 * stringify(obj, ['a', 'b']) // Only include 'a' and 'b' properties
 */
module.exports = (value, replacer_, space) => {
  // The stringify method takes a value and an optional replacer, and an optional
  // space parameter, and returns a JSON text. The replacer can be a function
  // that can replace values, or an array of strings that will select the keys.
  // A default replacer method can be provided. Use of the space parameter can
  // produce text that is more easily readable.

  // If the space parameter is a number, make an indent string containing that
  // many spaces.
  const indent_ = get_indent(space)

  if (!indent_) {
    return JSON.stringify(value, replacer_)
  }

  // vanilla `JSON.parse` allow invalid replacer
  if (!isFunction(replacer_) && !isArray(replacer_)) {
    replacer_ = null
  }

  replacer = replacer_
  indent = indent_

  const str = is_primitive_object(value)
    ? JSON.stringify(value)
    : stringify('', {'': value}, EMPTY)

  clean()

  return isObject(value)
    ? process_comments(value, PREFIX_BEFORE_ALL, EMPTY, true).trimLeft()
      + str
      + process_comments(value, PREFIX_AFTER_ALL, EMPTY).trimRight()
    : str
}

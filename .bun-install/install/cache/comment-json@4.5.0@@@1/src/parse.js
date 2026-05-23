// JSON formatting

const esprima = require('esprima')

const {
  CommentArray,
} = require('./array')

const {
  PREFIX_BEFORE,
  PREFIX_AFTER_PROP,
  PREFIX_AFTER_COLON,
  PREFIX_AFTER_VALUE,
  PREFIX_AFTER,

  PREFIX_BEFORE_ALL,
  PREFIX_AFTER_ALL,

  BRACKET_OPEN,
  BRACKET_CLOSE,
  CURLY_BRACKET_OPEN,
  CURLY_BRACKET_CLOSE,

  COLON,
  COMMA,
  MINUS,
  EMPTY,

  UNDEFINED,

  define,
  assign_non_prop_comments
} = require('./common')

/**
 * Tokenize JSON string with comments into an array of tokens.
 *
 * @param {string} code The JSON string with comments to tokenize.
 * @returns {Array} Array of token objects containing type, value, and location
 *   information.
 *
 * @example
 * const tokens = tokenize('{"a": 1 // comment}')
 * // Returns array of tokens including comment tokens
 */
const tokenize = code => esprima.tokenize(code, {
  comment: true,
  loc: true
})

let current_code
const previous_hosts = []
let comments_host = null
let unassigned_comments = null

const previous_props = []
let last_prop

let remove_comments = false
let inline = false
let tokens = null
let last = null
let current = null
let index
let reviver = null

const clean = () => {
  current_code = UNDEFINED
  previous_props.length =
  previous_hosts.length = 0

  last = null
  last_prop = UNDEFINED
}

const free = () => {
  clean()

  tokens.length = 0

  unassigned_comments =
  comments_host =
  tokens =
  last =
  current =
  reviver = null

  current_code = UNDEFINED
}

const symbolFor = prefix => Symbol.for(
  last_prop !== UNDEFINED
    ? prefix + COLON + last_prop
    : prefix
)

const transform = (k, {value, context = {}}) => reviver
  ? reviver(k, value, context)
  : value

const unexpected = () => {
  const error = new SyntaxError(`Unexpected token '${current.value.slice(0, 1)}', "${current_code}" is not valid JSON`)
  Object.assign(error, current.loc.start)

  free()

  throw error
}

const unexpected_end = () => {
  const error = new SyntaxError('Unexpected end of JSON input')
  Object.assign(error, last
    ? last.loc.end
    // Empty string
    : {
      line: 1,
      column: 0
    })

  free()

  throw error
}

// Move the reader to the next
const next = () => {
  const new_token = tokens[++ index]
  inline = current
    && new_token
    && current.loc.end.line === new_token.loc.start.line
    || false

  last = current
  current = new_token
}

const type = () => {
  if (!current) {
    unexpected_end()
  }

  return current.type === 'Punctuator'
    ? current.value
    : current.type
}

const is = t => type() === t

const expect = a => {
  if (!is(a)) {
    unexpected()
  }
}

const set_comments_host = new_host => {
  previous_hosts.push(comments_host)
  comments_host = new_host
}

const restore_comments_host = () => {
  comments_host = previous_hosts.pop()
}

const assign_after_comments = () => {
  if (!unassigned_comments) {
    return
  }

  const after_comments = []

  for (const comment of unassigned_comments) {
    // If the comment is inline, then it is an after-comma comment
    if (comment.inline) {
      after_comments.push(comment)
    // Otherwise, all comments are before:<next-prop> comment
    } else {
      break
    }
  }

  const {length} = after_comments
  if (!length) {
    return
  }

  if (length === unassigned_comments.length) {
    // If unassigned_comments are all consumed
    unassigned_comments = null
  } else {
    unassigned_comments.splice(0, length)
  }

  define(comments_host, symbolFor(PREFIX_AFTER), after_comments)
}

const assign_comments = prefix => {
  if (!unassigned_comments) {
    return
  }

  define(comments_host, symbolFor(prefix), unassigned_comments)

  unassigned_comments = null
}

const parse_comments = prefix => {
  const comments = []

  while (
    current
    && (
      is('LineComment')
      || is('BlockComment')
    )
  ) {
    const comment = {
      ...current,
      inline
    }

    // delete comment.loc
    comments.push(comment)

    next()
  }

  if (remove_comments) {
    return
  }

  if (!comments.length) {
    return
  }

  if (prefix) {
    define(comments_host, symbolFor(prefix), comments)
    return
  }

  unassigned_comments = comments
}

const set_prop = (prop, push) => {
  if (push) {
    previous_props.push(last_prop)
  }

  last_prop = prop
}

const restore_prop = () => {
  last_prop = previous_props.pop()
}

const parse_object = () => {
  const obj = {}
  set_comments_host(obj)
  set_prop(UNDEFINED, true)

  let started = false
  let name

  parse_comments()

  while (!is(CURLY_BRACKET_CLOSE)) {
    if (started) {
      assign_comments(PREFIX_AFTER_VALUE)

      // key-value pair delimiter
      expect(COMMA)
      next()
      parse_comments()

      assign_after_comments()

      // If there is a trailing comma, we might reach the end
      // ```
      // {
      //   "a": 1,
      // }
      // ```
      if (is(CURLY_BRACKET_CLOSE)) {
        break
      }
    }

    started = true
    expect('String')
    name = JSON.parse(current.value)

    set_prop(name)
    assign_comments(PREFIX_BEFORE)

    next()
    parse_comments(PREFIX_AFTER_PROP)

    expect(COLON)

    next()
    parse_comments(PREFIX_AFTER_COLON)

    obj[name] = transform(name, walk())
    parse_comments()
  }

  if (started) {
    // If there are properties,
    // then the unassigned comments are after comments
    assign_comments(PREFIX_AFTER)
  }

  // bypass }
  next()
  last_prop = undefined

  if (!started) {
    // Otherwise, they are before comments
    assign_comments(PREFIX_BEFORE)
  }

  restore_comments_host()
  restore_prop()

  return obj
}

const parse_array = () => {
  const array = new CommentArray()
  set_comments_host(array)
  set_prop(UNDEFINED, true)

  let started = false
  let i = 0

  parse_comments()

  while (!is(BRACKET_CLOSE)) {
    if (started) {
      assign_comments(PREFIX_AFTER_VALUE)
      expect(COMMA)
      next()
      parse_comments()

      assign_after_comments()

      if (is(BRACKET_CLOSE)) {
        break
      }
    }

    started = true

    set_prop(i)
    assign_comments(PREFIX_BEFORE)

    array[i] = transform(i, walk())
    i ++

    parse_comments()
  }

  if (started) {
    assign_comments(PREFIX_AFTER)
  }

  next()
  last_prop = undefined

  if (!started) {
    assign_comments(PREFIX_BEFORE)
  }

  restore_comments_host()
  restore_prop()

  return array
}

function walk () {
  let tt = type()

  if (tt === CURLY_BRACKET_OPEN) {
    next()
    return {
      value: parse_object()
    }
  }

  if (tt === BRACKET_OPEN) {
    next()
    return {
      value: parse_array()
    }
  }

  let negative = EMPTY

  // -1
  if (tt === MINUS) {
    next()
    tt = type()
    negative = MINUS
  }

  let v
  let source

  switch (tt) {
  case 'String':
  case 'Boolean':
  case 'Null':
  case 'Numeric':
    v = current.value
    next()

    source = negative + v
    return {
      value: JSON.parse(source),
      context: {
        source
      }
    }
  default:
    // => unexpected token
    return {}
  }
}

const isObject = subject => Object(subject) === subject

/**
 * Converts a JavaScript Object Notation (JSON) string with comments into an
 * object.
 *
 * @param {string} code A valid JSON string with comments.
 * @param {function} [rev] A function that transforms the results. This function
 *   is called for each member of the object. If a member contains nested
 *   objects, the nested objects are transformed before the parent object is.
 * @param {boolean} [no_comments=false] If true, the comments won't be
 *   maintained, which is often used when we want to get a clean object.
 * @returns {*} The JavaScript object corresponding to the given JSON text with
 *   comments preserved as symbol properties.
 *
 * @example
 * const result = parse('{"a": 1 // This is a comment}')
 * // result.a === 1
 * // Comments are stored in symbol properties
 *
 * @example
 * // With reviver function
 * const result = parse('{"a": "1"}', (key, value) => {
 *   return typeof value === 'string' ? parseInt(value) : value
 * })
 *
 * @example
 * // Without comments
 * const clean = parse('{"a": 1 // comment}', null, true)
 * // Returns clean object without comment symbols
 */
const parse = (code, rev, no_comments) => {
  // Clean variables in closure
  clean()

  current_code = code
  tokens = tokenize(code)
  reviver = rev
  remove_comments = no_comments

  if (!tokens.length) {
    unexpected_end()
  }

  index = - 1
  next()

  set_comments_host({})

  parse_comments(PREFIX_BEFORE_ALL)

  const final = walk()

  parse_comments(PREFIX_AFTER_ALL)

  if (current) {
    unexpected()
  }

  // reviver
  let result = transform('', final)

  // We should run reviver before the checks below,
  // otherwise the comment info will be lost
  if (!no_comments && result !== null) {
    if (!isObject(result)) {
      // 1 -> new Number(1)
      // true -> new Boolean(1)
      // "foo" -> new String("foo")

      // eslint-disable-next-line no-new-object
      result = new Object(result)
    }

    assign_non_prop_comments(result, comments_host)
  }

  restore_comments_host()

  free()

  return result
}

module.exports = {
  parse,
  tokenize
}

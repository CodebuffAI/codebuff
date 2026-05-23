const {parse, tokenize} = require('./parse')
const stringify = require('./stringify')
const {CommentArray} = require('./array')
const {
  PREFIX_BEFORE,
  PREFIX_AFTER_PROP,
  PREFIX_AFTER_COLON,
  PREFIX_AFTER_VALUE,
  PREFIX_AFTER,

  PREFIX_BEFORE_ALL,
  PREFIX_AFTER_ALL,

  assign,
  moveComments,
  removeComments
} = require('./common')

module.exports = {
  PREFIX_BEFORE,
  PREFIX_AFTER_PROP,
  PREFIX_AFTER_COLON,
  PREFIX_AFTER_VALUE,
  PREFIX_AFTER,

  PREFIX_BEFORE_ALL,
  PREFIX_AFTER_ALL,

  parse,
  stringify,
  tokenize,

  CommentArray,
  assign,
  moveComments,
  removeComments
}

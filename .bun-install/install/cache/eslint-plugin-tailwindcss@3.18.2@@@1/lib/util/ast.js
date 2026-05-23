/**
 * @fileoverview Utility functions for AST
 */

'use strict';

const { separatorRegEx } = require('./regex');
// context.parserPath
// /.../eslint-plugin-tailwindcss/node_modules/espree/espree.js
// /.../eslint-plugin-tailwindcss/node_modules/@angular-eslint/template-parser/dist/index.js

const removeDuplicatesFromArray = require('./removeDuplicatesFromArray');

function calleeToString(calleeNode) {
  if (calleeNode.type === 'Identifier') {
    return calleeNode.name;
  }
  if (calleeNode.type === 'MemberExpression') {
    return `${calleeNode.object.name}.${calleeNode.property.name}`;
  }
}

/**
 * Find out if node is `class` or `className`
 *
 * @param {ASTNode} node The AST node being checked
 * @param {String} classRegex Regex to test the attribute that is being checked against
 * @returns {Boolean}
 */
function isClassAttribute(node, classRegex) {
  if (!node.name) {
    return false;
  }
  let name = '';
  switch (node.type) {
    case 'TextAttribute':
      name = node.name;
      break;
    case 'JSXAttribute':
      if (node.name.type === 'JSXNamespacedName') {
        const ns = node.name.namespace.name || '';
        name = (ns.length ? ns + ':' : '') + node.name.name.name;
      } else {
        name = node.name.name;
      }
      break;
    default:
      name = node.name.name;
  }
  return new RegExp(classRegex).test(name);
}

/**
 * Find out if node is `class`
 *
 * @param {ASTNode} node The AST node being checked
 * @param {String} classRegex Regex to test the attribute that is being checked against
 * @returns {Boolean}
 */
function isVueClassAttribute(node, classRegex) {
  const re = new RegExp(classRegex);
  let name = '';
  switch (true) {
    case node.key && node.key.name && re.test(node.key.name):
      // class="vue-classes-as-litteral"
      return true;
    case node.key &&
      node.key.name &&
      node.key.name.name &&
      node.key.argument &&
      node.key.argument.name &&
      /^bind$/.test(node.key.name.name) &&
      re.test(node.key.argument.name):
      // v-bind:class="vue-classes-as-bind"
      // :class="vue-classes-as-bind"
      return true;
    default:
      return false;
  }
}

/**
 * Find out if node's value attribute is just simple text
 *
 * @param {ASTNode} node The AST node being checked
 * @returns {Boolean}
 */
function isVLiteralValue(node) {
  return node.value && node.value.type === 'VLiteral';
}

/**
 * Find out if node's value attribute is an ArrayExpression
 *
 * @param {ASTNode} node The AST node being checked
 * @returns {Boolean}
 */
function isArrayExpression(node) {
  return node.value && node.value.type === 'VExpressionContainer' && node.value.expression && node.value.expression.type === 'ArrayExpression';
}

/**
 * Find out if node's value attribute is an ObjectExpression
 *
 * @param {ASTNode} node The AST node being checked
 * @returns {Boolean}
 */
function isObjectExpression(node) {
  return node.value && node.value.type === 'VExpressionContainer' && node.value.expression && node.value.expression.type === 'ObjectExpression';
}

/**
 * Find out if node's value attribute is just simple text
 *
 * @param {ASTNode} node The AST node being checked
 * @returns {Boolean}
 */
function isVueValidAttributeValue(node) {
  switch (true) {
    case isVLiteralValue(node): // Simple string
    case isArrayExpression(node): // ['tw-unknown-class']
    case isObjectExpression(node): // {'tw-unknown-class': true}
      return true;
    default:
      return false;
  }
}

/**
 * Find out if node's value attribute is just simple text
 *
 * @param {ASTNode} node The AST node being checked
 * @returns {Boolean}
 */
function isLiteralAttributeValue(node) {
  if (node.type === 'TextAttribute' && node.name === 'class' && typeof node.value === 'string') {
    return true;
  }
  if (node.value) {
    switch (node.value.type) {
      case 'Literal':
        // No support for dynamic or conditional...
        return !/\{|\?|\}/.test(node.value.value);
      case 'JSXExpressionContainer':
        // className={"..."}
        return node.value.expression.type === 'Literal';
    }
  }
  return false;
}

/**
 * Find out if the node is a valid candidate for our rules
 *
 * @param {ASTNode} node The AST node being checked
 * @param {String} classRegex Regex to test the attribute that is being checked against
 * @returns {Boolean}
 */
function isValidJSXAttribute(node, classRegex) {
  if (!isClassAttribute(node, classRegex)) {
    // Only run for class[Name] attributes
    return false;
  }
  if (!isLiteralAttributeValue(node)) {
    // No support for dynamic or conditional classnames
    return false;
  }
  return true;
}

/**
 * Find out if the node is a valid candidate for our rules
 *
 * @param {ASTNode} node The AST node being checked
 * @param {String} classRegex Regex to test the attribute that is being checked against
 * @returns {Boolean}
 */
function isValidVueAttribute(node, classRegex) {
  if (!isVueClassAttribute(node, classRegex)) {
    // Only run for class attributes
    return false;
  }
  if (!isVueValidAttributeValue(node)) {
    // No support for dynamic or conditional classnames
    return false;
  }
  return true;
}

function extractRangeFromNode(node) {
  if (node.type === 'TextAttribute' && node.name === 'class') {
    return [node.valueSpan.fullStart.offset, node.valueSpan.end.offset];
  }
  if (node.value === undefined) {
    return [0, 0];
  }
  switch (node.value.type) {
    case 'JSXExpressionContainer':
      return node.value.expression.range;
    default:
      return node.value.range;
  }
}

function extractValueFromNode(node) {
  if (node.type === 'TextAttribute' && node.name === 'class') {
    return node.value;
  }
  if (node.value === undefined) {
    return node.value;
  }

  switch (node.value.type) {
    case 'JSXExpressionContainer':
      return node.value.expression.value;
    case 'VExpressionContainer':
      switch (node.value.expression.type) {
        case 'ArrayExpression':
          return node.value.expression.elements;
        case 'ObjectExpression':
          return node.value.expression.properties;
      }
      return node.value.expression.value;
    default:
      return node.value.value;
  }
}

function extractClassnamesFromValue(classStr) {
  if (typeof classStr !== 'string') {
    return { classNames: [], whitespaces: [], headSpace: false, tailSpace: false };
  }
  let parts = classStr.split(separatorRegEx);
  if (parts[0] === '') {
    parts.shift();
  }
  if (parts[parts.length - 1] === '') {
    parts.pop();
  }
  let headSpace = separatorRegEx.test(parts[0]);
  let tailSpace = separatorRegEx.test(parts[parts.length - 1]);
  const isClass = (_, i) => (headSpace ? i % 2 !== 0 : i % 2 === 0);
  const isNotClass = (_, i) => (headSpace ? i % 2 === 0 : i % 2 !== 0);
  let classNames = parts.filter(isClass);
  let whitespaces = parts.filter(isNotClass);
  return { classNames: classNames, whitespaces: whitespaces, headSpace: headSpace, tailSpace: tailSpace };
}

/**
 * Inspect and parse an abstract syntax node and run a callback function
 *
 * @param {ASTNode} rootNode The current root node being parsed by eslint
 * @param {ASTNode} childNode The AST node child argument being checked
 * @param {Function} cb The callback function
 * @param {Boolean} skipConditional Optional, indicate distinct parsing for conditional nodes
 * @param {Boolean} isolate Optional, set internally to isolate parsing and validation on conditional children
 * @param {Array} ignoredKeys Optional, set object keys which should not be parsed e.g. for `cva`
 * @returns {void}
 */
function parseNodeRecursive(rootNode, childNode, cb, skipConditional = false, isolate = false, ignoredKeys = []) {
  // TODO allow vue non litteral
  let originalClassNamesValue;
  let classNames;
  if (childNode === null) {
    originalClassNamesValue = extractValueFromNode(rootNode);
    ({ classNames } = extractClassnamesFromValue(originalClassNamesValue));
    classNames = removeDuplicatesFromArray(classNames);
    if (classNames.length === 0) {
      // Don't run for empty className
      return;
    }
    cb(classNames, rootNode);
  } else if (childNode === undefined) {
    // Ignore invalid child candidates (probably inside complex TemplateLiteral)
    return;
  } else {
    const forceIsolation = skipConditional ? true : isolate;
    let trim = false;
    switch (childNode.type) {
      case 'TemplateLiteral':
        childNode.expressions.forEach((exp) => {
          parseNodeRecursive(rootNode, exp, cb, skipConditional, forceIsolation, ignoredKeys);
        });
        childNode.quasis.forEach((quasis) => {
          parseNodeRecursive(rootNode, quasis, cb, skipConditional, isolate, ignoredKeys);
        });
        return;
      case 'ConditionalExpression':
        parseNodeRecursive(rootNode, childNode.consequent, cb, skipConditional, forceIsolation, ignoredKeys);
        parseNodeRecursive(rootNode, childNode.alternate, cb, skipConditional, forceIsolation, ignoredKeys);
        return;
      case 'LogicalExpression':
        parseNodeRecursive(rootNode, childNode.right, cb, skipConditional, forceIsolation, ignoredKeys);
        return;
      case 'ArrayExpression':
        childNode.elements.forEach((el) => {
          parseNodeRecursive(rootNode, el, cb, skipConditional, forceIsolation, ignoredKeys);
        });
        return;
      case 'ObjectExpression':
        childNode.properties.forEach((prop) => {
          const isUsedByClassNamesPlugin = (rootNode.callee && rootNode.callee.name === 'classnames') || rootNode.type === 'VAttribute';

          if (prop.type === 'SpreadElement') {
            // Ignore spread elements
            return;
          }

          if (prop.key.type === 'Identifier' && ignoredKeys.includes(prop.key.name)) {
            // Ignore specific keys defined in settings
            return;
          }

          parseNodeRecursive(
            rootNode,
            isUsedByClassNamesPlugin ? prop.key : prop.value,
            cb,
            skipConditional,
            forceIsolation,
            ignoredKeys
          );
        });
        return;
      case 'Property':
        parseNodeRecursive(rootNode, childNode.key, cb, skipConditional, forceIsolation, ignoredKeys);
        return;
      case 'Literal':
        trim = true;
        originalClassNamesValue = childNode.value;
        break;
      case 'TemplateElement':
        originalClassNamesValue = childNode.value.raw;
        break;
    }
    ({ classNames } = extractClassnamesFromValue(originalClassNamesValue));
    classNames = removeDuplicatesFromArray(classNames);
    if (classNames.length === 0) {
      // Don't run for empty className
      return;
    }
    const targetNode = isolate ? null : rootNode;
    cb(classNames, targetNode);
  }
}

function getTemplateElementPrefix(text, raw) {
  const idx = text.indexOf(raw);
  if (idx === 0) {
    return '';
  }
  return text.split(raw).shift();
}

function getTemplateElementSuffix(text, raw) {
  if (text.indexOf(raw) === -1) {
    return '';
  }
  return text.split(raw).pop();
}

function getTemplateElementBody(text, prefix, suffix) {
  let arr = text.split(prefix);
  arr.shift();
  let body = arr.join(prefix);
  arr = body.split(suffix);
  arr.pop();
  return arr.join(suffix);
}

module.exports = {
  calleeToString,
  extractRangeFromNode,
  extractValueFromNode,
  extractClassnamesFromValue,
  isClassAttribute,
  isLiteralAttributeValue,
  isArrayExpression,
  isObjectExpression,
  isValidJSXAttribute,
  isValidVueAttribute,
  isVLiteralValue,
  parseNodeRecursive,
  getTemplateElementPrefix,
  getTemplateElementSuffix,
  getTemplateElementBody,
};

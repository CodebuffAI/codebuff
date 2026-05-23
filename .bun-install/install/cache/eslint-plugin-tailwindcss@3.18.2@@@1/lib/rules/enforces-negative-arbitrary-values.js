/**
 * @fileoverview Warns about `-` prefixed classnames using arbitrary values
 * @author François Massart
 */
'use strict';

const docsUrl = require('../util/docsUrl');
const customConfig = require('../util/customConfig');
const astUtil = require('../util/ast');
const groupUtil = require('../util/groupMethods');
const getOption = require('../util/settings');
const parserUtil = require('../util/parser');

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

// Predefine message for use in context.report conditional.
// messageId will still be usable in tests.
const NEGATIVE_ARBITRARY_VALUE = `Arbitrary value classname '{{classname}}' should not start with a dash (-)`;

module.exports = {
  meta: {
    docs: {
      description: 'Warns about dash prefixed classnames using arbitrary values',
      category: 'Best Practices',
      recommended: true,
      url: docsUrl('enforces-negative-arbitrary-values'),
    },
    messages: {
      negativeArbitraryValue: NEGATIVE_ARBITRARY_VALUE,
    },
    fixable: null,
    schema: [
      {
        type: 'object',
        properties: {
          callees: {
            type: 'array',
            items: { type: 'string', minLength: 0 },
            uniqueItems: true,
          },
          ignoredKeys: {
            type: 'array',
            items: { type: 'string', minLength: 0 },
            uniqueItems: true,
          },
          config: {
            // returned from `loadConfig()` utility
            type: ['string', 'object'],
          },
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 0 },
            uniqueItems: true,
          },
        },
      },
    ],
  },

  create: function (context) {
    const callees = getOption(context, 'callees');
    const skipClassAttribute = getOption(context, 'skipClassAttribute');
    const tags = getOption(context, 'tags');
    const twConfig = getOption(context, 'config');
    const classRegex = getOption(context, 'classRegex');

    const mergedConfig = customConfig.resolve(twConfig);

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    /**
     * Recursive function crawling into child nodes
     * @param {ASTNode} node The root node of the current parsing
     * @param {ASTNode} arg The child node of node
     * @returns {void}
     */
    const parseForNegativeArbitraryClassNames = (node, arg = null) => {
      let originalClassNamesValue = null;
      if (arg === null) {
        originalClassNamesValue = astUtil.extractValueFromNode(node);
      } else {
        switch (arg.type) {
          case 'Identifier':
            return;
          case 'TemplateLiteral':
            arg.expressions.forEach((exp) => {
              parseForNegativeArbitraryClassNames(node, exp);
            });
            arg.quasis.forEach((quasis) => {
              parseForNegativeArbitraryClassNames(node, quasis);
            });
            return;
          case 'ConditionalExpression':
            parseForNegativeArbitraryClassNames(node, arg.consequent);
            parseForNegativeArbitraryClassNames(node, arg.alternate);
            return;
          case 'LogicalExpression':
            parseForNegativeArbitraryClassNames(node, arg.right);
            return;
          case 'ArrayExpression':
            arg.elements.forEach((el) => {
              parseForNegativeArbitraryClassNames(node, el);
            });
            return;
          case 'ObjectExpression':
            const isUsedByClassNamesPlugin = node.callee && node.callee.name === 'classnames';
            const isVue = node.key && node.key.type === 'VDirectiveKey';
            arg.properties.forEach((prop) => {
              const propVal = isUsedByClassNamesPlugin || isVue ? prop.key : prop.value;
              parseForNegativeArbitraryClassNames(node, propVal);
            });
            return;
          case 'Property':
            parseForNegativeArbitraryClassNames(node, arg.key);
            return;
          case 'Literal':
            originalClassNamesValue = arg.value;
            break;
          case 'TemplateElement':
            originalClassNamesValue = arg.value.raw;
            if (originalClassNamesValue === '') {
              return;
            }
            break;
        }
      }

      let { classNames } = astUtil.extractClassnamesFromValue(originalClassNamesValue);

      const detected = classNames.filter((cls) => {
        const suffix = groupUtil.getSuffix(cls, mergedConfig.separator);
        const negArbitraryValRegEx =
          /^\-((inset|scale)(\-(y|x))?|top|right|bottom|left|top|z|order|(scroll\-)?m(y|x|t|r|l|b)?|(skew|space|translate)\-(y|x)|rotate|tracking|indent|(backdrop\-)?hue\-rotate)\-\[.*\]$/i;
        return negArbitraryValRegEx.test(suffix);
      });

      detected.forEach((className) => {
        context.report({
          node,
          messageId: 'negativeArbitraryValue',
          data: {
            classname: className,
          },
        });
      });
    };

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    const attributeVisitor = function (node) {
      if (!astUtil.isClassAttribute(node, classRegex) || skipClassAttribute) {
        return;
      }
      if (astUtil.isLiteralAttributeValue(node)) {
        parseForNegativeArbitraryClassNames(node);
      } else if (node.value && node.value.type === 'JSXExpressionContainer') {
        parseForNegativeArbitraryClassNames(node, node.value.expression);
      }
    };

    const callExpressionVisitor = function (node) {
      const calleeStr = astUtil.calleeToString(node.callee);
      if (callees.findIndex((name) => calleeStr === name) === -1) {
        return;
      }
      node.arguments.forEach((arg) => {
        parseForNegativeArbitraryClassNames(node, arg);
      });
    };

    const scriptVisitor = {
      JSXAttribute: attributeVisitor,
      TextAttribute: attributeVisitor,
      CallExpression: callExpressionVisitor,
      TaggedTemplateExpression: function (node) {
        if (!tags.includes(node.tag.name ?? node.tag.object?.name ?? node.tag.callee?.name)) {
          return;
        }
        parseForNegativeArbitraryClassNames(node, node.quasi);
      },
    };

    const templateVisitor = {
      CallExpression: callExpressionVisitor,
      /*
      Tagged templates inside data bindings
      https://github.com/vuejs/vue/issues/9721
      */
      VAttribute: function (node) {
        switch (true) {
          case !astUtil.isValidVueAttribute(node, classRegex):
            return;
          case astUtil.isVLiteralValue(node):
            parseForNegativeArbitraryClassNames(node);
            break;
          case astUtil.isArrayExpression(node):
            node.value.expression.elements.forEach((arg) => {
              parseForNegativeArbitraryClassNames(node, arg);
            });
            break;
          case astUtil.isObjectExpression(node):
            node.value.expression.properties.forEach((prop) => {
              parseForNegativeArbitraryClassNames(node, prop);
            });
            break;
        }
      },
    };

    return parserUtil.defineTemplateBodyVisitor(context, templateVisitor, scriptVisitor);
  },
};

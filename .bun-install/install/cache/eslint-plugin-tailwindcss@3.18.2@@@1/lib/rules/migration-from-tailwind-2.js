/**
 * @fileoverview Detect obsolete classnames when upgrading to Tailwind CSS v3
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
const CLASSNAME_NOT_NEEDED_MSG = `Classname '{{classnames}}' is not needed in Tailwind CSS v3!`;
const CLASSNAMES_NOT_NEEDED_MSG = `Classnames '{{classnames}}' are not needed in Tailwind CSS v3!`;
const CLASSNAME_CHANGED_MSG = `Classname '{{deprecated}}' should be updated to '{{updated}}' in Tailwind CSS v3!`;
const OPACITY_CLASS_DEPRECATED_MSG = `Classname '{{classname}}' should be replaced by an opacity suffix (eg. '/{{value}}')`;

module.exports = {
  meta: {
    docs: {
      description: 'Detect obsolete classnames when upgrading to Tailwind CSS v3',
      category: 'Possible Errors',
      recommended: true,
      url: docsUrl('migration-from-tailwind-2'),
    },
    messages: {
      classnameNotNeeded: CLASSNAME_NOT_NEEDED_MSG,
      classnamesNotNeeded: CLASSNAMES_NOT_NEEDED_MSG,
      classnameChanged: CLASSNAME_CHANGED_MSG,
      classnameOpacityDeprecated: OPACITY_CLASS_DEPRECATED_MSG,
    },
    fixable: 'code',
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
    const parseForObsoleteClassNames = (node, arg = null) => {
      let originalClassNamesValue = null;
      let start = null;
      let end = null;
      let prefix = '';
      let suffix = '';
      if (arg === null) {
        originalClassNamesValue = astUtil.extractValueFromNode(node);
        const range = astUtil.extractRangeFromNode(node);
        if (node.type === 'TextAttribute') {
          start = range[0];
          end = range[1];
        } else {
          start = range[0] + 1;
          end = range[1] - 1;
        }
      } else {
        switch (arg.type) {
          case 'Identifier':
            return;
          case 'TemplateLiteral':
            arg.expressions.forEach((exp) => {
              parseForObsoleteClassNames(node, exp);
            });
            arg.quasis.forEach((quasis) => {
              parseForObsoleteClassNames(node, quasis);
            });
            return;
          case 'ConditionalExpression':
            parseForObsoleteClassNames(node, arg.consequent);
            parseForObsoleteClassNames(node, arg.alternate);
            return;
          case 'LogicalExpression':
            parseForObsoleteClassNames(node, arg.right);
            return;
          case 'ArrayExpression':
            arg.elements.forEach((el) => {
              parseForObsoleteClassNames(node, el);
            });
            return;
          case 'ObjectExpression':
            arg.properties.forEach((prop) => {
              parseForObsoleteClassNames(node, prop.key);
            });
            return;
          case 'Property':
            parseForObsoleteClassNames(node, arg.key);
            return;
          case 'Literal':
            originalClassNamesValue = arg.value;
            start = arg.range[0] + 1;
            end = arg.range[1] - 1;
            break;
          case 'TemplateElement':
            originalClassNamesValue = arg.value.raw;
            if (originalClassNamesValue === '') {
              return;
            }
            start = arg.range[0];
            end = arg.range[1];
            // https://github.com/eslint/eslint/issues/13360
            // The problem is that range computation includes the backticks (`test`)
            // but value.raw does not include them, so there is a mismatch.
            // start/end does not include the backticks, therefore it matches value.raw.
            const txt = context.getSourceCode().getText(arg);
            prefix = astUtil.getTemplateElementPrefix(txt, originalClassNamesValue);
            suffix = astUtil.getTemplateElementSuffix(txt, originalClassNamesValue);
            originalClassNamesValue = astUtil.getTemplateElementBody(txt, prefix, suffix);
            break;
        }
      }

      let { classNames, whitespaces, headSpace, tailSpace } =
        astUtil.extractClassnamesFromValue(originalClassNamesValue);

      const notNeeded = [];
      const outdated = [];
      const deprecatedBgOpacity = [];
      const filtered = classNames.filter((cls) => {
        const suffix = groupUtil.getSuffix(cls, mergedConfig.separator);
        if (/^((backdrop\-)?(filter|transform))$/i.test(suffix)) {
          notNeeded.push(cls);
          return false;
        }
        let overflowRes = /^overflow\-(?<value>clip|ellipsis)$/i.exec(suffix);
        if (overflowRes && overflowRes.groups && overflowRes.groups.value) {
          outdated.push([cls, cls.replace(/overflow\-(clip|ellipsis)$/i, `text-${overflowRes.groups.value}`)]);
        }
        let growShrinkRes = /flex\-(?<prop>grow|shrink)(\-(?<value>${flexVal}))?/i.exec(suffix);
        if (growShrinkRes && growShrinkRes.groups && growShrinkRes.groups.prop) {
          const prop = growShrinkRes.groups.prop;
          const flexVal = growShrinkRes.groups.flexVal;
          const optionalVal = flexVal ? `\-${flexVal}` : '';
          const fixRegex = new RegExp(`flex\-${prop}${optionalVal}`);
          outdated.push([cls, cls.replace(fixRegex, `${prop}${flexVal ? '-' + flexVal : ''}`)]);
        }
        let boxRes = /^decoration\-(?<value>clone|slice)$/i.exec(suffix);
        if (boxRes && boxRes.groups && boxRes.groups.value) {
          const boxVal = boxRes.groups.value;
          const fixRegex = new RegExp(`decoration\-${boxVal}`);
          outdated.push([cls, cls.replace(fixRegex, `box-decoration\-${boxVal}`)]);
        }
        let bgOpacityRes = /^(bg|border|ring)\-opacity\-(?<value>\d{1,})$/i.exec(suffix);
        if (bgOpacityRes && bgOpacityRes.groups && bgOpacityRes.groups.value) {
          const opacityVal = bgOpacityRes.groups.value;
          deprecatedBgOpacity.push([cls, opacityVal]);
        }
        let placeholderRes = /^placeholder\-(?<value>.{1,})$/i.exec(suffix);
        if (placeholderRes && placeholderRes.groups && placeholderRes.groups.value) {
          const placeholderVal = placeholderRes.groups.value;
          const fixPlaceholderRegex = new RegExp(`placeholder\-${placeholderVal}$`);
          outdated.push([cls, cls.replace(fixPlaceholderRegex, `placeholder:text\-${placeholderVal}`)]);
        }
        return true;
      });

      if (notNeeded.length) {
        let validatedClassNamesValue = '';
        for (let i = 0; i < filtered.length; i++) {
          const isLast = i === filtered.length - 1;
          const w = whitespaces[i] ?? '';
          const cls = filtered[i];
          validatedClassNamesValue += headSpace ? `${w}${cls}` : isLast ? `${cls}` : `${cls}${w}`;
          if (headSpace && tailSpace && isLast) {
            validatedClassNamesValue += whitespaces[whitespaces.length - 1] ?? '';
          }
        }
        validatedClassNamesValue = prefix + validatedClassNamesValue + suffix;
        context.report({
          node,
          messageId: notNeeded.length === 1 ? 'classnameNotNeeded' : 'classnamesNotNeeded',
          data: {
            classnames: notNeeded.join(', '),
          },
          fix: function (fixer) {
            return fixer.replaceTextRange([start, end], validatedClassNamesValue);
          },
        });
      }

      outdated.forEach((outdatedClass) => {
        let validatedClassNamesValue = '';
        for (let i = 0; i < filtered.length; i++) {
          const w = whitespaces[i] ?? '';
          const cls = filtered[i];
          validatedClassNamesValue += headSpace ? `${w}${cls}` : `${cls}${w}`;
          if (headSpace && tailSpace && i === filtered.length - 1) {
            validatedClassNamesValue += whitespaces[whitespaces.length - 1] ?? '';
          }
        }
        validatedClassNamesValue =
          prefix + validatedClassNamesValue.replace(outdatedClass[0], outdatedClass[1]) + suffix;
        context.report({
          node,
          messageId: 'classnameChanged',
          data: {
            deprecated: outdatedClass[0],
            updated: outdatedClass[1],
          },
          fix: function (fixer) {
            return fixer.replaceTextRange([start, end], validatedClassNamesValue);
          },
        });
      });
      deprecatedBgOpacity.forEach((bgClass) => {
        context.report({
          node,
          messageId: 'classnameOpacityDeprecated',
          data: {
            classname: bgClass[0],
            value: bgClass[1],
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
        parseForObsoleteClassNames(node);
      } else if (node.value && node.value.type === 'JSXExpressionContainer') {
        parseForObsoleteClassNames(node, node.value.expression);
      }
    };

    const callExpressionVisitor = function (node) {
      const calleeStr = astUtil.calleeToString(node.callee);
      if (callees.findIndex((name) => calleeStr === name) === -1) {
        return;
      }
      node.arguments.forEach((arg) => {
        parseForObsoleteClassNames(node, arg);
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
        parseForObsoleteClassNames(node, node.quasi);
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
            parseForObsoleteClassNames(node);
            break;
          case astUtil.isArrayExpression(node):
            node.value.expression.elements.forEach((arg) => {
              parseForObsoleteClassNames(node, arg);
            });
            break;
          case astUtil.isObjectExpression(node):
            node.value.expression.properties.forEach((prop) => {
              parseForObsoleteClassNames(node, prop);
            });
            break;
        }
      },
    };

    return parserUtil.defineTemplateBodyVisitor(context, templateVisitor, scriptVisitor);
  },
};

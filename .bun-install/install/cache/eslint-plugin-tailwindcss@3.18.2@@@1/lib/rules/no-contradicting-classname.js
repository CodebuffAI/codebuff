/**
 * @fileoverview Avoid contradicting Tailwind CSS classnames (e.g. "w-3 w-5")
 * @author François Massart
 */
'use strict';

const docsUrl = require('../util/docsUrl');
const defaultGroups = require('../config/groups').groups;
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
const CONFLICTING_CLASSNAMES_DETECTED_MSG = `Classnames {{classnames}} are conflicting!`;

module.exports = {
  meta: {
    docs: {
      description: 'Avoid contradicting Tailwind CSS classnames (e.g. "w-3 w-5")',
      category: 'Possible Errors',
      recommended: true,
      url: docsUrl('no-contradicting-classname'),
    },
    messages: {
      conflictingClassnames: CONFLICTING_CLASSNAMES_DETECTED_MSG,
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
    const ignoredKeys = getOption(context, 'ignoredKeys');
    const skipClassAttribute = getOption(context, 'skipClassAttribute');
    const tags = getOption(context, 'tags');
    const twConfig = getOption(context, 'config');
    const classRegex = getOption(context, 'classRegex');

    const mergedConfig = customConfig.resolve(twConfig);

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    // Init assets before sorting
    const groups = groupUtil.getGroups(defaultGroups, mergedConfig);

    /**
     * Parse the classnames and report found conflicts
     * @param {Array} classNames
     * @param {ASTNode} node
     */
    const parseForContradictingClassNames = (classNames, node) => {
      // Init assets before sorting
      const sorted = groupUtil.initGroupSlots(groups);

      // Move each classname inside its dedicated group
      classNames.forEach((className) => {
        const idx = groupUtil.getGroupIndex(className, groups, mergedConfig.separator);
        if (idx > -1) {
          sorted[idx].push(className);
        }
      });

      // Only multiple classNames
      const sortedGroups = sorted.filter((slot) => slot.length > 1);
      const arbitraryPropsGroupIndex = sortedGroups.findIndex((slot) => {
        const suffix = groupUtil.getSuffix(slot[0], mergedConfig.separator);
        return groupUtil.getArbitraryProperty(suffix, mergedConfig.separator) !== '';
      });

      // Sorts each groups' classnames
      const ambiguousArbitraryValuesOrClasses = String.raw`(\[(.*${mergedConfig.separator}))|(^((?!:).)*$)`;

      sortedGroups.forEach((group, groupIndex) => {
        const variants = [];
        group.forEach((cls) => {
          const prefix = groupUtil.getPrefix(cls, mergedConfig.separator);
          const name = cls.substr(prefix.length);
          if (groupIndex === arbitraryPropsGroupIndex) {
            // Arbitrary Props
            const arbitraryProp = groupUtil.getArbitraryProperty(name, mergedConfig.separator);
            const identifier = prefix + arbitraryProp;
            const idx = variants.findIndex((v) => identifier === v.prefix);
            if (idx === -1) {
              variants.push({
                prefix: identifier,
                name: [name],
              });
            } else {
              variants[idx].name.push(name);
            }
          } else {
            // "Regular classNames"
            const rePrefix = prefix === '' ? ambiguousArbitraryValuesOrClasses : '^' + prefix;
            const idx = variants.findIndex((v) => v.prefix === rePrefix);
            if (idx === -1) {
              variants.push({
                prefix: rePrefix,
                name: [name],
              });
            } else {
              variants[idx].name.push(name);
            }
          }
        });

        // Several classNames with the same prefix
        const potentialTroubles = variants.filter((v) => v.name.length > 1);
        if (potentialTroubles.length) {
          potentialTroubles.forEach((variantGroup) => {
            const re = new RegExp(variantGroup.prefix);
            const conflicting = group.filter((c) => re.test(c));
            context.report({
              node: node,
              messageId: 'conflictingClassnames',
              data: {
                classnames: conflicting.join(', '),
              },
            });
          });
        }
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
        astUtil.parseNodeRecursive(node, null, parseForContradictingClassNames, true, false, ignoredKeys);
      } else if (node.value && node.value.type === 'JSXExpressionContainer') {
        astUtil.parseNodeRecursive(
          node,
          node.value.expression,
          parseForContradictingClassNames,
          true,
          false,
          ignoredKeys
        );
      }
    };

    const callExpressionVisitor = function (node) {
      const calleeStr = astUtil.calleeToString(node.callee);
      if (callees.findIndex((name) => calleeStr === name) === -1) {
        return;
      }
      const allClassnamesForNode = [];
      const pushClasses = (classNames, targetNode) => {
        if (targetNode === null) {
          // Classnames should be parsed in isolation (e.g. conditional expressions)
          parseForContradictingClassNames(classNames, node);
        } else {
          // Gather the classes prior to validation
          allClassnamesForNode.push(...classNames);
        }
      };
      node.arguments.forEach((arg) => {
        astUtil.parseNodeRecursive(node, arg, pushClasses, true, false, ignoredKeys);
      });
      parseForContradictingClassNames(allClassnamesForNode, node);
    };

    const scriptVisitor = {
      JSXAttribute: attributeVisitor,
      TextAttribute: attributeVisitor,
      CallExpression: callExpressionVisitor,
      TaggedTemplateExpression: function (node) {
        if (!tags.includes(node.tag.name ?? node.tag.object?.name ?? node.tag.callee?.name)) {
          return;
        }

        const allClassnamesForNode = [];
        const pushClasses = (classNames, targetNode) => {
          if (targetNode === null) {
            // Classnames should be parsed in isolation (e.g. conditional expressions)
            parseForContradictingClassNames(classNames, node);
          } else {
            // Gather the classes prior to validation
            allClassnamesForNode.push(...classNames);
          }
        };
        astUtil.parseNodeRecursive(node, node.quasi, pushClasses, true, false, ignoredKeys);
        parseForContradictingClassNames(allClassnamesForNode, node);
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
            astUtil.parseNodeRecursive(node, null, parseForContradictingClassNames, true, false, ignoredKeys);
            break;
          case astUtil.isArrayExpression(node):
            const allClassnamesForNode = [];
            const pushClasses = (classNames, targetNode) => {
              if (targetNode === null) {
                // Classnames should be parsed in isolation (e.g. conditional expressions)
                parseForContradictingClassNames(classNames, node);
              } else {
                // Gather the classes prior to validation
                allClassnamesForNode.push(...classNames);
              }
            };
            node.value.expression.elements.forEach((el) => {
              astUtil.parseNodeRecursive(node, el, pushClasses, true, false, ignoredKeys);
            });
            parseForContradictingClassNames(allClassnamesForNode, node);
            break;
          case astUtil.isObjectExpression(node):
            node.value.expression.properties.forEach((prop) => {
              astUtil.parseNodeRecursive(node, prop, parseForContradictingClassNames, false, false, ignoredKeys);
            });
            break;
        }
      },
    };

    return parserUtil.defineTemplateBodyVisitor(context, templateVisitor, scriptVisitor);
  },
};

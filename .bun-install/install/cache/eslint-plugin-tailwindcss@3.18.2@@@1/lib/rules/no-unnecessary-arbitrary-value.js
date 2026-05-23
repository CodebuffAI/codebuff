/**
 * @fileoverview Detect arbitrary classnames which have an existing equivalent preset in the configuration
 * @author François Massart
 */
'use strict';

const docsUrl = require('../util/docsUrl');
const customConfig = require('../util/customConfig');
const astUtil = require('../util/ast');
const groupUtil = require('../util/groupMethods');
const getOption = require('../util/settings');
const parserUtil = require('../util/parser');
const { validZeroRegEx } = require('../util/types/length');
const defaultGroups = require('../config/groups').groups;

// TODO get the correct value of start and end
// TODO make rule fixable when only 1 match
// TODO propose several fixes when multiple matches + priority to exact match

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

// Predefine message for use in context.report conditional.
// messageId will still be usable in tests.
const UNNECESSARY_ARBITRARY_VALUE_DETECTED_MSG = `The arbitrary class '{{classname}}' could be replaced by '{{presets}}'`;

module.exports = {
  meta: {
    docs: {
      description: 'Forbid using arbitrary values in classnames when an equivalent preset exists',
      category: 'Best Practices',
      recommended: true,
      url: docsUrl('no-unnecessary-arbitrary-value'),
    },
    messages: {
      unnecessaryArbitraryValueDetected: UNNECESSARY_ARBITRARY_VALUE_DETECTED_MSG,
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
    const groups = groupUtil.getGroups(defaultGroups, mergedConfig);
    const configKeys = groupUtil.getGroupConfigKeys(defaultGroups);
    let parentTemplateLiteral = null;

    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    /**
     * Recursive function crawling into child nodes
     * @param {ASTNode} node The root node of the current parsing
     * @param {ASTNode} arg The child node of node
     * @returns {void}
     */
    const parseForArbitraryValues = (node, arg = null) => {
      let start = null;
      let end = null;
      let originalClassNamesValue = null;
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
            parentTemplateLiteral = arg;
            arg.expressions.forEach((exp) => {
              parseForArbitraryValues(node, exp);
            });
            arg.quasis.forEach((quasis) => {
              parseForArbitraryValues(node, quasis);
            });
            parentTemplateLiteral = null;
            return;
          case 'ConditionalExpression':
            parseForArbitraryValues(node, arg.consequent);
            parseForArbitraryValues(node, arg.alternate);
            return;
          case 'LogicalExpression':
            parseForArbitraryValues(node, arg.right);
            return;
          case 'ArrayExpression':
            arg.elements.forEach((el) => {
              parseForArbitraryValues(node, el);
            });
            return;
          case 'ObjectExpression':
            const isUsedByClassNamesPlugin = node.callee && node.callee.name === 'classnames';
            const isVue = node.key && node.key.type === 'VDirectiveKey';
            arg.properties.forEach((prop) => {
              const propVal = isUsedByClassNamesPlugin || isVue ? prop.key : prop.value;
              parseForArbitraryValues(node, propVal);
            });
            return;
          case 'Property':
            parseForArbitraryValues(node, arg.key);
            start = arg.range[0] + 1;
            end = arg.range[1] - 1;
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
            if (parentTemplateLiteral) {
              if (parentTemplateLiteral.range[0] === start) {
                start += 1; // Skip opening backtick
              } else {
                start += 1; // Skip closing }
              }
              if (parentTemplateLiteral.range[1] === end) {
                end -= 1; // Skip closing backtick
              } else {
                end -= 2; // Skip opening ${
              }
            }
            break;
        }
      }

      const arbitraryRegEx = /^(?<backBone>.*)\[(?<arbitraryValue>.*)\]$/i;
      const { classNames } = astUtil.extractClassnamesFromValue(originalClassNamesValue);
      const arbitraryClassnames = classNames.filter((c) => arbitraryRegEx.test(c));

      if (arbitraryClassnames.length === 0) {
        return;
      }

      const unnecessaryArbitraryClasses = [];
      const existingSubstitutes = [];

      arbitraryClassnames.forEach((arbitraryClass, idx) => {
        const parsed = groupUtil.parseClassname(arbitraryClass, [], mergedConfig, idx);
        const res = arbitraryRegEx.exec(parsed.name);
        if (res && res.groups && res.groups.backBone && res.groups.arbitraryValue) {
          const backBone = res.groups.backBone;
          const arbitraryValue = res.groups.arbitraryValue;
          const groupIdx = groupUtil.getGroupIndex(arbitraryClass, groups, mergedConfig.separator);
          if ([groups[groupIdx], parsed.body, arbitraryValue].includes(undefined)) {
            return false;
          }
          const canBeNegative = groups[groupIdx].indexOf('?<negativeValue>') !== -1;
          const isNegativeClass = parsed.body.indexOf('-') === 0;
          const isNegativeValue = arbitraryValue.indexOf('-') === 0;
          const configurationKey = configKeys[groupIdx];
          const configuration = mergedConfig.theme[configurationKey];
          if ([undefined, null].includes(configuration)) {
            return false;
          }
          const configurationKeys = Object.keys(configuration);
          const zeroValueWithOrWithoutUnitsPattern = new RegExp(validZeroRegEx, 'i');
          const isZeroArbitraryValue = zeroValueWithOrWithoutUnitsPattern.test(arbitraryValue);
          const negativeSubstitutes = [];
          const matchingConfigurationKeys = configurationKeys.filter((key) => {
            const configValue = configuration[key];
            if (isZeroArbitraryValue && zeroValueWithOrWithoutUnitsPattern.test(configValue)) {
              // Both config and tested values are 0 based (with or without units)
              negativeSubstitutes.push(false);
              return true;
            }
            // Negative possibilities
            if (canBeNegative) {
              const absoluteValue = isNegativeValue ? arbitraryValue.substring(1) : arbitraryValue;
              const computedAsNegative = isNegativeClass !== isNegativeValue;
              if (`${configValue}` === `${absoluteValue}`) {
                negativeSubstitutes.push(computedAsNegative);
                return true;
              }
              return false;
            }
            // Default
            if (`${configValue}` === `${arbitraryValue}`) {
              negativeSubstitutes.push(false);
              return true;
            }
            return false;
          });
          if (matchingConfigurationKeys.length) {
            unnecessaryArbitraryClasses.push(parsed.name);
            existingSubstitutes.push(
              matchingConfigurationKeys.map((key, idx) => {
                let patchedBody = backBone.substring(parsed.variants.length);
                patchedBody = patchedBody.charAt(0) === '-' ? patchedBody.substring(1) : patchedBody;
                const noneOrMinus = negativeSubstitutes[idx] ? '-' : '';
                if (key === 'DEFAULT') {
                  return parsed.variants + noneOrMinus + patchedBody.substring(0, patchedBody.length - 1);
                }
                return parsed.variants + noneOrMinus + patchedBody + key;
              })
            );
          }
        }
      });

      // TODO Group by range and bundle the fix
      const fixables = {};
      unnecessaryArbitraryClasses.forEach((forbiddenClass, idx) => {
        if (existingSubstitutes[idx].length === 1) {
          const rangeKey = `s${start}e${end}`;
          if (!fixables[rangeKey]) {
            fixables[rangeKey] = [];
          }
          const fixer = {
            unjustified: forbiddenClass,
            substitute: existingSubstitutes[idx][0],
          };
          fixables[rangeKey].push(fixer);
        } else {
          context.report({
            node,
            messageId: 'unnecessaryArbitraryValueDetected',
            data: {
              classname: forbiddenClass,
              presets: existingSubstitutes[idx].join("' or '"),
            },
          });
        }
      });
      Object.keys(fixables).forEach((rangeKey) => {
        const batchFixes = fixables[rangeKey];
        let patched = originalClassNamesValue;
        const forbiddenClasses = [];
        const substitutes = [];
        for (let idx = 0; idx < batchFixes.length; idx++) {
          // BUG replace could affect same class with distinct variants... eg. h-0 might affect min-h-0
          const unjustified = batchFixes[idx].unjustified;
          forbiddenClasses.push(unjustified);
          const substitute = batchFixes[idx].substitute;
          substitutes.push(substitute);
          patched = patched.replace(unjustified, substitute);
        }
        context.report({
          node,
          messageId: 'unnecessaryArbitraryValueDetected',
          data: {
            classname: forbiddenClasses.join(', '),
            presets: substitutes.join(', '),
          },
          fix: function (fixer) {
            return fixer.replaceTextRange([start, end], patched);
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
        parseForArbitraryValues(node);
      } else if (node.value && node.value.type === 'JSXExpressionContainer') {
        parseForArbitraryValues(node, node.value.expression);
      }
    };

    const callExpressionVisitor = function (node) {
      const calleeStr = astUtil.calleeToString(node.callee);
      if (callees.findIndex((name) => calleeStr === name) === -1) {
        return;
      }
      node.arguments.forEach((arg) => {
        parseForArbitraryValues(node, arg);
      });
    };

    const scriptVisitor = {
      JSXAttribute: attributeVisitor,
      TextAttribute: attributeVisitor,
      CallExpression: callExpressionVisitor,
      TaggedTemplateExpression: function (node) {
        if (!tags.includes(node.tag.name)) {
          return;
        }
        parseForArbitraryValues(node, node.quasi);
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
            parseForArbitraryValues(node, null);
            break;
          case astUtil.isArrayExpression(node):
            node.value.expression.elements.forEach((arg) => {
              parseForArbitraryValues(node, arg);
            });
            break;
          case astUtil.isObjectExpression(node):
            node.value.expression.properties.forEach((prop) => {
              parseForArbitraryValues(node, prop);
            });
            break;
        }
      },
    };

    return parserUtil.defineTemplateBodyVisitor(context, templateVisitor, scriptVisitor);
  },
};

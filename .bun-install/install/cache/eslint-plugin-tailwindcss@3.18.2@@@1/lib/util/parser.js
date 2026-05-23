/**
 * @see parserServices https://eslint.org/docs/developer-guide/working-with-rules#the-context-object
 * @param {Object} context
 * @param {Function} templateBodyVisitor
 * @param {Function} scriptVisitor
 * @returns
 */
function defineTemplateBodyVisitor(context, templateBodyVisitor, scriptVisitor) {
  const parserServices = getParserServices(context);
  if (parserServices == null || parserServices.defineTemplateBodyVisitor == null) {
    // Default parser
    return scriptVisitor;
  }

  // Using "vue-eslint-parser" requires this setup
  // @see https://eslint.org/docs/developer-guide/working-with-rules#the-context-object
  return parserServices.defineTemplateBodyVisitor(templateBodyVisitor, scriptVisitor);
}

/**
 * This function is API compatible with eslint v8.x and eslint v9 or later.
 * @see https://eslint.org/blog/2023/09/preparing-custom-rules-eslint-v9/#from-context-to-sourcecode
 */
function getParserServices(context) {
  return context.sourceCode ? context.sourceCode.parserServices : context.parserServices;
}

module.exports = {
  defineTemplateBodyVisitor,
};

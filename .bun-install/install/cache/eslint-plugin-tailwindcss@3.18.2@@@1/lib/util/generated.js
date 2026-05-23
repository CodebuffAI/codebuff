var generateRulesFallback = require('tailwindcss/lib/lib/generateRules').generateRules;

function generate(className, context) {
  // const order = generateRulesFallback(new Set([className]), context).sort(([a], [z]) => bigSign(z - a))[0]?.[0] ?? null;
  const gen = generateRulesFallback(new Set([className]), context);
  // console.debug(gen);
  return gen;
}

module.exports = generate;

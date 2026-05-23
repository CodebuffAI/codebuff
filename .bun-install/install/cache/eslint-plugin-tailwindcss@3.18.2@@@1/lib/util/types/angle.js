const units = ['deg', 'grad', 'rad', 'turn'];

const mergedAngleValues = [
  `\\-?(\\d{1,}(\\.\\d{1,})?|\\.\\d{1,})(${units.join('|')})`,
  `calc\\(.{1,}\\)`,
  `var\\(\\-\\-[A-Za-z\\-]{1,}\\)`,
];

module.exports = {
  mergedAngleValues,
};

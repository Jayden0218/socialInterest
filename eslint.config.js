const shared = require('./packages/config/eslint.config.js');
module.exports = [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.expo/**', 'infra/cdk.out/**'] },
  ...shared,
];

/**
 * Get application root path
 * @returns {string}
 */
const rootDir = () => process.cwd() || __dirname;

module.exports = rootDir;
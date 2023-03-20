module.exports = {
  "*.{ts,js,css,md}": "prettier --write",
  "*.{ts,tsx,js}": ["yarn build", "yarn eslint"]
};

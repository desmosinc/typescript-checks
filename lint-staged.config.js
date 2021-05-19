module.exports = {
  "*.{ts,js,css,md}": "prettier --write",
  "*.{ts,js,tsx}": ["yarn build", "yarn lint"],
  "*.ts": [() => "yarn typecheck", "prettier --write"]
};

// The app's settings live in app.json. The TV board's website (clutchupgolf.com/tv/) is built from this
// app with EXPO_BASE_URL=/tv so its files and links work from that folder; nothing else changes.
module.exports = ({ config }) =>
  process.env.EXPO_BASE_URL ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL } } : config;

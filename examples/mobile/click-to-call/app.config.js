// Your Apple team for a device build, kept out of app.json so it is not
// committed: APPLE_TEAM_ID=XXXXXXXXXX npx expo run:ios --device
module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, appleTeamId: process.env.APPLE_TEAM_ID ?? config.ios?.appleTeamId },
});

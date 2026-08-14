const { withEntitlementsPlist } = require('expo/config-plugins')

/**
 * expo-notifications adds the `aps-environment` (remote push) entitlement, but the app only
 * schedules LOCAL notifications, and signing with it requires the Push Notifications capability
 * on the App ID — which our current provisioning profile predates. Strip it so store builds sign
 * with the existing profile.
 *
 * Delete this plugin (and the explicit "expo-notifications" plugin ordering in app.json) once the
 * capability is enabled on com.qihongw08.ledge and the profile is regenerated via
 * `eas credentials --platform ios` — that's also the moment remote push becomes possible.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment']
    return config
  })
}

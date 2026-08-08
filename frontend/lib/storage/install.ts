import { MMKV } from 'react-native-mmkv'

/**
 * A marker for "this install has been launched before".
 *
 * iOS erases the app container on uninstall but deliberately leaves Keychain items behind,
 * and expo-secure-store — where the Supabase session lives — is the Keychain. So deleting
 * the app drops every cache while keeping the credential, and a reinstall silently signs
 * the previous user back in. There is no OS-provided "was this reinstalled" flag; the
 * standard fix is to keep a marker somewhere the uninstall *does* erase and treat its
 * absence as the signal.
 *
 * Its own MMKV instance on purpose: the transaction cache is wiped wholesale on user change
 * and `ledge-preferences` is about display settings, so neither can hold this safely.
 */
const storage = new MMKV({ id: 'ledge-install' })

const INSTALL_MARKER_KEY = 'install-marker'

export function hasInstallMarker(): boolean {
  return storage.getBoolean(INSTALL_MARKER_KEY) === true
}

export function setInstallMarker(): void {
  storage.set(INSTALL_MARKER_KEY, true)
}

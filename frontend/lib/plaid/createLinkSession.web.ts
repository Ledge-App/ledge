import type { LinkTokenConfiguration, PlaidLinkSession } from 'react-native-plaid-link-sdk'

// react-native-plaid-link-sdk is a native module with no web implementation, and
// architecture.md scopes this app to iOS only (Android/web are out of scope for v1).
// This stub exists purely so Metro's web bundle never evaluates the native package's
// top-level native-module binding — swapped in automatically via the .web.ts extension.
export async function createPlaidLinkSession(_config: LinkTokenConfiguration): Promise<PlaidLinkSession> {
  throw new Error('Plaid Link is not supported on web — this app targets iOS.')
}

// The public legal and support pages, served from oauth-redirect/ on Netlify. These exact URLs
// are also what App Store Connect has on file for the privacy policy and support fields, so the
// two must be changed together — Apple checks that the in-app links resolve.
const SITE = 'https://ledge-oauth-88792.netlify.app'

export const PRIVACY_POLICY_URL = `${SITE}/privacy.html`
export const TERMS_URL = `${SITE}/terms.html`
export const SUPPORT_URL = `${SITE}/support.html`

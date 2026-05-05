import Keycloak from 'keycloak-js'

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? '/auth',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'vaccitrack',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'vaccitrack-web',
})

let initPromise: Promise<boolean> | undefined
let refreshTimer: number | undefined

export async function initKeycloak() {
  initPromise ??= keycloak
    .init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    })
    .then((authenticated) => {
      if (!authenticated) {
        void keycloak.login()
        return false
      }

      refreshTimer ??= window.setInterval(() => {
        keycloak.updateToken(60).catch(() => keycloak.logout())
      }, 30_000)

      return true
    })
    .catch((error) => {
      initPromise = undefined
      throw error
    })

  return initPromise
}

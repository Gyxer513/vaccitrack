import Keycloak from 'keycloak-js'

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://keycloak:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'vaccitrack',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'vaccitrack-web',
})

export async function initKeycloak() {
  const authenticated = await keycloak.init({
    onLoad: 'login-required',
    silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
    checkLoginIframe: false,
  })
  setInterval(() => {
    keycloak.updateToken(60).catch(() => keycloak.logout())
  }, 30_000)
  return authenticated
}

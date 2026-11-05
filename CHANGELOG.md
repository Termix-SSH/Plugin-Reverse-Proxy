# Changelog

## 1.2.0

### Added

- Proxy routes across hosts in the All hosts table with their addresses, turning routes on and off through Termix actions, and failing routes as a status tile
- Sign in to Termix right on the login page of a protected route, with password, LDAP, passkeys, two-factor codes and security keys. SSO opens in a new tab and the page continues by itself

### Changed

- The login page in front of a route now looks like the Termix sign in screen and follows your theme, language and branding
- Pages use the Termix tile look, with lines between sections instead of separate boxes

### Fixed

- The Open Termix button on the login page opened an error page instead of Termix
- The Reverse Proxy tab shows a loading message instead of a blank screen while it loads

### Changed

- Needs Termix 26.11.1 or newer

## 1.1.1

### Fixed

- Redirects from an app no longer send visitors to the target's own address, like a Tailscale IP. They now point at the route's domain, and plain http redirects move to https

## 1.1.0

### Added

- Reverse proxy dashboard card: how many routes are running, the ones that are not, and certificates by expiry

## 1.0.0

### Added

- TCP, UDP, HTTP and HTTPS routes for your hosts, managed from each host
- Host settings to turn routes off, set a target address and pick the default login
- Let's Encrypt, self-signed and uploaded certificates, renewed automatically, plus a setting for another ACME certificate authority
- Termix login in front of web routes
- WebSocket support, HTTP to HTTPS redirect, custom headers and IP allow and block lists
- A Reverse Proxy tab with every route, its status, traffic and certificates

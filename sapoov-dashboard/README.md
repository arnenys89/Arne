# SAPOOV — centraal dashboard

Centrale startpagina en gebruikersadministratie voor de digitale toepassingen van Provinciaal Onderwijs Oost-Vlaanderen.

## Architectuur
- Cloudflare Pages/Workers met D1.
- Cloudflare Access als centrale aanmeldlaag.
- De Worker valideert het Access JWT cryptografisch (JWKS, issuer, audience en vervaltijd).
- D1 bewaart centrale gebruikers, applicaties, rollen, toewijzingen en auditlog.
- Applicatiegegevens blijven in de bestaande applicaties/databanken.

## Lokaal
1. Maak een Cloudflare D1-database aan.
2. Vul de database-ID in `wrangler.toml`.
3. Stel secrets/vars in: `CF_ACCESS_TEAM_DOMAIN` (bv. `organisatie.cloudflareaccess.com`), `CF_ACCESS_AUD`, `SUPERADMIN_EMAILS`.
4. Voer `npx wrangler d1 migrations apply sapoov-db --remote` uit.
5. Configureer Cloudflare Access voor het dashboarddomein en voeg de Worker als Pages Function/Worker toe.

## Belangrijk
Deze eerste implementatie is een veilige basis en staat op een aparte GitHub-branch. Ze is nog niet uitgerold en koppelt bestaande applicaties nog niet automatisch om. Per applicatie is een gecontroleerde migratie nodig waarbij bestaande gebruikers en rechten behouden blijven. Configureer de Access-applicatie en D1-binding vóór publicatie.

## Rollen
- `superadmin`: platformbreed beheer.
- `app_admin`: beheer binnen toegewezen applicaties.
- `manager`: inhoudelijk beheer binnen toegewezen applicaties.
- `reviewer`: beoordelen binnen toegewezen applicaties.
- `staff`: standaardgebruik.
- `reader`: alleen-lezen.

# SAPOOV — centraal dashboard en centraal gebruikersbeheer

## Doel
SAPOOV is de centrale bron voor gebruikers, applicatierollen en rechten van alle gekoppelde POOV-websites. Iedere toepassing heeft haar eigen rollen en rechtensleutels. Een gebruiker kan dus bijvoorbeeld Aankoper zijn in het Bestelplatform en Teamleider in Werkplekreservatie.

## Beheermodel
- De enige superadministrator is `arne.nys@gmail.com`.
- Alleen dit account krijgt toegang tot de werkruimte **Gebruikersbeheer** en kan gebruikersrollen, rechtensleutels en toepassingskoppelingen wijzigen.
- Andere gebruikers kunnen zich via Cloudflare Access aanmelden en verschijnen automatisch in de centrale gebruikerslijst.
- Een applicatiebeheerder binnen een afzonderlijke website krijgt hierdoor niet automatisch rechten om centraal rollen te wijzigen.
- Alle toekenningen en wijzigingen worden in de auditlog geregistreerd.

## Rollen en rechten
Rollen zijn toepassingsspecifiek. De startmigratie voorziet onder meer:
- Bestelplatform: Personeelslid, Aankoper, Administrator.
- Professionalisering: Personeelslid, Directie, TAC/TA, Econoom, Personeelsverantwoordelijke, Administrator.
- Werkplekreservatie: Medewerker, Teamleider, Administrator.
- Activiteitenplatform: Aanvrager, Beoordelaar, Administrator.
- Schoolreglementen: Beheerder, Lezer.
- Calendar Bridge: Gebruiker, Administrator.

Via de SAPOOV-werkruimte kunnen bijkomende rollen worden gemaakt en bestaande rollen worden aangepast of verwijderd. Rechtensleutels zijn applicatiespecifieke strings, bijvoorbeeld `orders.approve`, `personnel.read_all` of `reservations.manage_team`. De websites moeten deze sleutels server-side controleren. De sleutel `*` staat voor volledige toegang binnen die ene toepassing.

## Centrale API voor gekoppelde websites
De centrale API valideert de Cloudflare Access JWT zelf. Een website mag dus nooit een rol of e-mailadres vertrouwen dat enkel vanuit browser-JavaScript of een vrij invulbaar requestveld wordt meegestuurd.

Endpoint:
`GET https://<SAPOOV-WORKER>/api/access/<application-id>`

De website stuurt de originele header `cf-access-jwt-assertion` server-side door naar dit endpoint. Voorbeeld voor een Cloudflare Worker:

```js
const assertion = request.headers.get("cf-access-jwt-assertion");
const response = await fetch(
  "https://<SAPOOV-WORKER>/api/access/bestelplatform",
  { headers: { "cf-access-jwt-assertion": assertion } }
);
if (!response.ok) return new Response("Geen toegang", { status: 403 });
const access = await response.json();
// access.authorized, access.roles[].name en access.roles[].permissions
// Controleer de vereiste permission op de server, nooit enkel in de frontend.
const allowed = access.roles.some(role =>
  role.permissions.includes("*") || role.permissions.includes("orders.approve")
);
if (!allowed) return new Response("Onvoldoende rechten", { status: 403 });
```

## Configuratie vóór koppeling
1. Maak een Cloudflare D1-database aan met de naam `sapoov-db`.
2. Vul het database-ID in `wrangler.toml`.
3. Stel `CF_ACCESS_TEAM_DOMAIN` in op de Cloudflare Zero Trust-teamdomeinnaam.
4. Stel `CF_ACCESS_AUD` in als komma-gescheiden lijst van de Access-audience tags van alle gekoppelde websites. De centrale API accepteert alleen JWT's met een audience uit deze lijst.
5. Stel `SUPERADMIN_EMAILS` uitsluitend in op `arne.nys@gmail.com`.
6. Voer de D1-migraties uit.
7. Vul voor elke website in de SAPOOV-werkruimte de eigen Access-audience tag in. Die moet overeenkomen met de audience die de centrale API in de JWT ontvangt.

## Migratie van bestaande websites
De centrale gebruikers- en rollenwerkruimte en API zijn voorbereid. Een website is pas werkelijk centraal gekoppeld nadat haar eigen backend de API raadpleegt en haar lokale rolcontrole vervangt door de centrale rol- en permissioncontrole. Dat moet per toepassing worden getest, met behoud van bestaande gebruikersgegevens en functionele rechten. Tot die migratie blijft de bestaande lokale rechtencontrole van die website leidend.


## Dashboard performance and administration API

The dashboard loads the identity, application catalogue, users, roles and teams first. The larger education, personnel and student panels are fetched on demand when their section approaches the viewport. The active SAPOOV dashboard Worker also defers central user-management data until the superadministrator opens that workspace, and loads the audit log only when it comes into view.

The Pages API router forwards the dashboard endpoints (`/api/me`, `/api/admin/*` and `/api/access/*`) to the identity Worker. The identity Worker remains responsible for validating the Cloudflare Access JWT and enforcing the superadministrator check.

The existing `sapoov-central-identity` D1 database already contains the campuses, school years, classes, personnel profiles, students and enrolments tables. The current database has campus records for Ninove and Zottegem and 90 class records for school year 2026–2027. The API uses that existing schema directly; no additional table migration is required for these endpoints.

The Wrangler migration scripts target the existing D1 database name `sapoov-central-identity`. Do not create a second database or run a duplicate schema migration for these existing tables.

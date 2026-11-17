# Microsoft 365-aanmelding — Professionalisering

## Doel

Personeelsleden van Richtpunt campus Ninove–Zottegem melden zich aan met hun bestaande werk- of schoolaccount van Microsoft 365. De applicatie vraagt of bewaart nooit het Microsoft-wachtwoord.

## Voorgestelde authenticatie

- Microsoft Entra ID als identiteitsprovider.
- OpenID Connect (OIDC) met OAuth 2.0 Authorization Code Flow en PKCE.
- Single-tenant registratie: uitsluitend de Entra-tenant van de school/onderwijsinstelling.
- Productie-app op Cloudflare Workers; alle client secrets en andere vertrouwelijke waarden uitsluitend als Worker secrets.
- Server-side sessiecookie: HttpOnly, Secure, SameSite=Lax, beperkte levensduur en rotatie na login. Geen access tokens in URL's of logs.
- Controleer bij elke backend-aanvraag de handtekening, issuer, audience, expiry, nonce/state en tenant-ID. Accepteer geen account enkel omdat het e-mailadres een bepaald domein heeft.

## Microsoft Entra appregistratie

Maak een afzonderlijke appregistratie aan voor Professionalisering.

1. Supported account types: **Accounts in this organizational directory only**.
2. Platform: **Web** voor de server-side callback.
3. Redirect URI: `https://<productiedomein>/auth/callback`.
4. Front-channel logout URL: `https://<productiedomein>/signed-out` (indien gebruikt).
5. Gebruik een certificaat of een client secret als Worker secret; nooit in GitHub, HTML of browsercode.
6. Vraag minimale scopes aan: `openid profile email User.Read`.
7. Geef alleen de Graph-toegang die nodig is om het eigen profiel op te halen.

De definitieve redirect URI kan pas worden geregistreerd zodra het productiedomein vastligt.

## Profielgegevens

Na succesvolle authenticatie haalt de server met Microsoft Graph `GET /me?$select=id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department` de profielgegevens op.

- Gebruik de combinatie van tenant-ID (`tid`) en object-ID (`oid`) als stabiele externe identiteit.
- Naam en e-mailadres worden uit Microsoft 365 overgenomen.
- Het veld **Functie** wordt uit `jobTitle` gehaald. Als dit leeg is, toon dan 'Functie niet ingevuld in Microsoft 365'; laat het personeelslid dit niet zelf overschrijven.
- Sla alleen gegevens op die nodig zijn voor de werking en historiek.

## Autorisatie en rollen

Authenticatie bewijst wie de gebruiker is; autorisatie bepaalt wat die gebruiker mag doen.

- Onbekende accounts krijgen geen toegang tot de applicatiegegevens totdat ze door de administrator zijn toegelaten.
- Er is exact één administratoraccount, vooraf expliciet ingesteld door de eigenaar. Dit mag niet automatisch de eerste bezoeker worden.
- Directie krijgt leesrechten op alle personeelsgegevens en dossiers.
- Personeelsleden krijgen toegang tot hun eigen aanvragen, historiek en opvolgingsformulieren.
- TAC/TA, econoom en personeelsverantwoordelijke krijgen afzonderlijke, minimaal noodzakelijke rechten.
- Rollen worden server-side opgeslagen en gecontroleerd; nooit vertrouwen op een rol die de browser zelf meestuurt.
- Elke correctie door de administrator wordt in een onveranderbaar auditlog geregistreerd met actor, tijdstip, record, oude en nieuwe waarde.

## Technische gegevensstroom

1. Gebruiker kiest **Aanmelden met Microsoft 365**.
2. De applicatie start OIDC-login bij de tenant-specifieke Entra-authority.
3. Microsoft authenticeert de gebruiker en stuurt de browser terug naar de geregistreerde callback.
4. De server valideert de OIDC-respons en maakt een eigen sessie aan.
5. De server haalt het eigen profiel op via Microsoft Graph met de gedelegeerde `User.Read`-machtiging.
6. De server koppelt de gebruiker aan een bestaand personeelsaccount op basis van `tid + oid`; bij een eerste login volgt gecontroleerde activatie.
7. De backend controleert bij iedere aanvraag de rol en eigenaarschap van de gegevens.

## Beveiligingsvereisten

- HTTPS verplicht.
- OIDC state, nonce en PKCE controleren.
- Tenant-ID en token issuer strikt valideren.
- CSRF-bescherming op muterende acties.
- Cookies: HttpOnly, Secure, SameSite=Lax; sessie-ID roteren na login en rolwijziging.
- Rate limiting op login- en callbackroutes.
- Geen tokens, secrets, bankgegevens of gevoelige persoonsgegevens in logs.
- Auditlog voor rolwijzigingen en administratieve correcties.
- Afmeldroute die lokale sessie beëindigt en waar nodig Microsoft logout start.
- Toegangs- en bewaartermijnen afstemmen op het schoolbeleid en GDPR.

## Benodigde configuratie vóór livegang

De volgende gegevens moeten door de Entra-beheerder en applicatiebeheerder worden aangeleverd:

- Entra Directory (tenant) ID van de school.
- Application (client) ID van de nieuwe appregistratie.
- Productiedomein van Professionalisering en definitieve callback-URL.
- Worker secret (client secret of certificaat) via een beveiligd Cloudflare-secret, nooit via GitHub.
- Het exacte Microsoft 365-account dat als enige administrator wordt ingesteld.
- Bevestiging welke personeelsaccounts tot de toegelaten doelgroep behoren.

## Nog niet geconfigureerd

Deze documentatie legt de implementatie en beveiligingsvereisten vast. De live-aanmelding kan pas worden geactiveerd nadat de Entra-appregistratie, tenant-ID, client-ID, productiedomein en secrets beschikbaar zijn en de ICT-beheerder de vereiste toestemming heeft verleend.

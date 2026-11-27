# SAPOOV multi-tenant fundament — ontwerp en inventarisatie

Status: ontwerp bijgewerkt met bevestigde gebruikersbeslissingen; nog niet toegepast op productie.
Branch: `feature/sapoov-multi-tenant-foundation`
Basis: `feature/sapoov-central-dashboard`

## Doel

SAPOOV ondersteunt meerdere koepels. Elke koepel kan meerdere schoolbesturen bevatten, elk schoolbestuur meerdere scholen en elke school meerdere campussen/vestigingsplaatsen.

## Bevestigde architectuurkeuzes

1. Eén gedeelde codebasis voor de aankopenmodule.
2. Afzonderlijke gegevensopslag per school: eigen D1-database en eigen R2-opslag. Geen gedeelde bestellingen, catalogi, leveranciers, teams of bestanden tussen scholen.
3. Centrale identiteit en toegangsrechten in de bestaande SAPOOV-identiteitslaag.
4. Organisatiestructuur: koepel → schoolbestuur → school → campus.
5. De aankopenmodule wordt op schoolniveau beheerd. Campussen zijn onderdelen van een school en worden binnen die schoolcontext beheerd.
6. Rechten van koepel- en schoolbestuurbeheerders erven NIET automatisch door. Doorgifte naar onderliggende niveaus vereist expliciete toekenning.
7. Gebruikers die toegang hebben tot meerdere organisatiecontexten kiezen na aanmelden zelf de actieve context.
8. API's dwingen organisatiecontext en autorisatie server-side af. Een door de browser aangeleverde organisatie-ID is nooit op zichzelf bewijs van toegang.
9. Het platformbeheer blijft een technische beheerlaag, geen onderwijsorganisatieniveau.

## Bevestigde organisatiestructuur voor de eerste uitrol

- Huidige school: één school met twee campussen: Richtpunt campus Ninove en Richtpunt campus Zottegem. Deze twee campussen delen één schoolcontext en één aankopengegevensopslag.
- Nieuwe scholen: Richtpunt campus Hamme, Richtpunt campus Gent en Richtpunt campus Eeklo worden voor dit ontwerp drie afzonderlijke scholen. Elk krijgt een eigen schoolcontext, eigen D1-database en eigen R2-opslag.
- De formele naam/identiteit van de koepel en het schoolbestuur wordt nog ingevuld op basis van de officiële organisatiegegevens; die namen worden niet verondersteld of hard gecodeerd.

## Inventarisatie van de bestaande omgeving (27 november 2026)

### GitHub

- Centrale repository: `arnenys89/Arne`.
- De aankopenbroncode staat in `platforms/bestelplatform/`.
- De Cloudflare Pages-configuratie `sapoov-bestelplatform` bouwt uit die map.
- De huidige frontend gebruikt onder meer lokale campuswaarden en de huidige database gebruikt tekstvelden zoals `campus` bij gebruikers, bestellingen en teams.
- De broncode bevat een afzonderlijke API-workerbron en verwijst naar bestaande D1- en R2-resources.

### Cloudflare

- Bestaande aankopendatabase: `sapoov-bestelplatform` (D1, EU-jurisdictie).
- Bestaande centrale identiteitsdatabase: `sapoov-central-identity` (D1, EU-jurisdictie).
- Bestaande afbeeldingsbucket: `sapoov-bestelplatform-images`.
- Er bestaan al afzonderlijke Pages- en Worker-componenten voor dashboard, identity en aankopen. De huidige routeconfiguratie is een migratieafhankelijkheid en mag niet blind worden vervangen.

### Datamodel — vastgestelde huidige toestand

- De centrale identiteitsdatabase bevat `users`, `applications`, `roles` en `user_app_roles`.
- `user_app_roles.scope_json` bestaat al, maar bestaande toewijzingen gebruiken momenteel lege scopes (`{}`). Dit is nog geen volwaardige organisatiescope.
- Er is een centrale personeels-/campusstructuur aanwezig, maar nog geen volledige koepel → schoolbestuur → school → campus-hiërarchie.
- De aankopendatabase heeft tabellen voor gebruikers, teams, teamleden, bestellingen, catalogus, leveranciers en aankopen. Bestaande teams en gebruikers verwijzen nog naar campus via tekstwaarden.
- De inventarisatie heeft uitsluitend leesquery's uitgevoerd; er zijn geen bestaande gegevens gewijzigd.

## Voorgesteld centraal organisatiemodel

- `umbrella_organizations`: koepels.
- `school_boards`: schoolbesturen, met verplichte verwijzing naar een koepel.
- `schools`: scholen, met verplichte verwijzing naar een schoolbestuur.
- `campuses`: campussen, met verplichte verwijzing naar een school.

Elke entiteit krijgt een stabiele UUID, naam, unieke code, status en tijdstempels. Relaties gebruiken ID's, niet namen.

## Modules en rollen

- Elke moduleconfiguratie krijgt een toepassingsniveau: koepel, schoolbestuur, school of campus.
- De aankopenmodule is voor deze uitrol ingesteld op schoolniveau.
- Onderdelen en rollen blijven configureerbaar per module.
- Roltoewijzingen bevatten gebruiker, module, rol, organisatietype, organisatie-ID, expliciete overervingsinstelling, toewijzer en geldigheidsperiode.
- Overerving staat standaard uit. Ook koepel- en schoolbestuurbeheerders krijgen geen impliciete toegang tot onderliggende scholen.

## Contextselectie

Na centrale aanmelding haalt SAPOOV de actieve lidmaatschappen en roltoewijzingen op. Als een gebruiker meerdere toegestane schoolcontexten heeft, kiest die gebruiker zelf de actieve context. De API controleert bij elke aanvraag opnieuw de module, actie en context. Bij ontbrekende of ongeldige context volgt weigering, nooit een standaardcontext.

## Aankopenmodule: gegevensisolatie

De gedeelde frontend en API gebruiken dezelfde codebasis. Elke school krijgt een eigen D1-database met hetzelfde versiebeheerbare schema en een eigen R2-bucket/opslagruimte. De API resolveert de juiste resources server-side op basis van de geauthenticeerde gebruiker en diens expliciete rechten. De client krijgt geen D1-ID's of R2-credentials.

Beoogde eerste contexten:
1. Eén bestaande schoolcontext voor Ninove + Zottegem (twee campussen).
2. Eén nieuwe schoolcontext voor Hamme.
3. Eén nieuwe schoolcontext voor Gent.
4. Eén nieuwe schoolcontext voor Eeklo.

Nieuwe contexten starten leeg. Er worden geen bestellingen, persoonsgegevens, leveranciers of catalogusgegevens uit de bestaande school gekopieerd.

## Migratieprincipes

1. Eerst gecontroleerde exports/back-ups van bestaande D1 en R2 en inventarisatie van schema, bindings en routes.
2. Officiële organisatie-entiteiten en UUID's vastleggen.
3. Mapping maken van bestaande campuswaarden naar campus-ID's en school-ID's.
4. Nieuwe foreign keys toevoegen en oude tekstvelden tijdelijk behouden.
5. Bestaande gegevens mappen en controleren op ontbrekende of ongeldige relaties.
6. Aantallen per tabel, bestelgeschiedenis en steekproeven vergelijken.
7. API gecontroleerd laten overschakelen naar nieuwe ID's; daarna pas oude velden uitfaseren.
8. Voor Hamme, Gent en Eeklo lege contextdatabases aanmaken uit dezelfde migratiereeks.
9. Terugrolprocedure testen vóór productie-omschakeling.

## Acceptatiecriteria

- Gebruikers kunnen alleen contexten kiezen waarvoor ze expliciete rechten hebben.
- Een rol op koepel- of schoolbestuursniveau geeft niet automatisch toegang tot onderliggende niveaus.
- De gebruiker kiest na aanmelden zelf de actieve context.
- Ninove en Zottegem werken als twee campussen binnen één schoolcontext.
- Hamme, Gent en Eeklo zijn drie afzonderlijke schoolcontexten met gescheiden gegevensopslag.
- Gegevens en bestanden zijn niet tussen scholen leesbaar.
- Dezelfde codebasis kan een volgende school toevoegen zonder fork.
- Rechtenwijzigingen en contextwissels zijn auditbaar.

## Nog open vóór productiemigratie

- De officiële koepel en het schoolbestuur waartoe de vier schoolcontexten behoren, inclusief hun formele namen en IDs.
- De concrete mapping van bestaande personeelsleden en bestaande rollen naar de nieuwe organisatie-ID's.
- De exacte moduleonderdelen en permissies per rol.

## Veiligheidsgrens

Dit document legt de architectuur en de bevestigde keuzes vast. Er zijn geen productiedatabases, Workers, Pages-projecten, DNS-records, Access-policies of R2-objecten aangepast.
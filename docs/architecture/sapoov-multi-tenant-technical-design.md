# SAPOOV multi-tenant — technisch ontwerp

Status: ontwerp bijgewerkt met bevestigde gebruikersbeslissingen; nog niet toegepast op productie.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Ontwerpprincipes en bevestigde keuzes

- Eén centrale identiteit per persoon; een gebruiker kan lid zijn van meerdere organisaties.
- Organisatiestructuur: koepel → schoolbestuur → school → campus.
- Aankopen wordt beheerd op schoolniveau.
- Rechtenovererving staat standaard uit. Koepel- en schoolbestuurbeheerders krijgen uitsluitend onderliggende toegang na expliciete toekenning.
- Gebruikers kiezen na aanmelden zelf de actieve context als ze meerdere contexten hebben.
- Eén gedeelde codebasis voor Aankopen, met een afzonderlijke D1-database en R2-opslag per school.
- Alle autorisatie wordt server-side in de API afgedwongen.
- Mutaties van organisaties, rechten en gevoelige bestelgegevens zijn auditbaar.

## 2. Eerste organisatiestructuur

| Schoolcontext | School | Campussen | Gegevensopslag |
|---|---|---|---|
| Bestaand | Eén school (officiële naam nog te bevestigen) | Richtpunt campus Ninove; Richtpunt campus Zottegem | Bestaande D1 + bestaande R2 na gecontroleerde migratie |
| Nieuw 1 | Richtpunt campus Hamme | Hamme | Eigen D1 + eigen R2 |
| Nieuw 2 | Richtpunt campus Gent | Gent | Eigen D1 + eigen R2 |
| Nieuw 3 | Richtpunt campus Eeklo | Eeklo | Eigen D1 + eigen R2 |

Hamme, Gent en Eeklo worden dus niet als drie campussen van één school gemodelleerd, maar als drie afzonderlijke scholen. De formele koepel- en schoolbestuursrelaties moeten nog met officiële organisatiegegevens worden ingevuld.

## 3. Centraal identiteits- en organisatiemodel

### Organisatie-entiteiten

| Tabel | Belangrijkste velden | Relatie |
|---|---|---|
| umbrella_organizations | id, code, name, status | koepel |
| school_boards | id, umbrella_id, code, name, status | hoort bij één koepel |
| schools | id, school_board_id, code, name, status | hoort bij één schoolbestuur |
| campuses | id, school_id, code, name, address_json, status | hoort bij één school |

Alle ID's zijn UUID's. Namen zijn wijzigbaar en worden nooit als technische sleutel gebruikt.

### Gebruikers en lidmaatschappen

- `users` blijft de centrale loginidentiteit.
- `organization_memberships` koppelt user_id aan een organisatie-entiteit, met status en geldigheidsperiode.
- Een gebruiker kan meerdere actieve lidmaatschappen hebben.
- Een centraal gebruikersrecord geeft op zichzelf geen toegang tot een school.
- Een campuslidmaatschap maakt niet automatisch een lidmaatschap op school-, bestuurs- of koepelniveau.

## 4. Modules, onderdelen en rollen

| Tabel | Doel |
|---|---|
| applications | bestaande modules/applicaties |
| application_components | configureerbare onderdelen |
| application_scopes | toepassingsniveau en organisatiecontext per module |
| roles | configureerbare rollen per module/onderdeel |
| user_role_assignments | gebruiker + rol + expliciete organisatiescope + geldigheid |
| role_permissions | concrete acties zoals orders.read, orders.approve, suppliers.manage |

Een roltoewijzing bevat minimaal: user_id, role_id, application_id, organization_type, organization_id, inherit_to_descendants (boolean, default false), assigned_by, valid_from, valid_until en status. Het bestaande scope_json kan tijdelijk als compatibiliteitsveld blijven bestaan, maar mag niet de enige autorisatiebron zijn.

Voor Aankopen wordt application_scope ingesteld op schoolniveau. Campussen vallen onder de schoolcontext; de aankopenmodule heeft geen aparte database per campus.

## 5. Rechtenovererving

Overerving staat standaard UIT en vereist expliciete toekenning.

| Toekenningsniveau | Reikwijdte |
|---|---|
| Koepel | uitsluitend koepel zelf; onderliggende toegang alleen met expliciete overerving/toekenning |
| Schoolbestuur | uitsluitend schoolbestuur zelf; onderliggende toegang alleen met expliciete overerving/toekenning |
| School | die school; campussen binnen de school volgens de expliciete module-/rolscope |
| Campus | uitsluitend die campus |

De API bepaalt toegestane descendants vanuit de opgeslagen hiërarchie. Een client kan geen ruimere scope aanvragen. Een rol in koepel A geeft nooit toegang tot koepel B.

## 6. Contextkeuze na aanmelden

1. Cloudflare Access-authenticatie stelt de identiteit server-side vast.
2. De API haalt actieve lidmaatschappen en roltoewijzingen op.
3. SAPOOV toont uitsluitend de contexten waarvoor de gebruiker expliciete toegang heeft.
4. Bij één toegankelijke context kan die context direct worden geopend; bij meerdere contexten kiest de gebruiker zelf.
5. De actieve context wordt voor de sessie vastgelegd, maar is geen vervanging voor autorisatie.
6. De API controleert bij elke aanvraag opnieuw module, actie, gebruiker en context.
7. Een organisatie-ID uit URL, body of query wordt nooit blind vertrouwd.
8. Bij ontbrekende of ongeldige context volgt weigering; nooit stilzwijgend terugvallen op een standaardcontext.

## 7. Gegevensisolatie Aankopen

### Gedeelde code

Frontend en API blijven één codebasis. Schoolnamen en campusnamen worden niet hard-coded gebruikt om autorisatie of databasekeuze te bepalen.

### Per school afzonderlijke opslag

- Eigen D1-database met hetzelfde versiebeheerbare schema.
- Eigen R2-bucket per school (voorkeurskeuze) met afzonderlijke bindings/policies.
- Eigen leveranciers, catalogus, teams, bestellingen, aankopen en instellingen.
- Centrale identiteitsdatabase bevat identiteit, organisatiehiërarchie, moduleconfiguratie, lidmaatschappen en autorisatie; geen bestelregels of leveranciersgegevens.

### Contextregister

Een server-side contextregister koppelt school-ID aan interne D1- en R2-resource-identificatoren. Alleen geautoriseerde platformbeheerders kunnen dit wijzigen. De API resolveert resources pas na autorisatie. De client ontvangt nooit resourcegeheimen of database-ID's.

## 8. Migratie bestaande aankopenomgeving

Huidige tabellen omvatten onder meer users, teams, team_members, orders, order_items, catalog_items, suppliers, purchases en buyer_assignments. Campus wordt op verschillende plaatsen nog als tekst opgeslagen.

1. Maak gecontroleerde exports/back-ups van D1 en R2 en noteer bindings en Worker-routes.
2. Leg de UUID's vast voor de bestaande school en de campussen Ninove en Zottegem.
3. Maak expliciete mappings van bestaande campuswaarden naar campus-ID's en school-ID.
4. Voeg nieuwe foreign keys toe aan contextgebonden tabellen; behoud oude tekstvelden tijdelijk.
5. Vul foreign keys via gecontroleerde mapping en controleer NULL's, ongeldige relaties en duplicaten.
6. Vergelijk aantallen per tabel en campus; controleer bestelhistoriek en steekproeven.
7. Schakel de API gecontroleerd over naar de nieuwe ID's; houd een terugrolpad beschikbaar.
8. Maak drie lege databases voor Hamme, Gent en Eeklo op basis van dezelfde schema-migraties.
9. Maak per nieuwe school een eigen R2-bucket en configureer server-side bindings.
10. Schakel oude tekstvelden pas uit na observatieperiode en geslaagde terugroltest.

Geen persoonsgegevens, bestellingen, leveranciers of catalogus uit de bestaande school kopiëren naar de nieuwe schooldatabases.

## 9. Teambeheer

Teams zijn gekoppeld aan een schoolcontext. Teamleden worden aan centrale gebruikers gekoppeld en krijgen een positie: actief lid, passief lid of teamleider. Een gebruiker kan in verschillende teams verschillende posities hebben. Een teamleider moet ook lid zijn van het team. Campussen kunnen als filter of organisatorische toewijzing binnen de school worden gebruikt als dat voor het team relevant is.

Voorgestelde tabellen:
- teams(id, school_id, name, description, active)
- team_members(team_id, user_id, membership_type, campus_id nullable, valid_from, valid_until)

Unieke constraints voorkomen dubbele actieve lidmaatschappen binnen hetzelfde team.

## 10. Beheerinterface

### Organisatiebeheer
- Boomstructuur koepel → schoolbestuur → school → campus.
- Aanmaken, wijzigen en deactiveren; geen fysieke verwijdering van organisaties met gekoppelde gegevens.

### Teambeheer
- Personeelslijst filterbaar per school en campus.
- Per team rollen actief lid, passief lid en teamleider.
- Bulktoekenning en auditlog.

### Module- en rollenbeheer
- Selecteer gebruiker, module, onderdeel, rol en organisatiescope.
- Toon effectieve rechten en of die expliciet of via expliciete overerving zijn toegekend.
- Waarschuw bij brede scopes.
- Toon toewijzer, geldigheidsperiode en status.

## 11. Test- en acceptatieplan

1. Gebruiker zonder lidmaatschap krijgt geen toegang.
2. Campusrol ziet uitsluitend toegestane gegevens.
3. Schoolrol ziet de schoolcontext; campussen vallen onder dezelfde aankopen-D1.
4. Koepel-/bestuursrol krijgt geen onderliggende toegang zonder expliciete toekenning.
5. Gebruiker met meerdere contexten krijgt een contextkeuze na aanmelden.
6. Gemanipuleerde organization_id levert geen cross-context toegang op.
7. Bestellingen, catalogus, leveranciers, uploads en afbeeldingen zijn niet leesbaar tussen schoolcontexten.
8. Ninove en Zottegem blijven samen in de bestaande schoolcontext.
9. Hamme, Gent en Eeklo hebben elk een afzonderlijke lege gegevensopslag.
10. Rechtenwijzigingen en contextwissels zijn auditbaar.

## 12. Nog open vóór schema-implementatie

- Officiële naam en ID van de koepel en het schoolbestuur.
- Officiële schoolnaam en school-ID voor de bestaande school met campussen Ninove en Zottegem.
- Formele schoolbestuur-/koepelkoppeling en officiële IDs voor Hamme, Gent en Eeklo.
- Mapping van bestaande personeelsleden en rollen naar organisatie-ID's.
- Definitieve moduleonderdelen en permissies.

## 13. Grenzen van deze ontwerpstap

Dit document beschrijft het ontwerp en de bevestigde beslissingen. Er zijn nog geen tabellen aangemaakt, records gewijzigd, D1-databases gekloond of Workers, Pages-projecten, routes, DNS-instellingen of R2-buckets aangepast.
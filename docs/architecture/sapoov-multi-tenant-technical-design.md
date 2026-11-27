# SAPOOV multi-tenant — technisch ontwerp

Status: ontwerp, nog niet toegepast op productie.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Ontwerpprincipes

- Eén centrale identiteit per natuurlijke persoon; dezelfde gebruiker kan lid zijn van meerdere organisaties.
- Organisatiegebonden lidmaatschappen en rechten: toegang volgt nooit automatisch uit het bestaan van een centraal gebruikersrecord.
- Organisatiehiërarchie: koepel → schoolbestuur → school → campus.
- Een module heeft een expliciet toepassingsniveau. Het aankopenplatform wordt op schoolniveau beheerd.
- De aankopenmodule gebruikt gedeelde code maar strikt gescheiden D1-databases en R2-opslag per schoolcontext.
- Alle autorisatie wordt server-side in de API gecontroleerd.
- Elke mutatie van organisaties, rechten en gevoelige bestelgegevens wordt auditbaar.

## 2. Bevestigde organisatorische beslissingen

1. Richtpunt campus Ninove-Zottegem is één school met twee campussen: Ninove en Zottegem.
2. Richtpunt Hamme is een afzonderlijke school.
3. Richtpunt Gent is een afzonderlijke school.
4. Richtpunt Eeklo is een afzonderlijke school.
5. De formele koepel en het schoolbestuur moeten nog aan deze organisaties worden gekoppeld; deze namen/relaties worden niet verondersteld.

Schematisch:

- Koepel
  - Schoolbestuur
    - Richtpunt campus Ninove-Zottegem
      - Campus Ninove
      - Campus Zottegem
    - Richtpunt Hamme
    - Richtpunt Gent
    - Richtpunt Eeklo

## 3. Centraal identiteits- en organisatiemodel

### Organisatie-entiteiten

| Tabel | Belangrijkste velden | Relatie |
|---|---|---|
| umbrella_organizations | id, code, name, status | bovenliggend niveau |
| school_boards | id, umbrella_id, code, name, status | hoort bij één koepel |
| schools | id, school_board_id, code, name, status | hoort bij één schoolbestuur |
| campuses | id, school_id, code, name, address_json, status | hoort bij één school |

Alle ID's zijn UUID's. Namen zijn wijzigbaar en worden nooit als technische sleutel gebruikt.

### Gebruikers en lidmaatschappen

- users blijft de centrale persoons-/loginidentiteit.
- organization_memberships koppelt user_id aan een organisatie-entiteit met status en geldigheidsperiode.
- Een gebruiker kan meerdere actieve lidmaatschappen hebben.
- Personeelsgegevens blijven gescheiden van authenticatiegegevens.
- Een campuslidmaatschap creëert niet automatisch een lidmaatschap op school-, bestuurs- of koepelniveau.

## 4. Modules, onderdelen en rollen

| Tabel | Doel |
|---|---|
| applications | bestaande modules/applicaties |
| application_components | configureerbare onderdelen binnen een module |
| application_scopes | koppelt module aan organisatietype en organisatie-ID |
| roles | rollen per module of onderdeel |
| user_role_assignments | gebruiker + rol + expliciete scope + geldigheidsperiode + toewijzer |
| role_permissions | concrete acties zoals orders.read, orders.approve, suppliers.manage |

Een roltoewijzing bevat minimaal: user_id, role_id, application_id, organization_type, organization_id, assigned_by, valid_from, valid_until en status.

## 5. Rechtenovererving

**Beslissing: rechten worden niet automatisch overgeërfd.** Een rol op koepelniveau of schoolbestuursniveau geeft niet vanzelf toegang tot onderliggende scholen. Een beheerder moet expliciet aangeven op welke onderliggende organisatie(s) de rol van toepassing is.

- Koepelrol: uitsluitend koepelniveau, tenzij expliciet uitgebreid naar benoemde onderliggende organisaties.
- Schoolbestuursrol: uitsluitend bestuursniveau, tenzij expliciet uitgebreid naar benoemde scholen.
- Schoolrol: uitsluitend die school, tenzij expliciet uitgebreid naar benoemde campussen.
- Campusrol: uitsluitend die campus.

De API controleert de concrete scope bij iedere aanvraag. Een rol in koepel A geeft nooit toegang tot koepel B.

## 6. Contextselectie en API-beveiliging

1. Na Cloudflare Access-authenticatie wordt de identiteit server-side vastgesteld.
2. De API haalt actieve lidmaatschappen en roltoewijzingen op.
3. **Een gebruiker die toegang heeft tot meerdere contexten kiest na het aanmelden zelf de actieve context.**
4. Alleen contexten waarvoor een expliciete actieve roltoewijzing bestaat, worden aangeboden.
5. De API controleert bij iedere aanvraag module, actie, organisatiecontext en scope.
6. De API resolveert zelf de juiste database- en R2-configuratie.
7. Een organization_id, campus_id, databasekeuze of bucketnaam uit de browser wordt nooit blind vertrouwd.
8. Bij ontbrekende of dubbelzinnige context volgt een weigering; er is geen stille terugval naar een standaardcontext.

Auditregistratie bevat actor, actie, doelrecord, context-ID, tijdstip en relevante wijzigingssamenvatting. Geen tokens of geheimen in logs.

## 7. Aankopenmodule: toepassingsniveau en gegevensisolatie

**Beslissing: de aankopenmodule wordt op schoolniveau beheerd.**

Dat betekent:
- Richtpunt campus Ninove-Zottegem krijgt één aankopenconfiguratie en één eigen gegevenscontext voor beide campussen.
- Richtpunt Hamme krijgt een afzonderlijke configuratie en database.
- Richtpunt Gent krijgt een afzonderlijke configuratie en database.
- Richtpunt Eeklo krijgt een afzonderlijke configuratie en database.
- Binnen de schoolcontext kunnen bestellingen desgewenst aan de campus Ninove of Zottegem worden gekoppeld. Die campusaanduiding is operationele metadata en vormt geen aparte aankopendatabase.

### Gedeelde code en afzonderlijke opslag

- Eén gedeelde frontend en API-codebasis.
- Per school een eigen D1-database met hetzelfde versiebeheerbare schema.
- Per school een eigen R2-bucket (voorkeurskeuze) voor afbeeldingen en documenten.
- Eigen leveranciers, catalogus, teams, bestellingen, aankopen en instellingen per school.
- Centrale identiteitsdatabase bevat identiteit, organisatiehiërarchie, moduleconfiguratie, lidmaatschappen en autorisatie, geen bestelregels of leveranciersgegevens.

Een server-side contextregister koppelt de school-ID aan de interne D1- en R2-resource-identificatoren. Alleen de API kiest resources na autorisatie.

## 8. Migratie van het huidige bestelplatform

De huidige database bevat gebruikers, teams, teamleden, bestellingen, catalogus, leveranciers en aankopen. Campus wordt op verschillende plaatsen nog als tekst opgeslagen.

1. Maak gecontroleerde exports/back-ups van bestaande D1 en R2 en noteer bindings en Worker-routes.
2. Leg officiële organisatie-entiteiten en UUID's vast.
3. Koppel bestaande campuswaarden Ninove en Zottegem aan de twee campus-ID's onder één school-ID.
4. Voeg school- en campusforeign keys toe aan contextgebonden records; behoud oude tekstvelden tijdens de overgang.
5. Vul nieuwe foreign keys via expliciete mappings en controleer NULL's, relaties en dubbels.
6. Vergelijk aantallen per tabel en per campus en controleer steekproeven op bestelgeschiedenis.
7. Schakel de API gecontroleerd om naar de nieuwe ID's.
8. Maak voor Hamme, Gent en Eeklo elk een lege database aan vanuit dezelfde schema-migraties. Kopieer geen persoonsgegevens of bestellingen.
9. Schakel oude tekstvelden pas uit na observatieperiode en geteste terugrolprocedure.

De bestaande Ninove/Zottegem-database blijft behouden als bron tot de migratie gevalideerd is.

## 9. Teambeheer

Teamdefinities worden gekoppeld aan de school waarop het team actief is. Teamleden krijgen per team een positie: actief lid, passief lid of teamleider. Een teamleider is ook lid van het team. Dezelfde persoon kan in meerdere teams verschillende posities hebben.

## 10. Beheerinterface

### Organisatiebeheer
- Boomstructuur koepel → schoolbestuur → school → campus.
- Aanmaken, wijzigen en deactiveren; geen fysieke verwijdering van organisaties met gekoppelde gegevens.

### Teambeheer
- Personeelslijst filterbaar per school/campus.
- Per team actief lid, passief lid en teamleider beheren.

### Module- en rollenbeheer
- Selecteer gebruiker, module, onderdeel, rol en organisatiescope.
- Expliciete toekenning aan onderliggende organisaties; geen automatische overerving.
- Toon effectieve rechten, bron, toewijzer en vervaldatum.

### Contextkeuze
- Na aanmelden kiest een gebruiker met meerdere toegankelijke contexten zelf de actieve context.
- De actieve context wordt zichtbaar getoond.
- Elke API-aanvraag valideert die context opnieuw.

## 11. Test- en acceptatieplan

1. Identiteit zonder lidmaatschap krijgt geen moduletoegang.
2. Een campusrol ziet uitsluitend gegevens van die campus.
3. Een schoolrol ziet schoolgegevens; campusdetails worden alleen getoond volgens de toegekende rechten.
4. Een koepel- of schoolbestuursrol krijgt geen onderliggende toegang zonder expliciete toekenning.
5. Een gebruiker met meerdere contexten kan na aanmelden kiezen; elke keuze wordt afzonderlijk gecontroleerd.
6. Een gemanipuleerde organization_id in URL, body of query geeft geen cross-context toegang.
7. Bestellingen, catalogus, leveranciers, uploads en afbeeldingen zijn niet leesbaar tussen scholen.
8. Bestaande Ninove/Zottegem-records blijven behouden.
9. Hamme, Gent en Eeklo starten elk met een lege, afzonderlijke gegevensopslag.
10. Rechtenwijzigingen en contextwissels zijn auditbaar.

## 12. Nog te bevestigen vóór schema-implementatie

- De officiële naam en ID van de koepel en het schoolbestuur.
- De formele koppeling van de vier scholen aan het schoolbestuur.
- De bestaande gebruikersrollen die naar welke organisatie-ID's moeten worden gemapt.
- De gewenste concrete rollen en permissies per onderdeel van het aankopenplatform.

## 13. Grenzen van deze ontwerpstap

Dit document specificeert het goedgekeurde ontwerp; het is nog geen toegepaste productiemigratie. Er zijn geen tabellen aangemaakt, geen records gewijzigd, geen D1-databases gekloond en geen Workers, Pages-projecten, routes, DNS-instellingen of R2-buckets aangepast.

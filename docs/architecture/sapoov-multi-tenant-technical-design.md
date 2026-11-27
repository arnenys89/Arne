# SAPOOV multi-tenant — technisch ontwerp

Status: ontwerp, nog niet toegepast op productie.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Ontwerpprincipes

- Eén centrale identiteit per natuurlijke persoon; dezelfde gebruiker kan lid zijn van meerdere organisaties.
- Organisatiegebonden lidmaatschappen en rechten: toegang volgt nooit automatisch uit het bestaan van een centraal gebruikersrecord.
- Organisatiehiërarchie met vaste relaties: koepel → schoolbestuur → school → campus.
- Een module heeft één expliciet toepassingsniveau per configuratie. Een module die op schoolniveau draait, wordt niet stilzwijgend campusbreed of koepelbreed.
- De aankopenmodule gebruikt gedeelde code maar strikt gescheiden D1-databases en R2-opslag per gegevenscontext.
- Alle autorisatie wordt in de API gecontroleerd; frontend-verberging van knoppen is geen beveiligingsmaatregel.
- Elke mutatie van organisaties, rechten en gevoelige bestelgegevens wordt auditbaar.

## 2. Voorgesteld centraal identiteits- en organisatiemodel

### Organisatie-entiteiten

| Tabel | Belangrijkste velden | Relatie |
|---|---|---|
| umbrella_organizations | id, code, name, status | bovenliggend niveau |
| school_boards | id, umbrella_id, code, name, status | hoort bij één koepel |
| schools | id, school_board_id, code, name, status | hoort bij één schoolbestuur |
| campuses | id, school_id, code, name, address_json, status | hoort bij één school |

Alle ID's zijn UUID's. Codes zijn uniek binnen hun bovenliggende organisatie. Namen zijn wijzigbaar en worden nooit als technische sleutel gebruikt.

### Gebruikers en lidmaatschappen

- users blijft de centrale persoons-/loginidentiteit: stabiel user_id, e-mailadres en weergavenaam.
- organization_memberships koppelt user_id aan een organisatie-entiteit (type + ID), met status, begin- en einddatum.
- Een gebruiker kan meerdere actieve lidmaatschappen hebben, bijvoorbeeld in twee scholen of twee koepels.
- Personeelsgegevens zoals personeelsnummer en aanstellingsstatus blijven gescheiden van authenticatiegegevens.
- Een campuslidmaatschap mag niet automatisch een lidmaatschap op school-, bestuurs- of koepelniveau creëren.

### Modules, onderdelen en rollen

| Tabel | Doel |
|---|---|
| applications | bestaande modules/applicaties; behoudt de stabiele application_id |
| application_components | configureerbare onderdelen binnen een module |
| application_scopes | koppelt module aan organisatietype en organisatie-ID |
| roles | rollen per module of onderdeel, met machineleesbare permission keys |
| user_role_assignments | gebruiker + rol + expliciete scope + geldigheidsperiode + toewijzer |
| role_permissions | concrete acties zoals orders.read, orders.approve, suppliers.manage |

Een roltoewijzing bevat minimaal: user_id, role_id, application_id, organization_type, organization_id, assigned_by, valid_from, valid_until en status. Het huidige scope_json kan tijdelijk als compatibiliteitsveld blijven bestaan, maar mag niet de enige autorisatiebron worden.

## 3. Rechtenovererving

Overerving staat standaard UIT. Per roltoewijzing kan expliciet worden ingesteld of de rol geldt voor onderliggende niveaus.

| Toekenningsniveau | Mogelijke reikwijdte |
|---|---|
| Koepel | alle schoolbesturen, scholen en campussen onder die koepel, alleen indien overerving aanstaat |
| Schoolbestuur | scholen en campussen onder dat bestuur, alleen indien overerving aanstaat |
| School | campussen van die school, alleen indien overerving aanstaat |
| Campus | uitsluitend die campus |

De API bepaalt de toegestane descendant-organisaties vanuit de opgeslagen hiërarchie. Een client mag geen ruimere scope aanvragen dan de gebruiker bezit. Een rol in koepel A geeft nooit toegang tot koepel B.

## 4. Contextselectie en API-beveiliging

1. Na Cloudflare Access-authenticatie wordt de identiteit server-side vastgesteld.
2. De API haalt de actieve lidmaatschappen en roltoewijzingen van die gebruiker op.
3. De gebruiker kiest alleen uit de contexten waarvoor een actieve roltoewijzing bestaat.
4. De API controleert bij elke aanvraag opnieuw module, actie, organisatiecontext en eventuele overerving.
5. De API resolveert zelf de juiste database- en R2-configuratie voor de context.
6. Een organization_id, campus_id, databasekeuze of bucketnaam uit de browser wordt nooit blind vertrouwd.
7. Bij ontbrekende of dubbelzinnige context volgt een weigering (403/400), nooit een terugval naar een standaardcontext.

Voor auditregistratie worden actor, actie, doelrecord, context-ID, tijdstip en relevante wijzigingssamenvatting opgeslagen. Geen Access-tokens of andere geheimen in logs.

## 5. Gegevensisolatie van Aankopen

### Gedeelde code

De frontend en API-code blijven één codebasis. Dezelfde versie kan voor meerdere schoolcontexten worden uitgerold. De code bevat geen vaste campusnamen of schoolnamen als autorisatie- of databasekeuze.

### Per context afzonderlijke opslag

- Eigen D1-database met hetzelfde versiebeheerbare schema.
- Eigen R2-bucket of strikt gescheiden opslagruimte met afzonderlijke credentials/policies; voorkeurskeuze is een aparte bucket per context.
- Eigen configuratie voor leveranciers, catalogus, teams, bestellingen, aankopen en instellingen.
- Centrale identiteitsdatabase bevat alleen identiteit, organisatiehiërarchie, moduleconfiguratie, lidmaatschappen en autorisatie. Geen bestelregels of leveranciersgegevens.

### Contextregister

Een server-side contextregister koppelt een organisatiecontext aan de interne D1- en R2-resource-identificatoren. Deze configuratie is uitsluitend door platformbeheerders wijzigbaar en bevat geen publiek uitleesbare resourcegeheimen. De API kiest de resource na autorisatie; de client krijgt nooit D1-ID's of R2-credentials.

## 6. Migratie van het huidige bestelplatform

De huidige tabellen bevatten onder meer users, teams, team_members, orders, order_items, catalog_items, suppliers, purchases en buyer_assignments. Campus wordt op verschillende plaatsen nog als tekst opgeslagen.

Voorgestelde migratiestappen:

1. Maak gecontroleerde exports/back-ups van bestaande D1 en R2 en noteer de huidige bindings en Worker-routes.
2. Leg de officiële organisatie-entiteiten en UUID's vast; geen organisaties afleiden uit alleen een campusnaam.
3. Maak een mappingtabel van de huidige campuswaarden naar nieuwe campus-ID's en de bijhorende school-ID's.
4. Voeg organization/campus foreign keys toe aan teams, users, orders, buyer_assignments en andere contextgebonden records. Behoud oude tekstvelden tijdens de overgang.
5. Vul de nieuwe foreign keys via expliciete mappings en controleer op NULL's, ongeldige relaties en dubbele records.
6. Vergelijk aantallen per tabel en per campus, controleer relaties en voer steekproeven uit op bestelgeschiedenis.
7. Laat de API tijdelijk zowel de oude als nieuwe representatie lezen, maar schrijf na gecontroleerde omschakeling alleen nog de nieuwe ID's.
8. Maak voor iedere nieuwe context een lege database aan uit dezelfde migratiereeks. Kopieer geen bestaande persoons- of bestelgegevens.
9. Schakel de oude velden pas uit na een observatieperiode en een geteste terugrolprocedure.

De bestaande Ninove/Zottegem-database blijft de bron voor de huidige context tot de migratie expliciet gevalideerd is. Hamme/Gent/Eeklo krijgt pas een aparte database nadat de formele school- en campusrelaties bevestigd zijn.

## 7. Teambeheer

Teamdefinities zijn contextgebonden en horen bij de organisatie waarop het team actief is. Teamleden krijgen een relatie met een expliciete positie: actief lid, passief lid of teamleider. Een gebruiker kan in verschillende teams verschillende posities hebben. Een teamleider moet ook als lid geregistreerd zijn. De database legt unieke combinaties vast zodat een persoon niet dubbel in hetzelfde team voorkomt.

Voorstel voor teamtabellen: teams(id, organization_type, organization_id, name, description, active) en team_members(team_id, user_id, membership_type, valid_from, valid_until). membership_type krijgt de waarden active, passive en leader. Eventueel wordt teamleider als afzonderlijke vlag/relatie gemodelleerd als meerdere teamleiders mogelijk moeten zijn.

## 8. Beheerinterface

### Organisatiebeheer

- Boomstructuur van koepels naar campussen.
- Aanmaken, wijzigen, deactiveren en verplaatsen met controle op bestaande afhankelijkheden.
- Geen fysieke verwijdering van organisaties met gekoppelde gegevens; deactiveren en historiseren.

### Teambeheer

- Personeelslijst filterbaar per organisatie/campus.
- Teamkolommen of teamdetailweergave met actief lid, passief lid en teamleider.
- Bulktoekenning en export, met auditregistratie.

### Module- en rollenbeheer

- Selecteer gebruiker, module, onderdeel, rol en organisatiescope.
- Toon de effectieve rechten inclusief de bron van overerving.
- Waarschuw bij brede scopes zoals koepel of schoolbestuur.
- Toon vervaldatum en toewijzer; ondersteun tijdelijke rechten.

## 9. Test- en acceptatieplan

1. Identiteit zonder lidmaatschap krijgt geen moduletoegang.
2. Een campusrol ziet uitsluitend gegevens van die campus.
3. Een schoolrol ziet meerdere campussen alleen als expliciete overerving aanstaat.
4. Een bestuurs- of koepelrol ziet uitsluitend descendants van die entiteit.
5. Een gebruiker met twee contexten kan wisselen, maar de API controleert elke context afzonderlijk.
6. Een gemanipuleerde organization_id in URL, body of query levert geen cross-context toegang op.
7. Bestellingen, catalogus, leveranciers, uploads en afbeeldingen zijn niet leesbaar tussen contexten.
8. Bestaande Ninove/Zottegem-records blijven volledig beschikbaar na migratie.
9. Een nieuwe context start leeg en krijgt geen records van de bestaande context.
10. Rechtenwijzigingen, contextwijzigingen en beheermutaties zijn auditbaar.

## 10. Beslissingen die nog nodig zijn vóór schema-implementatie

1. Zijn Ninove en Zottegem formeel twee campussen van één school, of twee afzonderlijke scholen?
2. Zijn Hamme, Gent en Eeklo campussen van één school, of afzonderlijke scholen? Wat is hun schoolbestuur en koepel?
3. Moet de aankopenmodule op schoolniveau of campusniveau geconfigureerd worden? De gegevens blijven per afgesproken schoolcontext gescheiden, maar het toepassingsniveau bepaalt wie de module beheert.
4. Mag een koepelbeheerder standaard onderliggende organisaties beheren, of moet elke overerving afzonderlijk worden aangezet?
5. Moeten gebruikers met rechten in meerdere contexten na aanmelden zelf een actieve context kiezen, of moet SAPOOV een standaardcontext voorstellen en expliciet laten bevestigen?

## 11. Grenzen van deze ontwerpstap

Dit document specificeert het beoogde model, niet een reeds toegepaste migratie. Er zijn geen tabellen aangemaakt, geen records gewijzigd, geen D1-databases gekloond en geen Workers, Pages-projecten, routes, DNS-instellingen of R2-buckets aangepast.
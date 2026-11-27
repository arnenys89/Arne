# SAPOOV multi-tenant fundament — ontwerp en inventarisatie

Status: ontwerpdocument op ontwikkelbranch; geen productiegegevens of productieconfiguratie gewijzigd.
Branch: `feature/sapoov-multi-tenant-foundation`
Basis: `feature/sapoov-central-dashboard`

## Doel

SAPOOV moet meerdere koepels kunnen ondersteunen. Elke koepel kan meerdere schoolbesturen bevatten, elk schoolbestuur meerdere scholen en elke school meerdere campussen/vestigingsplaatsen. Het huidige gebruik met één koepel en een beperkt aantal schoolcontexten mag geen hard-coded uitgangspunt blijven.

## Vastgelegde architectuurkeuzes

1. Eén gedeelde codebasis voor de aankopenmodule.
2. Afzonderlijke gegevensopslag per aankopen-/organisatiecontext. Geen gedeelde bestellingen, catalogi, leveranciers, teams of bestanden tussen contexten.
3. Centrale identiteit en toegangsrechten in de bestaande SAPOOV-identiteitslaag.
4. Organisatiestructuur: koepel → schoolbestuur → school → campus.
5. Elke module krijgt een configureerbaar toepassingsniveau: koepel, schoolbestuur, school of campus. Het platformbeheer blijft een technische beheerlaag, geen onderwijsorganisatieniveau.
6. Gebruikers kunnen rollen krijgen met een expliciete organisatiescope. Een rol op hoger niveau kan waar nodig doorwerken naar onderliggende niveaus, maar mag nooit impliciet toegang geven tot een andere koepel.
7. API's moeten autorisatie en organisatiecontext server-side afdwingen. Een door de browser aangeleverde organisatie-ID is nooit op zichzelf voldoende bewijs van toegang.

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
- Er bestaan al afzonderlijke Pages- en Worker-componenten voor dashboard, identity en aankopen. De huidige routeconfiguratie is daarom een migratieafhankelijkheid en mag niet blind worden vervangen.

### Datamodel — vastgestelde huidige toestand

- De centrale identiteitsdatabase bevat `users`, `applications`, `roles` en `user_app_roles`.
- `user_app_roles.scope_json` bestaat al, maar de bestaande toewijzingen gebruiken momenteel lege scopes (`{}`). Dit is dus nog geen volwaardige organisatiescope.
- Er is een centrale personeels-/campusstructuur aanwezig, maar er is nog geen volledige koepel → schoolbestuur → school → campus-hiërarchie vastgesteld.
- De aankopendatabase heeft tabellen voor gebruikers, teams, teamleden, bestellingen, catalogus, leveranciers en aankopen. De bestaande teams en gebruikers verwijzen nog naar campus via tekstwaarden.
- De huidige aankopendatabase bevat bestaande teamrecords. De inventarisatie heeft uitsluitend leesquery's uitgevoerd; er zijn geen rijen gewijzigd.

## Voorgesteld centraal organisatiemodel

### Organisaties

- `umbrella_organizations`: koepels.
- `school_boards`: schoolbesturen, met verplichte verwijzing naar een koepel.
- `schools`: scholen, met verplichte verwijzing naar een schoolbestuur.
- `campuses`: campussen/vestigingsplaatsen, met verplichte verwijzing naar een school.

Elke entiteit krijgt een stabiele UUID, naam, unieke code, status en tijdstempels. Verwijzingen gebeuren via ID's, niet via namen.

### Modules en rollen

- Een module krijgt een toepassingsniveau: `umbrella`, `school_board`, `school` of `campus`.
- Een moduleconfiguratie wordt gekoppeld aan de organisatie-entiteit waarop ze van toepassing is.
- Onderdelen en rollen blijven configureerbaar per module.
- Een roltoewijzing bevat minimaal gebruiker, module, rol, organisatietype, organisatie-ID, toewijzer en tijdstip.
- Voor bestaande `user_app_roles` moet een migratieplan worden gemaakt dat de huidige toegang behoudt totdat de scopes expliciet zijn gevalideerd.

## Aankopenmodule: beoogde scheiding

De gedeelde frontend en API werken met een server-side opgeloste context. Elke organisatiecontext krijgt een eigen gegevensdatabase en eigen objectopslagprefix of bucketbeleid. De API kiest de database op basis van de geauthenticeerde gebruiker, zijn expliciete roltoewijzing en de moduleconfiguratie.

De huidige context met Ninove en Zottegem blijft behouden. Een tweede context voor Hamme, Gent en Eeklo wordt pas geactiveerd nadat de formele koppeling aan school, schoolbestuur en koepel bevestigd is. De namen van die organisatorische bovenliggende entiteiten worden niet gegokt.

## Migratieprincipes

1. Eerst een back-up/export en inventarisatie van schema, bindings, routes en bestaande gegevens.
2. Nieuwe organisatie-ID's en mappingtabel toevoegen; bestaande campusvelden tijdelijk behouden.
3. Bestaande team- en gebruikersgegevens mappen naar de correcte campus-ID's.
4. Autorisatie in de API implementeren en testen vóór frontend-contextkeuze.
5. Pas na vergelijking van aantallen en steekproeven de oude tekstvelden uitfaseren.
6. Een nieuwe contextdatabase aanmaken op basis van een lege, versiebeheerbare schema-migratie; nooit de bestaande productie-D1-database klonen met persoonsgegevens of bestellingen.
7. Afzonderlijke R2-opslag en expliciete toegangscontrole voor elk contextdomein.

## Acceptatiecriteria

- Een gebruiker kan alleen contexten selecteren waarvoor hij expliciete rechten heeft.
- Een gebruiker van de ene koepel kan geen gegevens van een andere koepel lezen of wijzigen, ook niet via rechtstreekse API-aanroepen.
- Rollen op koepel- of schoolbestuursniveau volgen uitsluitend de expliciet ingestelde overervingsregels.
- De bestaande Ninove/Zottegem-werking en bestaande records blijven behouden.
- Hamme/Gent/Eeklo krijgt eigen gegevensopslag en eigen configuratie.
- Dezelfde codebasis kan een volgende schoolcontext toevoegen zonder een fork of kopie van de applicatiecode.
- Alle contextwissels en wijzigingen aan rollen zijn auditbaar.

## Nog te bevestigen vóór productiemigratie

- De formele koepel-, schoolbestuur-, school- en campusrelaties voor beide groepen.
- Of Hamme, Gent en Eeklo campussen van één school zijn of afzonderlijke scholen.
- Of Ninove en Zottegem in de officiële organisatiestructuur campussen van één school zijn of aparte scholen.
- Welke bestaande gebruikersrollen op welke organisatie-ID's moeten worden gemapt.

## Veiligheidsgrens van deze fase

Dit document is de eerste ontwerp-/inventarisatiefase op een aparte GitHub-branch. Er zijn geen productiedatabases, Workers, Pages-projecten, DNS-records, Access-policies of R2-objecten aangepast.
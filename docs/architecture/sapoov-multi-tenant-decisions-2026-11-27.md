# SAPOOV multi-tenant — bevestigde ontwerpbeslissingen

Datum: 27 november 2026
Status: organisatorische beslissingen vastgelegd; technische implementatie nog niet gestart.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Organisatiestructuur
SAPOOV moet meerdere koepels ondersteunen, met meerdere schoolbesturen per koepel, meerdere onderwijsinstellingen per bestuur en meerdere campussen per instelling. De hiërarchie is koepel → schoolbestuur → onderwijsinstelling → campus.

De huidige bevestigde bovenliggende structuur is:
- **Koepel:** Provinciaal Onderwijs Vlaanderen.
- **Schoolbestuur:** Provinciebestuur Oost-Vlaanderen.

De organisatiestructuur moet later bijkomende koepels en schoolbesturen kunnen bevatten. De huidige namen mogen dus niet als vaste waarden in de applicatiecode worden ingebakken.

## 2. Bevestigde instellingen en campussen

### Secundair onderwijs
- **Richtpunt campus Ninove-Zottegem:** één schoolcontext met twee campussen: Ninove en Zottegem.
- **Richtpunt campus Eeklo:** afzonderlijke schoolcontext.
- **Richtpunt campus Hamme:** afzonderlijke schoolcontext.
- **Richtpunt Gent:** één schoolcontext met twee campussen:
  - Gent – Henlikai (officiële schrijfwijze nog te bevestigen).
  - Gent – Hotwijselaan.

### Basisonderwijs
- **Kimpunt Campus Assenede:** afzonderlijke basisschool.
- **Kimpunt Campus Eeklo:** afzonderlijke basisschool.

De schrijfwijze van “Kimpunt” en de officiële schrijfwijze van “Assenede” in de volledige instellingsnaam moeten nog worden bevestigd.

### Volwassenenonderwijs
- **Groeipunt:** instelling voor volwassenenonderwijs binnen hetzelfde schoolbestuur.
- De eventuele campussen/vestigingsplaatsen van Groeipunt zijn nog niet gespecificeerd.

Voorlopig zijn er dus zeven onderwijsinstellingen/contexten onder Provinciebestuur Oost-Vlaanderen: vier secundaire scholen, twee basisscholen en één instelling voor volwassenenonderwijs. De formele juridische/administratieve namen en officiële identificatiecodes moeten nog worden bevestigd.

## 3. Functionele en organisatorische modellering
Het datamodel mag niet veronderstellen dat elke instelling een secundaire school is. Voorzie daarom een configureerbaar instellingstype of onderwijsniveau, minstens:
- secundair onderwijs;
- basisonderwijs;
- volwassenenonderwijs.

Gebruik een generiek organisatietype voor de onderliggende onderwijsinstelling, zodat ook andere onderwijsvormen later kunnen worden toegevoegd. Campussen zijn afzonderlijke entiteiten onder een instelling; een instelling kan één of meerdere campussen hebben of voorlopig zonder opgesomde campuslocaties geregistreerd worden.

## 4. Bevestigde functionele keuzes
1. De aankopenmodule wordt beheerd op school-/instellingsniveau.
2. Eén gedeelde codebasis voor alle schoolcontexten.
3. Afzonderlijke D1-database en R2-bucket per schoolcontext.
4. Centrale identiteit en autorisatie via de bestaande SAPOOV-identiteitslaag.
5. Rechten op koepel- en schoolbestuurniveau werken uitsluitend door na expliciete toekenning. Overerving staat standaard uit.
6. Een gebruiker met toegang tot meerdere contexten kiest na aanmelden zelf de actieve context.
7. Modules kunnen configureerbaar zijn op koepel-, schoolbestuur-, instelling- of campusniveau.
8. Autorisatie wordt server-side afgedwongen. Een door de client aangeleverde organisatie-ID verleent nooit op zichzelf toegang.

## 5. Technische inrichting
- Organisatietabellen: umbrella_organizations, school_boards, educational_institutions (of schools als generieke tabel), en campuses.
- Onderwijsniveau/instellingstype is configureerbare data, geen hardgecodeerde lijst in applicatielogica.
- UUID's als stabiele sleutels; namen zijn geen technische identifiers.
- Centrale gebruikersidentiteit met organisatiegebonden lidmaatschappen en rollen.
- Moduleconfiguraties krijgen een expliciet organisatietype en organisatie-ID.
- De API resolveert na autorisatie zelf de D1- en R2-resource.
- Nieuwe schoolcontexten starten met lege databases uit dezelfde versiebeheerbare schema-migraties; bestaande bestellingen of persoonsgegevens worden niet gekopieerd.
- Rechtenwijzigingen, contextwissels en gevoelige mutaties worden auditbaar geregistreerd.

## 6. Migratievolgorde
1. Officiële namen, onderwijsniveaus, campusnamen en identificatiecodes bevestigen.
2. Centraal organisatieschema en lidmaatschappen implementeren.
3. Module- en rollenmatrix met expliciete scopes implementeren.
4. Contextkeuze na aanmelden bouwen.
5. API-autorisatie en beveiligingstests uitvoeren.
6. Bestaande secundaire school met campussen Ninove en Zottegem gecontroleerd migreren.
7. Afzonderlijke contexten Eeklo, Hamme, Gent, de twee basisscholen en Groeipunt configureren met eigen opslag volgens de gekozen isolatiestrategie.
8. Gegevensisolatie, rechten en bestaande werking valideren.

## 7. Nog te bevestigen
- Officiële schrijfwijze van campus Gent “Henlikai”.
- Officiële schrijfwijze van “Kimpunt” en de volledige namen van de basisscholen Assenede en Eeklo.
- Officiële namen, onderwijsinstellingcodes en campuscodes van alle instellingen.
- De campus-/vestigingsstructuur van Groeipunt.
- Mapping van bestaande gebruikersrollen naar de bestaande school Ninove/Zottegem.

## 8. Veiligheidsgrens
Dit document legt de ontwerpbeslissingen vast. Er zijn geen productiedatabases, records, Workers, Pages-projecten, DNS-records, Access-policies of R2-objecten aangepast.

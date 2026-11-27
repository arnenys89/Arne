# SAPOOV multi-tenant — bevestigde ontwerpbeslissingen

Datum: 27 november 2026
Status: organisatorische beslissingen vastgelegd; technische implementatie nog niet gestart.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Organisatiestructuur
SAPOOV moet meerdere koepels ondersteunen, met meerdere schoolbesturen per koepel, meerdere scholen per bestuur en meerdere campussen per school. De hiërarchie is koepel → schoolbestuur → school → campus.

De huidige bevestigde bovenliggende structuur is:
- **Koepel:** Provinciaal Onderwijs Vlaanderen.
- **Schoolbestuur:** Provinciebestuur Oost-Vlaanderen.

De organisatiestructuur moet later bijkomende koepels en schoolbesturen kunnen bevatten. De huidige namen mogen dus niet als vaste waarden in de applicatiecode worden ingebakken.

## 2. Bevestigde school- en campusindeling
- **Richtpunt campus Ninove-Zottegem:** één schoolcontext met twee campussen: Ninove en Zottegem.
- **Richtpunt campus Eeklo:** afzonderlijke schoolcontext.
- **Richtpunt campus Hamme:** afzonderlijke schoolcontext.
- **Richtpunt Gent:** één schoolcontext met twee campussen:
  - Gent – Henlikai (officiële schrijfwijze nog te bevestigen).
  - Gent – Hotwijselaan.

Dit betekent voorlopig vier schoolcontexten: Ninove-Zottegem, Eeklo, Hamme en Gent. De campuslocaties worden afzonderlijk geregistreerd onder de juiste school. De formele juridische/administratieve schoolnamen en officiële identificatiecodes moeten nog worden bevestigd.

## 3. Bevestigde functionele keuzes
1. De aankopenmodule wordt beheerd op schoolniveau.
2. Eén gedeelde codebasis voor alle schoolcontexten.
3. Afzonderlijke D1-database en R2-bucket per schoolcontext.
4. Centrale identiteit en autorisatie via de bestaande SAPOOV-identiteitslaag.
5. Rechten op koepel- en schoolbestuurniveau werken uitsluitend door na expliciete toekenning. Overerving staat standaard uit.
6. Een gebruiker met toegang tot meerdere contexten kiest na aanmelden zelf de actieve context.
7. Modules kunnen configureerbaar zijn op koepel-, schoolbestuur-, school- of campusniveau.
8. Autorisatie wordt server-side afgedwongen. Een door de client aangeleverde organisatie-ID verleent nooit op zichzelf toegang.

## 4. Technische inrichting
- Organisatietabellen: umbrella_organizations, school_boards, schools en campuses.
- UUID's als stabiele sleutels; namen zijn geen technische identifiers.
- Centrale gebruikersidentiteit met organisatiegebonden lidmaatschappen en rollen.
- Moduleconfiguraties krijgen een expliciet organisatietype en organisatie-ID.
- De API resolveert na autorisatie zelf de D1- en R2-resource.
- Nieuwe schoolcontexten starten met lege databases uit dezelfde versiebeheerbare schema-migraties; bestaande bestellingen of persoonsgegevens worden niet gekopieerd.
- Rechtenwijzigingen, contextwissels en gevoelige mutaties worden auditbaar geregistreerd.

## 5. Migratievolgorde
1. Officiële namen, campusnamen en identificatiecodes bevestigen.
2. Centraal organisatieschema en lidmaatschappen implementeren.
3. Module- en rollenmatrix met expliciete scopes implementeren.
4. Contextkeuze na aanmelden bouwen.
5. API-autorisatie en beveiligingstests uitvoeren.
6. Bestaande school met campussen Ninove en Zottegem gecontroleerd migreren.
7. Afzonderlijke schoolcontexten Eeklo, Hamme en Gent configureren met eigen D1- en R2-opslag.
8. Gegevensisolatie, rechten en bestaande werking valideren.

## 6. Nog te bevestigen
- Officiële schrijfwijze van campus Gent “Henlikai”.
- Formele schoolnamen en identificatiecodes voor de vier schoolcontexten.
- Officiële campusnamen en identificatiecodes.
- Mapping van bestaande gebruikersrollen naar de school Ninove/Zottegem.

## 7. Veiligheidsgrens
Dit document legt de ontwerpbeslissingen vast. Er zijn geen productiedatabases, records, Workers, Pages-projecten, DNS-records, Access-policies of R2-objecten aangepast.

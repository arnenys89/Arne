# SAPOOV multi-tenant — technisch ontwerp en rechtenmatrix

Datum: 27 november 2026
Status: uitgewerkt ontwerp op ontwikkelbranch; nog niet geïmplementeerd in productie.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Doel en uitgangspunten

SAPOOV ondersteunt meerdere koepels, schoolbesturen, onderwijsinstellingen en fysieke locaties vanuit één gedeelde codebasis.

Bevestigde uitgangspunten:
- Centrale identiteit per persoon; één gebruiker kan lid zijn van meerdere organisaties.
- Organisatiehiërarchie: koepel → schoolbestuur → onderwijsinstelling/school → locatie.
- Een onderwijsinstelling is de organisatorische context; een locatie is een fysieke vestigingsplaats. Gebruik technisch `locations`, niet `campuses`.
- Aankopen wordt beheerd op instellingsniveau. Locaties binnen één instelling delen dus de schoolcontext en de bijbehorende opslag.
- Elke instelling heeft een afzonderlijke D1-database en R2-bucket; gedeelde code en centrale identiteits-/autorisatielaag.
- Rechten worden niet automatisch overgeërfd. Elke ruimere scope vereist een expliciete toekenning.
- Gebruikers met meerdere toegankelijke contexten kiezen zelf de actieve context.
- Autorisatie gebeurt server-side bij iedere aanvraag.
- Mutaties aan organisaties, lidmaatschappen, rechten en gevoelige gegevens zijn auditbaar.

## 2. Organisatiestructuur

### 2.1 Huidige configuratie

Koepel: **Provinciaal Onderwijs Vlaanderen**  
Schoolbestuur: **Provinciebestuur Oost-Vlaanderen**

Onder dit bestuur worden voorlopig de volgende onderwijsinstellingen gemodelleerd:

| Onderwijsinstelling | Onderwijsniveau | Locaties / opmerkingen |
|---|---|---|
| Richtpunt campus Ninove Zottegem | Secundair | Ninove en Zottegem; één instelling, twee locaties |
| Richtpunt campus Eeklo | Secundair | Locaties nog te bevestigen |
| Richtpunt campus Hamme | Secundair | Locaties nog te bevestigen |
| Richtpunt campus Gent Henleykaai | Secundair | Henleykaai; formele entiteits- en locatieafbakening nog te bevestigen |
| Richtpunt campus Gent-Oudenaarde | Secundair | Gent – Godshuizenlaan is een bevestigde Gentse locatie; overige locaties nog te bevestigen |
| Kimpunt campus Assenede | Basisonderwijs | Officiële schrijfwijze en locaties nog te bevestigen |
| Kimpunt campus Eeklo | Basisonderwijs | Officiële schrijfwijze en locaties nog te bevestigen |
| Groeipunt | Volwassenenonderwijs | Locaties nog te inventariseren |

Dit zijn acht voorlopige onderwijsinstellingen. De formele juridische namen, administratieve instellingsnummers en exacte relaties moeten vóór productie-inrichting worden bevestigd. De hierboven vermelde naamgeving is de huidige werkbasis, geen verklaring dat alle juridische namen al geverifieerd zijn.

### 2.2 Metadata per organisatieniveau

Koepel, schoolbestuur en onderwijsinstelling hebben elk hun eigen:
- naam en afkorting;
- logo;
- website-URL;
- algemeen contact-e-mailadres;
- fysiek correspondentie-/vestigingsadres;
- administratief instellingsnummer, indien van toepassing.

Deze waarden worden niet automatisch overgenomen van een bovenliggende entiteit. Een school heeft dus eigen contactgegevens en een eigen logo, ook wanneer die afwijken van het bestuur of de koepel.

Een instelling kan meerdere locaties hebben. Elke locatie heeft minstens een eigen naam, adres en status, en optioneel een locatiecode, telefoonnummer, e-mailadres en aanvullende praktische gegevens. Het adres van een locatie is niet hetzelfde als het correspondentieadres van de instelling.

### 2.3 Naamgeving en identifiers

- Het woord `campus` wordt in schoolnamen altijd met kleine letter geschreven.
- De term voor een fysieke vestigingsplaats in SAPOOV is **locatie**.
- UUID's zijn interne primaire sleutels.
- Namen, afkortingen en administratieve instellingsnummers zijn geen interne sleutels.
- Een administratief nummer mag leeg blijven tot het officieel is bevestigd.
- Leg pas unieke constraints op instellingsnummers vast wanneer het toepasselijke register en de uniciteitsregels gekend zijn.

## 3. Centraal datamodel

### 3.1 Organisaties

Voorgestelde tabellen:

| Tabel | Belangrijkste velden | Relatie |
|---|---|---|
| `umbrella_organizations` | id, name, abbreviation, logo_asset_id, website_url, contact_email, postal_address_json, institution_number, status | Koepel |
| `school_boards` | id, umbrella_id, name, abbreviation, logo_asset_id, website_url, contact_email, postal_address_json, institution_number, status | Hoort bij één koepel |
| `educational_institutions` | id, school_board_id, institution_type_id, name, abbreviation, logo_asset_id, website_url, contact_email, postal_address_json, institution_number, status | Hoort bij één bestuur |
| `locations` | id, institution_id, code, name, address_json, contact_email, phone, status | Hoort bij één instelling |
| `institution_types` | id, code, label, active | Configureerbare onderwijsniveaus/types |

Gebruik gestructureerde adresvelden in JSON of genormaliseerde adreskolommen (straat, huisnummer, bus, postcode, gemeente, land). Kies één consistente implementatie en valideer die centraal. Bewaar land expliciet; ga niet uit van België als vaste waarde.

De waarden `logo_asset_id` verwijzen naar beheerde assets in R2 of een centrale assetopslag. Bewaar geen willekeurige externe upload-URL als enige referentie.

### 3.2 Centrale identiteit en lidmaatschappen

| Tabel | Doel / kernvelden |
|---|---|
| `users` | Centrale identiteit; id, identity_provider_subject, primary_email, display_name, status |
| `organization_memberships` | id, user_id, organization_type, organization_id, status, valid_from, valid_until, created_by |
| `applications` | Geregistreerde SAPOOV-modules |
| `application_components` | Onderdelen binnen een module |
| `roles` | Configureerbare rol, module/component en rolcode |
| `permissions` | Concrete actiecodes en omschrijvingen |
| `role_permissions` | Koppeling rol naar toegestane acties |
| `user_role_assignments` | user_id, role_id, organization_type, organization_id, application_id, component_id nullable, include_descendants, valid_from, valid_until, status, assigned_by |
| `organization_context_resources` | Server-side mapping instelling-ID naar D1- en R2-resource-identificatoren |
| `audit_events` | Actor, actie, doel, scope, tijdstip, resultaat en relevante metadata |

Omdat lidmaatschappen en roltoewijzingen verschillende organisatietypes kunnen betreffen, moeten services bij het schrijven controleren of de opgegeven organisatie bestaat en of de actor die wijziging mag uitvoeren. Gebruik geen onbeveiligde polymorfe koppeling vanuit de client.

Een centrale gebruikersidentiteit geeft op zichzelf geen toegang tot een organisatie. Een lidmaatschap is evenmin automatisch een modulemachtiging: toegang vereist een actieve roltoewijzing met de juiste module, actie en scope.

### 3.3 Contactgegevens van gebruikers versus organisaties

- `users.primary_email` is het persoonlijke aanmeld-/identiteitsadres.
- `contact_email` op koepel, bestuur, instelling of locatie is een functioneel contactadres.
- Deze gegevens mogen niet onderling worden gesynchroniseerd of als elkaars vervanging worden gebruikt.
- Een gebruiker kan meerdere e-mailadressen hebben bij de identity provider; de centrale identiteit moet op een stabiele provider-subject-ID steunen, niet uitsluitend op het e-mailadres.

## 4. Autorisatiemodel

### 4.1 Principes

1. **Deny by default:** zonder expliciete machtiging is toegang geweigerd.
2. **Least privilege:** ken alleen de noodzakelijke acties en kleinste bruikbare scope toe.
3. **Geen impliciete overerving:** een rol op koepel- of bestuursniveau geeft niet vanzelf toegang tot onderliggende instellingen.
4. **Expliciete descendant-toekenning:** toegang tot onderliggende organisaties kan alleen via een expliciete, auditbare toekenning met `include_descendants = true`, indien de rol dat toestaat.
5. **Server-side scope-resolutie:** de API bepaalt de hiërarchie en toegestane descendants zelf.
6. **Actieve context is geen autorisatie:** de gekozen context helpt navigeren, maar verleent geen rechten.
7. **Tijdgebonden toegang:** begin- en einddatum en status worden bij elke controle gerespecteerd.
8. **Scheiding van taken:** gevoelige acties zoals rechten toekennen, goedkeuren en auditlogs beheren worden waar mogelijk gescheiden.

### 4.2 Rechten op organisatieniveau

| Roltemplate | Scope | Standaardrechten | Geen automatisch recht op |
|---|---|---|---|
| Platformbeheerder | SAPOOV-platform | Technisch platformbeheer, configuratie van platformresources, ondersteuning | Inhoudelijke schoolgegevens tenzij afzonderlijk toegekend |
| Koepelbeheerder | Eén koepel | Koepelprofiel beheren, onderliggende structuur bekijken voor zover expliciet toegestaan, koepelbrede moduleconfiguratie | Schoolbesturen en scholen beheren of hun gegevens lezen zonder expliciete scope |
| Bestuursbeheerder | Eén schoolbestuur | Bestuursprofiel beheren, instellingen onder het bestuur beheren wanneer expliciet toegekend | Andere besturen of alle scholen automatisch beheren |
| Instellingsbeheerder | Eén onderwijsinstelling | Instellingsprofiel, locaties, lokale gebruikers- en moduleconfiguratie beheren volgens toegewezen rechten | Andere instellingen, bestuur of koepel beheren |
| Locatiebeheerder | Eén locatie | Locatiegegevens en expliciet toegewezen locatieprocessen beheren | Volledige instelling beheren |
| Modulebeheerder | Eén module en expliciete organisatiecontext | Moduleconfiguratie en modulegebruikers beheren binnen toegewezen scope | Andere modules of bredere organisatiescope |
| Auditor | Expliciete organisatie-/modulescope | Audit- en rapportagegegevens alleen-lezen | Mutaties uitvoeren of rechten toekennen |
| Medewerker | Expliciete instelling-/locatiescope | Alleen toegewezen modulefuncties uitvoeren | Beheerrechten of toegang tot andere instellingen |

Deze rollen zijn herbruikbare templates. De effectieve machtiging ontstaat pas door een concrete toewijzing aan een gebruiker, module en organisatiescope.

### 4.3 Rechtenmatrix voor beheeracties

Legenda: **E** = expliciet toekenbaar binnen de toegewezen scope; **—** = standaard niet toegestaan. De matrix definieert roltemplates, geen automatische rechten op alle onderliggende entiteiten.

| Actie | Platformbeheerder | Koepelbeheerder | Bestuursbeheerder | Instellingsbeheerder | Locatiebeheerder | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| Organisatieprofiel lezen | E | E | E | E | E (eigen locatie) | E |
| Eigen organisatielaag wijzigen | E | E | E | E | E (eigen locatie) | — |
| Onderliggende organisatie aanmaken | E | — | E* | — | — | — |
| Onderliggende organisatie deactiveren | E | — | E* | — | — | — |
| Locaties beheren | E | — | E* | E | E (eigen locatie) | — |
| Gebruikers uitnodigen/koppelen | E | E* | E* | E* | E* | — |
| Rollen toekennen | E | E* | E* | E* | E* | — |
| Moduleconfiguratie beheren | E | E* | E* | E* | E* | — |
| Auditlogs lezen | E | E* | E* | E* | E* | E |
| Auditlogs wijzigen/verwijderen | — | — | — | — | — | — |

* Alleen binnen de concrete toegewezen scope en alleen wanneer de bovenliggende beheerrol expliciet de betreffende actie heeft gekregen. Geen van deze rechten strekt zich vanzelf uit tot descendants.

Platformbeheer betekent niet automatisch inzage in inhoudelijke gegevens van alle instellingen. Voor supporttoegang tot inhoudelijke data is een afzonderlijke, beperkte en auditbare machtiging nodig.

### 4.4 Rechtenmatrix voor modules

De applicatie- en componentmachtigingen worden opgebouwd uit actiecodes. Voorbeeldset voor Aankopen:

| Permissiecode | Betekenis |
|---|---|
| `orders.read` | Bestellingen bekijken binnen scope |
| `orders.create` | Bestelling aanmaken |
| `orders.update_own` | Eigen conceptbestelling aanpassen |
| `orders.submit` | Bestelling indienen |
| `orders.approve` | Bestelling goedkeuren |
| `orders.reject` | Bestelling afwijzen |
| `orders.cancel` | Bestelling annuleren volgens workflow |
| `catalog.read` | Catalogus bekijken |
| `catalog.manage` | Catalogus beheren |
| `suppliers.read` | Leveranciers bekijken |
| `suppliers.manage` | Leveranciers beheren |
| `purchases.read` | Aankoopgegevens bekijken |
| `purchases.manage` | Aankoopregistratie beheren |
| `teams.read` | Teams bekijken |
| `teams.manage` | Teams beheren |
| `reports.read` | Rapporten bekijken |
| `module.settings.manage` | Module-instellingen beheren |
| `module.users.manage` | Moduletoegang beheren binnen scope |

Voorgestelde rolbundels voor Aankopen:

| Module-rol | Voorbeeldmachtigingen |
|---|---|
| Aanvrager | orders.read, orders.create, orders.update_own, orders.submit, catalog.read |
| Goedkeurder | orders.read, orders.approve, orders.reject, orders.cancel, catalog.read |
| Aankoopbeheerder | orders.read, orders.approve, orders.reject, orders.cancel, catalog.read, catalog.manage, suppliers.read, suppliers.manage, purchases.read, purchases.manage, reports.read |
| Teamverantwoordelijke | teams.read, orders.read binnen expliciete team-/instellingsscope |
| Modulebeheerder | Alle functionele Aankopen-permissies plus module.settings.manage en module.users.manage, uitsluitend binnen de expliciete instellingsscope |
| Rapportlezer | orders.read, purchases.read, reports.read; alleen-lezen |

Dit zijn startbundels. De precieze workflow, goedkeuringsdrempels en eventuele functiescheiding moeten per module nog worden bevestigd. Een gebruiker mag niet zijn eigen bestelling goedkeuren wanneer de toepasselijke workflow functiescheiding vereist.

Voor andere modules worden eigen permissiesets gedefinieerd; vermijd één generieke `admin`-rol die overal toegang verleent.

## 5. Rechtencontrole bij elke API-aanvraag

De API voert minimaal deze controles uit:

1. Valideer de Cloudflare Access-identiteit en resolveer de centrale gebruiker via de stabiele identity-provider-subject-ID.
2. Controleer of de gebruiker actief is.
3. Bepaal de gevraagde module, component, actie en resource.
4. Resolveer de doelorganisatie vanuit de server-side gegevens; vertrouw nooit een client-ID als bewijs van toegang.
5. Controleer actief lidmaatschap en geldigheidsperiode waar de toepassing lidmaatschap vereist.
6. Zoek een actieve roltoewijzing voor de gebruiker, de gevraagde actie en de concrete scope.
7. Controleer eventuele expliciet toegestane descendant-scope aan de hand van de opgeslagen organisatiehiërarchie.
8. Controleer modulestatus en eventuele contextbeperkingen.
9. Weiger bij ontbrekende, dubbelzinnige of tegenstrijdige gegevens.
10. Schrijf relevante beveiligings- en beheeracties naar de auditregistratie.

Een context-ID in een URL, request body, header of queryparameter mag nooit zelfstandig een D1- of R2-resource selecteren. De server resolveert de resource pas nadat de gebruiker voor die context is geautoriseerd.

## 6. Contextkeuze na aanmelden

1. Cloudflare Access authenticeert de gebruiker.
2. De API haalt de centrale identiteit, actieve lidmaatschappen en actieve roltoewijzingen op.
3. SAPOOV toont alleen contexten waarvoor de gebruiker een geldige toegang heeft.
4. Bij één context kan SAPOOV die context openen; bij meerdere contexten kiest de gebruiker zelf.
5. De actieve context wordt in de sessie bewaard.
6. Bij iedere API-aanvraag wordt de autorisatie opnieuw gecontroleerd.
7. Een verlopen of ingetrokken toewijzing maakt de context onmiddellijk ontoegankelijk.
8. Bij ontbrekende of ongeldige context volgt een weigering; er is geen stille terugval op een standaardinstelling.

## 7. Gegevensisolatie en opslag

### 7.1 Centrale gegevenslaag

De centrale database bevat uitsluitend gegevens die voor identiteit en organisatiebeheer nodig zijn:
- gebruikersidentiteiten;
- organisaties en locaties;
- lidmaatschappen en roltoewijzingen;
- modulecatalogus en moduleconfiguraties;
- contextregister voor D1/R2-resources;
- auditmetadata.

Bestellingen, bestelregels, leveranciers en schoolgebonden catalogusgegevens blijven in de database van de betrokken instelling.

### 7.2 Instellingsgebonden gegevenslaag

Per onderwijsinstelling:
- afzonderlijke D1-database met dezelfde versiebeheerbare schema-migraties;
- afzonderlijke R2-bucket of aantoonbaar geïsoleerde opslagruimte volgens dezelfde beveiligingsprincipes;
- eigen leveranciers, catalogus, teams, bestellingen, aankopen en lokale instellingen;
- geen gegevenskopie van een andere instelling.

Ninove en Zottegem delen de gegevenscontext van Richtpunt campus Ninove Zottegem, omdat ze locaties van één instelling zijn. De afzonderlijke instellingen in Eeklo, Hamme, Gent en de andere onderwijscontexten krijgen elk hun eigen opslag.

### 7.3 Contextregister

Het server-side contextregister koppelt een instelling-UUID aan interne D1- en R2-resource-identificatoren. Alleen platformbeheerders met een afzonderlijke expliciete machtiging kunnen deze mapping wijzigen. De client ontvangt geen databasegeheimen, bindingnamen of resourcecredentials.

## 8. Beheerinterface

### Organisatiebeheer
- Boomstructuur koepel → schoolbestuur → onderwijsinstelling → locatie.
- Per koepel, bestuur en instelling bewerkbare naam, afkorting, logo, website, contact-e-mailadres, fysiek correspondentieadres en instellingsnummer.
- Per locatie een eigen naam, locatiecode en fysiek adres.
- Aanmaken, wijzigen en deactiveren; geen fysieke verwijdering wanneer gekoppelde gegevens bestaan.
- Toon duidelijk welke officiële gegevens nog bevestigd moeten worden.

### Gebruikers- en rechtenbeheer
- Zoek een centrale gebruiker en toon diens lidmaatschappen.
- Ken rol, module, component, actieprofiel en organisatiescope afzonderlijk toe.
- Toon geldigheidsperiode, status, toewijzer en reden.
- Toon effectieve rechten en maak expliciet zichtbaar of descendant-toegang aanstaat.
- Waarschuw prominent bij brede koepel- of bestuursscope.
- Ondersteun onmiddellijke intrekking en auditregistratie.

### Rechtenmatrix — kruistabel

Het centrale rechtenbeheer krijgt als primaire beheerweergave een **kruistabel**. Dit is de hoofdweergave om snel te zien en te beheren welke gebruikers welk rechtenprofiel binnen welke module en organisatiecontext hebben.

**Kolomstructuur met vijf geneste kopniveaus:**

1. **Koepel** — bovenste groepskop.
2. **Schoolbestuur** — gegroepeerd onder de bijbehorende koepel.
3. **School/onderwijsinstelling** — gegroepeerd onder het bijbehorende schoolbestuur.
4. **Module** — gegroepeerd onder de school.
5. **Rechtenprofiel** — de concrete kolom op het laagste niveau, gegroepeerd onder de module.

De tabel heeft dus meerdere koprijen. Een voorbeeld van één kolompad is: Provinciaal Onderwijs Vlaanderen → Provinciebestuur Oost-Vlaanderen → Richtpunt campus Ninove Zottegem → Aankopen → Goedkeurder.

**Rijen:**
- Elke rij vertegenwoordigt één centrale gebruiker.
- De gebruiker blijft één rij, ook wanneer die toegang heeft tot meerdere scholen, besturen, koepels of modules.
- De cellen op de kruising van gebruiker en rechtenprofiel tonen of dat profiel aan die gebruiker is toegekend binnen de kolomcontext.
- Een gebruiker kan dus op meerdere kolommen een toekenning hebben, telkens met de bijbehorende organisatiescope.
- De tabel mag gebruikers niet automatisch dupliceren per school of per lidmaatschap.

**Zoeken en navigeren:**
- Gebruikers moeten doorzoekbaar zijn op volledige naam, e-mailadres en e-mailextensie/domein (het gedeelte na de @, bijvoorbeeld `@richtpunt.be`). De zoekfunctie ondersteunt gedeeltelijke overeenkomsten en hoofdletterongevoelig zoeken.
- De zoekfilters mogen gecombineerd worden: een beheerder kan bijvoorbeeld zoeken op naam én e-mailextensie om een personeelsgroep af te bakenen.
- De gebruikersrijen zijn niet open- of dichtklapbaar. Er wordt dus geen boomstructuur van gebruikersrijen gebruikt.
- De geneste kolomkoppen blijven zichtbaar en maken de organisatie- en modulecontext van elk rechtenprofiel duidelijk.
- Bij brede tabellen moeten de kolomkoppen tijdens horizontaal scrollen herkenbaar blijven; de gebruikerskolom blijft bij voorkeur vastgezet.
- De matrix moet ook bruikbaar blijven wanneer een gebruiker geen rechten heeft in bepaalde kolommen: een lege cel betekent geen toekenning, niet een impliciete weigering die als aparte rol wordt opgeslagen.

**Afzonderlijke toegangsschakelaar per module:**
- Naast de rechtenprofielen krijgt elke gebruiker per module en per schoolcontext een afzonderlijke checkbox **“Toegang tot dit platform”**.
- Aangevinkt: de module verschijnt in het dashboard van de gebruiker voor die organisatiecontext én de gebruiker mag de module openen. De API controleert deze expliciete moduletoegang bij iedere aanvraag.
- Uitgevinkt: de module verschijnt niet in het dashboard en toegang tot de module-API's wordt geweigerd, ook wanneer er nog rechtenprofielen aan de gebruiker gekoppeld zijn. De onderliggende roltoewijzingen mogen bewaard blijven, maar zijn niet actief zolang de moduletoegang uitstaat.
- Deze moduletoegang is een toegangspoort en vervangt de rechtenprofielen niet. De rechtenprofielen bepalen welke handelingen de gebruiker binnen de module mag uitvoeren.
- Een gebruiker met moduletoegang maar zonder enig rechtenprofiel kan de module openen, maar krijgt geen functionele beheer- of mutatierechten. Alleen expliciet als algemeen beschikbaar gemarkeerde start-/leesfunctionaliteit kan dan toegankelijk zijn; standaard geldt deny by default.
- De moduletoegang moet afzonderlijk kunnen worden toegekend en ingetrokken per gebruiker, module en organisatiescope. Ze wordt niet automatisch overgeërfd naar andere scholen of modules.
- De matrix toont deze checkbox op moduleniveau, duidelijk onderscheiden van de checkboxes voor de rechtenprofielen onder die module.
- Wijzigingen aan moduletoegang worden server-side gevalideerd en geregistreerd in `audit_events`.

**Beheer via de cellen:**
- Elke cel op het kruispunt van een gebruiker en een rechtenprofiel bevat een aanvinkvakje (checkbox).
- Aangevinkt betekent dat het betreffende rechtenprofiel aan die gebruiker wordt toegekend binnen de kolomcontext; uitgevinkt betekent dat die toekenning niet bestaat of wordt ingetrokken.
- De beheerder vinkt dus per gebruiker en per rechtenprofiel expliciet aan of de gebruiker die rechten krijgt. Er worden geen rechten toegekend enkel omdat iemand in de gebruikerslijst voorkomt of tot een school behoort.
- Een bevoegde beheerder kan een rechtenprofiel voor een gebruiker toekennen of intrekken door het vakje in de overeenkomstige cel aan of uit te vinken.
- Elke wijziging wordt server-side gevalideerd tegen de eigen bevoegdheden van de beheerder, de organisatiehiërarchie, de module en het rechtenprofiel.
- De interface toont bij een toekenning de scope, status en eventuele geldigheidsperiode.
- Een profiel op een hoger organisatieniveau wordt niet stilzwijgend naar onderliggende scholen doorgetrokken. Indien descendant-toegang expliciet wordt ondersteund, moet die afzonderlijk en ondubbelzinnig zichtbaar zijn.
- De matrix is een beheerscherm en geen autorisatiebron: de API blijft bij iedere aanvraag de effectieve rechten berekenen en controleren.

**Technische representatie:**
- De kolomgroepen worden opgebouwd uit de organisatiestructuur, modules en actieve rechtenprofielen; namen en kolomposities zijn geen identifiers.
- Elk aangevinkt vakje verwijst naar een expliciete roltoewijzing met gebruiker, profiel/rol, module en organisatiescope. Een niet-aangevinkt vakje maakt geen roltoewijzing aan.
- De matrix mag geen eigen alternatieve rechtenlogica introduceren naast `user_role_assignments`, `role_permissions` en de server-side autorisatieservice.
- Leg wijzigingen vast in `audit_events`, inclusief actor, gebruiker, profiel, scope, actie en tijdstip.

### Contextbeheer
- Toon de contexten waartoe een gebruiker toegang heeft.
- Laat de gebruiker zelf de actieve context kiezen bij meerdere opties.
- Toon in de interface steeds de actieve instelling en, waar relevant, locatie.
- Wisselen van context mag geen rechten verruimen.

## 9. Migratie- en implementatievolgorde

1. Officiële organisatienamen, nummers, afkortingen, websites, e-mailadressen en fysieke adressen verzamelen en bevestigen.
2. Definitieve entiteiten en locaties met UUID's vastleggen.
3. Centrale organisatieschema's, metadata en contextregister implementeren.
4. Centrale gebruikerskoppeling en lidmaatschappen implementeren.
5. Permissies, roltemplates, expliciete toewijzingen en auditlog implementeren.
6. Server-side autorisatiemiddleware en contextkeuze bouwen.
7. Beheerinterface voor organisaties, metadata, gebruikers en rechten bouwen.
8. Per instelling de geïsoleerde D1/R2-resources configureren.
9. Bestaande Aankopenomgeving van Richtpunt campus Ninove Zottegem gecontroleerd migreren.
10. Nieuwe instellingen met lege databases uit dezelfde migraties configureren.
11. Beveiligings-, isolatie-, regressie- en terugroltests uitvoeren.
12. Pas na formele acceptatie een afzonderlijk productieplan uitvoeren.

## 10. Test- en acceptatiecriteria

- Gebruiker zonder actieve roltoewijzing krijgt geen moduletoegang.
- Lidmaatschap zonder modulemachtiging geeft geen moduletoegang.
- Een koepel- of bestuursrol geeft geen onderliggende toegang zonder expliciete descendant-toekenning.
- Een locatiebeheerder kan niet buiten de eigen locatiecontext muteren.
- Een instelling kan eigen metadata wijzigen maar niet die van een andere instelling.
- Een gebruiker met meerdere contexten kan zelf de actieve context kiezen.
- Manipulatie van organisatie-ID's levert geen cross-tenant toegang op.
- Geen gegevenslek tussen D1-databases of R2-opslag van instellingen.
- Ninove en Zottegem blijven binnen één instelling en één Aankopen-gegevenscontext.
- Intrekking of afloop van een rol wordt bij de eerstvolgende aanvraag afgedwongen.
- Gevoelige rechtenwijzigingen en contextwissels zijn auditbaar.
- Een platformbeheerder krijgt niet automatisch inhoudelijke inzage in alle schoolgegevens.
- Een gebruiker kan niet een eigen bestelling goedkeuren wanneer functiescheiding van toepassing is.

## 11. Open beslissingen vóór implementatie

- Definitieve juridische namen, officiële instellingsnummers, afkortingen en contactgegevens van koepel, bestuur en instellingen.
- Definitieve afbakening van Richtpunt campus Gent Henleykaai en Richtpunt campus Gent-Oudenaarde en hun locaties.
- Officiële schrijfwijze en volledige namen van Kimpunt en de betrokken basisscholen.
- Locaties en contactgegevens van Groeipunt.
- Definitieve rollen en permissies per SAPOOV-module, naast de voorgestelde Aankopen-bundels.
- Wie op elk niveau bevoegd is om gebruikers, rollen en descendant-toegang toe te kennen.
- Definitieve bewaartermijnen en inzageregels voor auditlogs.
- Keuze van de centrale database en de concrete Cloudflare-resourcebindings voor het contextregister.

## 12. Veiligheidsgrens van deze ontwerpstap

Deze commit werkt uitsluitend documentatie bij op de ontwikkelbranch. Er zijn geen tabellen aangemaakt, records gewijzigd, D1-databases aangemaakt of gekloond, R2-buckets gewijzigd, Workers of Pages-projecten aangepast, DNS-records gewijzigd of Access-policies aangepast. Productie blijft onaangeroerd.

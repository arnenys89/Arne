# SAPOOV – organisaties- en campusregister

## Doel en uitgangspunten

Het register onderscheidt drie niveaus die niet met elkaar mogen worden verward:

1. **Inrichtende macht / koepel** – de overkoepelende organisatie.
2. **Onderwijsinstelling** – de juridisch geregistreerde instelling met een uniek instellingsnummer.
3. **Campus / vestigingsplaats** – de fysieke locatie met eigen adres- en eventueel contactgegevens.

Een campus krijgt dus niet automatisch een eigen instellingsnummer. Het instellingsnummer hoort bij de onderwijsinstelling zoals die in de officiële onderwijsdatabank geregistreerd staat. De gegevens worden als tekst bewaard om voorloopnullen en de officiële notatie te behouden.

## Gegevensmodel

De migratie `0005_organizations.sql` introduceert:

- `organizations`: officiële naam, publieksnaam, instellingsnummer, ondernemingsnummer (indien relevant), onderwijstype, bovenliggende organisatie, algemeen e-mailadres, telefoon, website, logo-object, bron en verificatiedatum.
- `campuses`: campusnaam, volledig adres, contactgegevens, website, campuslogo, hoofdvestiging en status.
- `organization_sources`: veldgerichte bronregistratie zodat achteraf aantoonbaar blijft waar elk gegeven vandaan komt en wanneer het werd gecontroleerd.
- `user_organization_roles`: koppeling van gebruikers aan een instelling; dit staat los van applicatierollen.

Logo's worden in de uiteindelijke implementatie in Cloudflare R2 opgeslagen. De database bewaart de object key en de oorspronkelijke bron-URL, plus een notitie over gebruiksrecht/bron. Een logo-URL van een derde partij wordt niet zonder controle als permanent asset gebruikt.

## Validatie en beheerregels

- Instellingsnummer is uniek en wordt als tekst opgeslagen.
- Een organisatie kan meerdere campussen hebben.
- Een campus hoort bij precies één organisatie.
- Organisaties en campussen starten als `draft`; pas na verificatie worden ze `active`.
- Elke officiële wijziging krijgt bron, controledatum en auditregistratie.
- Ontbrekende e-mailadressen, websites, telefoonnummers of logo's blijven leeg; er worden geen gegevens afgeleid of verzonnen.
- De superadministrator blijft de enige actor die het centrale register kan wijzigen.
- Bestaande applicatierollen en bestaande gegevens blijven intact.

## Bronnen voor verificatie

De primaire bron voor instellingsnummers en formele onderwijsgegevens is de onderwijsdatabank / POI-dataset van het Departement Onderwijs en Vorming. Die dataset wordt maandelijks bijgewerkt.

- Onderwijsaanbod via POI-service: https://www.vlaanderen.be/datavindplaats/catalogus/onderwijsaanbod-in-vlaanderen-en-brussel-via-poi-service
- Provinciaal Onderwijs Oost-Vlaanderen: https://oost-vlaanderen.be/leren/onderwijs/bedrijven-en-onderwijs/provinciaal-onderwijs-oost-vlaanderen.html
- Overzicht provinciale scholen 2025-2026: https://pov.be/wp-content/uploads/2025/09/Provinciale-scholen-overzicht-2025-2026.pdf

De provinciale overzichtspagina en het POV-document zijn geschikt om de officiële lijst van entiteiten te controleren; de onderwijsdatabank blijft leidend voor het instellingsnummer en de formele contactgegevens.

## Belangrijke gegevenscontrole

De publiek beschikbare provinciale lijst 2025-2026 bevat meerdere campusvermeldingen en tien onderwijsentiteiten in Oost-Vlaanderen (waaronder Richtpunt, Kiempunt en CVO Groeipunt). Dat aantal is niet zonder meer gelijk aan de acht instellingen die eerder in dit project werden genoemd. Daarom worden er in deze migratie bewust geen acht records op basis van een gok ingevoerd. De eerder opgegeven lijst moet één-op-één worden gematcht met de actuele officiële registraties vóór import.

## Volgende implementatiestappen

1. Voer migratie 0005 uit op de SAPOOV-D1-database.
2. Implementeer superadmin-API voor organisaties, campussen en bronregistratie.
3. Bouw de beheerinterface met zoeken, filteren, status, adres- en contactvelden.
4. Match de acht opgegeven instellingen met de officiële onderwijsdatabank.
5. Download logo's van de officiële school- of provinciewebsites, controleer herkomst en sla ze op in R2.
6. Test uniekheid, ouder-kindrelaties, campusadressen, rechten en auditlog.
7. Pas pas na goedkeuring de productiegegevens aan; de productiebranch blijft onaangeroerd.

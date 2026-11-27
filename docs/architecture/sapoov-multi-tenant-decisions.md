# SAPOOV multi-tenant — bevestigde ontwerpbeslissingen

Status: door de gebruiker bevestigd op 27 november 2026.
Branch: `feature/sapoov-multi-tenant-foundation`
Repository: `arnenys89/Arne`

Dit document legt de vijf bevestigde beslissingen vast als uitgangspunt voor de volgende technische implementatiefase.

## 1. Organisatiestructuur

- Ninove en Zottegem zijn **twee campussen van één school**.
- Hamme, Gent en Eeklo zijn **drie afzonderlijke scholen**.
- De algemene hiërarchie blijft: koepel → schoolbestuur → school → campus.
- De concrete koepel- en schoolbestuurrelaties moeten als echte organisatiegegevens worden geregistreerd; ze worden niet afgeleid of verzonnen op basis van de campus- of schoolnaam.

Schematisch:

```text
Koepel
└── Schoolbestuur
    ├── School Richtpunt (huidige context)
    │   ├── Campus Ninove
    │   └── Campus Zottegem
    ├── School Richtpunt Hamme
    ├── School Richtpunt Gent
    └── School Richtpunt Eeklo
```

De bovenstaande boom toont de afgesproken onderlinge indeling van de scholen en campussen. De exacte koepel- en schoolbestuurkoppeling blijft te bevestigen in de organisatieadministratie.

## 2. Niveau van de aankopenmodule

- De aankopenmodule wordt beheerd en geconfigureerd op **schoolniveau**.
- De huidige schoolcontext omvat de school met de campussen Ninove en Zottegem.
- Hamme, Gent en Eeklo krijgen elk een eigen schoolconfiguratie en een eigen gegevensdatabase.
- De applicatiecode blijft gedeeld; bestellingen, leveranciers, catalogus, teams, instellingen en bestanden blijven strikt gescheiden per schoolcontext.

## 3. Rechtenovererving

- Rechten van koepel- en schoolbestuurbeheerders worden **niet automatisch** doorgegeven aan onderliggende organisaties.
- Doorgifte of beheer op een lager niveau vereist een expliciete toekenning.
- Ook op schoolniveau worden rechten niet vanzelf naar campussen uitgebreid tenzij dat afzonderlijk expliciet is ingesteld.
- Autorisatie wordt bij elke API-aanvraag server-side gecontroleerd.

## 4. Contextkeuze na aanmelden

- Na centrale aanmelding toont SAPOOV de organisatiecontexten waarvoor de gebruiker expliciet toegang heeft.
- De gebruiker kiest zelf de actieve context.
- Als er maar één toegankelijke context is, mag SAPOOV die voorstellen, maar de actieve context blijft duidelijk zichtbaar.
- De gekozen context is geen autorisatiebewijs: de API controleert de rechten bij iedere aanvraag opnieuw.
- Bij een ongeldige of niet-toegankelijke context wordt toegang geweigerd; er is geen stille terugval naar een standaardorganisatie.

## 5. Gevolgen voor het datamodel

De volgende implementatieregels gelden:

1. Eén centrale gebruikersidentiteit kan lidmaatschappen in meerdere scholen hebben.
2. Organisaties worden opgeslagen met stabiele UUID's en expliciete foreign keys.
3. Campus Ninove en Campus Zottegem verwijzen naar dezelfde school-ID.
4. Hamme, Gent en Eeklo krijgen elk een eigen school-ID.
5. De configuratie van de aankopenmodule wordt aan de school-ID gekoppeld.
6. De centrale identiteitsdatabase bewaart organisaties, lidmaatschappen, modules en autorisaties; bestelgegevens blijven in de afzonderlijke contextdatabases.
7. Elke schoolcontext krijgt een eigen D1-database en afzonderlijke R2-opslag.
8. De API lost de context en opslagresource server-side op, op basis van de geauthenticeerde gebruiker en diens expliciete rechten.

## 6. Nog open vóór migratie

- De exacte naam en ID van de koepel.
- De exacte naam en ID van het schoolbestuur waaronder de vier scholen vallen.
- De formele schoolnaam van de huidige school met campussen Ninove en Zottegem.
- De precieze campusnamen, adressen en codes.
- De bestaande gebruikers- en roltoewijzingen die naar de nieuwe schoolcontexten moeten worden gemapt.

## 7. Volgende uitvoeringsvolgorde

1. De formele organisatiegegevens en UUID's vastleggen.
2. Een versiebeheerbare migratie voor de centrale identiteitsdatabase ontwerpen.
3. De organisatieboom, lidmaatschappen en expliciete roltoewijzingen implementeren.
4. De contextkeuze na aanmelden en server-side autorisatie implementeren.
5. De huidige aankopendatabase back-uppen en de bestaande Ninove/Zottegem-data gecontroleerd koppelen aan de nieuwe school-ID.
6. De bestaande aankopenmodule op de nieuwe schoolcontext laten werken en regressietesten uitvoeren.
7. Lege, afzonderlijke contextdatabases en R2-opslag voor Hamme, Gent en Eeklo aanmaken.
8. Cross-context beveiliging en alle bestaande bestelprocessen testen vóór ingebruikname.

## Veiligheidsgrens

Dit document legt alleen de bevestigde beslissingen vast. Het wijzigt geen productiecode, databases, bestaande records, Cloudflare-resources, DNS, Access-policies of R2-objecten. De migratie begint pas na bevestiging van de nog openstaande formele organisatiegegevens en een gecontroleerd back-up- en rollbackplan.

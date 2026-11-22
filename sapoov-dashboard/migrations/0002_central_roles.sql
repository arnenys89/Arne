ALTER TABLE roles ADD COLUMN application_id TEXT REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE roles ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE applications ADD COLUMN access_audience TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_application_name ON roles(application_id, name);

-- Registreer eerst alle gekoppelde toepassingen; daarna kunnen hun rollen worden toegevoegd.
INSERT OR IGNORE INTO applications(id,name,description,url,icon,category,sort_order,access_audience) VALUES
 ('werkplekreservatie','Werkplekreservatie','Werkplekken en lokalen reserveren','https://werkplekreservatie.sapoov.be','calendar','Personeel',80,'20322e73dbe167a5c5fffa9ca78c7f5c90fddf938aab61fe5d1163959102836f'),
 ('examenmaker','Examenmaker','Examens en evaluaties beheren','https://richtpunt-examenmaker.arne-nys.workers.dev','clipboard-list','Onderwijs',90,'9967783c7467fbeaf29b550ee97119402b778f803d6649e4e93ee2f924c9d6e9'),
 ('schoolwerkplan','Schoolwerkplan','Interactief schoolwerkplan','https://schoolwerkplan-poov.pages.dev','book-open','Onderwijs',100,'ca34c7f3a6cfc2c5c0e309b2443e6d127e431dcb57dd93f6724cb404a29bae0d'),
 ('beleidskompas','Beleidskompas','Strategische en operationele doelen opvolgen','https://richtpunt-beleidskompas.pages.dev','compass','Onderwijs',110,''),
 ('richtpunt-dashboard','Richtpunt dashboard','Centrale startpagina voor digitale toepassingen','https://dashboard.sapoov.be','layout-dashboard','Onderwijs',120,'f3a6b885d7f0802c88a37fc31bf78a40ae007c2e7574a1485ee81088ec9b5315');

-- Koppel de bestaande Cloudflare Access-apps aan hun centrale applicatierecord.
UPDATE applications SET access_audience='c76aa7483c5c89e436cb4ddf2ad0d545f79e612d9701ed357aa8921ab77dea73' WHERE id='bestelplatform';
UPDATE applications SET access_audience='5257fe65baaf3c44dbf00e929b4313f68397f72aa9ecc71e2cffb263f2d485b5' WHERE id='calendar-bridge';
UPDATE applications SET access_audience='fcdaec75139ecac167e47c004195f34c1ff3c9da8bdf6e2e736408639050c8d9' WHERE id='professionalisering';
UPDATE applications SET access_audience='6784b780966a198ef48bd963cdd239c1ca50fcab0e7fcc76f717594eb75e074f' WHERE id='activiteitenplatform';
UPDATE applications SET access_audience='9115b101d19007cbb6ece0b0de54a653c03f4b3d084226993a8c480a54caad09' WHERE id='schoolreglementen';
UPDATE applications SET access_audience='c5fdf0a87d8475a280b8ef4b88a7b1e20f457f30249a2e1c1556f30517ad7242' WHERE id='doelennetwerk';

-- Startrollen per website; rechtensleutels worden door de betreffende backend gecontroleerd.
INSERT OR IGNORE INTO roles(id, application_id, name, description, permissions_json) VALUES
 ('bestelplatform-personeelslid','bestelplatform','Personeelslid','Aanvragen indienen en eigen aanvragen opvolgen','["orders.create","orders.view_own"]'),
 ('bestelplatform-aankoper','bestelplatform','Aankoper','Bestellingen beoordelen en opvolgen','["orders.view_all","orders.approve","orders.reject","orders.request_info"]'),
 ('bestelplatform-administrator','bestelplatform','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('activiteitenplatform-aanvrager','activiteitenplatform','Aanvrager','Activiteiten indienen en eigen aanvragen opvolgen','["activities.create","activities.view_own"]'),
 ('activiteitenplatform-beoordelaar','activiteitenplatform','Beoordelaar','Activiteitenaanvragen beoordelen','["activities.view_all","activities.review"]'),
 ('activiteitenplatform-administrator','activiteitenplatform','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('schoolreglementen-beheerder','schoolreglementen','Beheerder','Schoolreglementen beheren','["regulations.manage"]'),
 ('schoolreglementen-lezer','schoolreglementen','Lezer','Schoolreglementen raadplegen','["regulations.read"]'),
 ('calendar-bridge-gebruiker','calendar-bridge','Gebruiker','Eigen agenda’s beheren','["calendar.manage_own"]'),
 ('calendar-bridge-administrator','calendar-bridge','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('werkplekreservatie-medewerker','werkplekreservatie','Medewerker','Werkplekken reserveren en eigen reservaties beheren','["reservations.create","reservations.manage_own"]'),
 ('werkplekreservatie-teamleider','werkplekreservatie','Teamleider','Reservaties en werkplekken binnen het team beheren','["reservations.manage_team"]'),
 ('werkplekreservatie-administrator','werkplekreservatie','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('examenmaker-leerkracht','examenmaker','Leerkracht','Examens aanmaken en eigen examens beheren','["exams.create","exams.manage_own"]'),
 ('examenmaker-teamleider','examenmaker','Teamleider','Examens binnen het team beheren','["exams.manage_team"]'),
 ('examenmaker-administrator','examenmaker','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('schoolwerkplan-medewerker','schoolwerkplan','Medewerker','Schoolwerkplan raadplegen','["schoolplan.read"]'),
 ('schoolwerkplan-teamleider','schoolwerkplan','Teamleider','Operationele doelen binnen het team beheren','["schoolplan.manage_team"]'),
 ('schoolwerkplan-administrator','schoolwerkplan','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('richtpunt-dashboard-gebruiker','richtpunt-dashboard','Gebruiker','Toegang tot toegewezen toepassingen','["dashboard.read"]'),
 ('richtpunt-dashboard-administrator','richtpunt-dashboard','Administrator','Volledig beheer van het dashboard','["*"]');

INSERT OR IGNORE INTO roles(id,application_id,name,description,permissions_json) VALUES
('professionalisering-administrator','professionalisering','Administrator','Volledig beheer van deze toepassing','["*"]'),
('professionalisering-directie','professionalisering','Directie','Inzage in personeelsgegevens','["personnel.read_all"]'),
('professionalisering-tac-ta','professionalisering','TAC/TA','Beheer van toegewezen activiteiten','["activities.manage"]'),
('professionalisering-econoom','professionalisering','Econoom','Financieel en economisch beheer','["budget.manage"]'),
('professionalisering-personeelsverantwoordelijke','professionalisering','Personeelsverantwoordelijke','Beheer van personeelsgegevens','["personnel.manage"]'),
('professionalisering-personeelslid','professionalisering','Personeelslid','Standaardtoegang voor personeelsleden','["activities.read_own"]');

ALTER TABLE user_app_roles ADD COLUMN scope_json TEXT NOT NULL DEFAULT '{}';

INSERT OR IGNORE INTO roles(id,application_id,name,description,permissions_json) VALUES
 ('schoolreglementen-administrator','schoolreglementen','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('doelennetwerk-administrator','doelennetwerk','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('edudash-administrator','edudash','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('beleidskompas-administrator','beleidskompas','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('schoolwerkplan-administrator','schoolwerkplan','Administrator','Volledig beheer van deze toepassing','["*"]'),
 ('professionalisering-administrator','professionalisering','Administrator','Volledig beheer van deze toepassing','["*"]');

-- Beleidskompas wordt een interne SAPOOV-werkruimte.
UPDATE applications SET name='Beleidskompas',description='Strategische en operationele doelen en PDCA-opvolging',url='/beleidskompas',icon='compass',category='Onderwijs',status='active',sort_order=105 WHERE id='beleidskompas';
INSERT OR IGNORE INTO roles(id,application_id,name,description,permissions_json) VALUES
 ('beleidskompas-lezer','beleidskompas','Lezer','Beleidsdoelen, acties en PDCA-informatie raadplegen','["policy.read"]'),
 ('beleidskompas-beheerder','beleidskompas','Beheerder','Volledige toegang tot de Beleidskompas-werkruimte','["policy.read","policy.manage"]');

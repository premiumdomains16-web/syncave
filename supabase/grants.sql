-- Run this if the server reports "permission denied for table ...".
-- Gives the service_role (what the server's secret key acts as) access to the app tables.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

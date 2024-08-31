# usage: make [command]
help:
	@cat ./makefile

regen-types: regen-types-prod

regen-types-prod:
	npx supabase gen types typescript --project-id pxidrgkatumlvfqaxcll --schema public > ../../common/src/supabase/schema.ts
	cd ../../common && npx prettier --write ./src/supabase/schema.ts

regen-types-dev:
	npx supabase gen types typescript --project-id mfodonznyfxllcezufgr --schema public > ../../common/src/supabase/schema.ts
	cd ../../common && npx prettier --write ./src/supabase/schema.ts

use-prod:
	firebase use prod

use-dev:
	firebase use dev

regen-schema:
	cd ../scripts && npx ts-node regen-schema.ts

regen-schema-prod: use-prod regen-schema

regen-schema-dev: use-dev regen-schema

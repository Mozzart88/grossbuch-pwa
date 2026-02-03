ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)), $(MAKECMDGOALS))

all: 
	npm run build

run:
	npm run preview

dev:
	npm run dev

coverage:
	npx vitest run --coverage --reporter=dot

test:
	npm run test:run $(ARGS)

lint:
	npm run lint $(ARGS)

echo:
	@echo "npm run test -- $(ARGS)"
	@# echo "npm run test -- $(filter-out $@,$(MAKECMDGOALS))"

%:
	@:


# @:

.PHONY: echo test lint coverage all $(ARGS)

.SILENT: $@

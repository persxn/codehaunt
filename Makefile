SHELL := bash

# Exported env for CI and test
export CJUDGE_RUNNER_IMAGE := codehaunt-runner:1

.DEFAULT_GOAL := help
.PHONY: help install check-env install-if-needed db migrate seed dev runners typecheck lint test check-readmes build loadtest ci down

help: ## list targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/^([a-z-]+):.*## (.*)/  \1\t\2/'

install: ## install npm dependencies
	npm install

# Ensure .env exists
check-env:
	@if [ ! -f .env ]; then \
	  echo "copy .env.example to .env and fill it in"; \
	  exit 1; \
	fi

db: check-env ## start Postgres (127.0.0.1:5434)
	docker compose --profile db up -d --wait

migrate: check-env ## apply Prisma migrations
	npm run migrate:deploy -w @codehaunt/db

seed: check-env ## seed the demo event (dev only)
	node --env-file=.env --experimental-strip-types scripts/seed.ts

install-if-needed:
	@test -d node_modules || $(MAKE) install

dev: install-if-needed db migrate seed ## db + migrate + seed
	@echo "Start the web app with: npm run dev -w @codehaunt/web"

runners: ## build the sandbox runner images
	bash packages/judge/docker/build.sh

typecheck: ## typecheck every workspace
	npm run typecheck

lint: ## typecheck + README check (no linter chosen yet)
	npm run typecheck && node scripts/check-readmes.mjs

test: ## run all tests (needs Docker + runner images)
	npm test

check-readmes: ## check every folder README
	node scripts/check-readmes.mjs

build: ## build the web app
	npm run build -w @codehaunt/web

loadtest: ## load test (WP-08)
	echo "load test: WP-08" && exit 1

ci: ## full CI run
	bash scripts/ci.sh

down: ## stop Postgres
	docker compose --profile db down

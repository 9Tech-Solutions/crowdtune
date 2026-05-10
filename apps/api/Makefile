.PHONY: help tidy build run dev test lint vet generate openapi sqlc-gen migrate-up migrate-down migrate-status

GOOSE_DRIVER ?= postgres
GOOSE_DBSTRING ?= $(DATABASE_URL_DIRECT)
MIGRATIONS_DIR ?= ../../infra/migrations

help:
	@echo "Targets: tidy build run dev test lint vet generate openapi sqlc-gen migrate-up migrate-down migrate-status"

tidy:
	go mod tidy

build:
	go build -o bin/api ./cmd/api

run: build
	./bin/api

dev:
	air

test:
	go test ./... -race -count=1

vet:
	go vet ./...

lint:
	golangci-lint run ./...

generate: openapi sqlc-gen

openapi:
	oapi-codegen --config oapi-config.yaml openapi.yaml

sqlc-gen:
	sqlc generate

migrate-up:
	goose -dir $(MIGRATIONS_DIR) $(GOOSE_DRIVER) "$(GOOSE_DBSTRING)" up

migrate-down:
	goose -dir $(MIGRATIONS_DIR) $(GOOSE_DRIVER) "$(GOOSE_DBSTRING)" down

migrate-status:
	goose -dir $(MIGRATIONS_DIR) $(GOOSE_DRIVER) "$(GOOSE_DBSTRING)" status

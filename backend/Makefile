.PHONY: run build tidy

export PATH := $(HOME)/sdk/go/bin:$(PATH)

run:
	go run ./cmd/server

build:
	go build -o bin/kngold ./cmd/server

tidy:
	go mod tidy

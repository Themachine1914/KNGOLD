package config

import (
	"os"
	"strconv"
)

type Config struct {
	Addr             string
	DatabasePath     string
	JWTSecret        string
	ReservationHours int
}

func Load() Config {
	hours, err := strconv.Atoi(env("RESERVATION_HOURS", "48"))
	if err != nil || hours <= 0 {
		hours = 48
	}
	return Config{
		Addr:             env("ADDR", ":8080"),
		DatabasePath:     env("DATABASE_PATH", "./data/kngold.db"),
		JWTSecret:        env("JWT_SECRET", "kngold-dev-secret-change-in-production-2026"),
		ReservationHours: hours,
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

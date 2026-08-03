package db

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/kngold/sistema/internal/auth"
)

type productSeed struct {
	SKU, Type, Name, Description, Color string
	ListPrice, DiscountPct, NetPrice    float64
	Stock                               int
}

func Seed(db *sql.DB) error {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}

	hash, err := auth.HashPassword("kngold2026")
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)

	users := []struct {
		name, email, role string
	}{
		{"Dueño KN GOLD", "dueno@kngold.com.do", "OWNER"},
		{"Vendedor Demo", "vendedor@kngold.com.do", "SELLER"},
		{"Vendedor Norte", "vendedor2@kngold.com.do", "SELLER"},
	}
	for _, u := range users {
		_, err := db.Exec(`
			INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
			uuid.NewString(), u.name, u.email, hash, u.role, now, now)
		if err != nil {
			return err
		}
	}

	products := []productSeed{
		{"KN-SF1", "ABANICO", "Abanico de pedestal", `Tamaño 18"`, "NEGRO", 2525, 10, 2272.5, 188},
		{"KN-0151", "ESTUFA", "Estufa de 20'' Satinada", "Tamaño 20''", "SATINADA", 10965, 0, 10965, 12},
		{"KN-76N", "ESTUFA", "Estufa de 30'' Satinada", "Tamaño 30''", "SATINADA", 24995, 0, 24995, 185},
		{"KN-76G", "ESTUFA", `Estufa de 30" tope en cristal`, `Tamaño 30"`, "SATINADA", 23750, 0, 23750, 273},
		{"KN-6201", "ESTUFA", `Estufa de 24" libras`, `Tamaño 24"`, "SATINADA", 14750, 0, 14750, 148},
		{"KN-7600", "ESTUFA", `Estufa de 30"`, `Tamaño 30"`, "SATINADA", 19455, 0, 19455, 322},
		{"KN-60X", "ESTUFA", `Estufa 24" Alta Gama`, `Tamaño 24"`, "SATINADA", 25775, 0, 25775, 94},
		{"KN-80X", "ESTUFA", `Estufa 30" Alta Gama`, `Tamaño 30"`, "SATINADA", 31395, 0, 31395, 0},
		{"KN-18", "LAVADORA", "Lavadora 18 libras", "Tamaño 18 libras", "", 9485, 0, 9485, 29},
		{"KN-22", "LAVADORA", "Lavadora 22 libras", "Tamaño 22 libras", "", 11240, 0, 11240, 56},
		{"KN-30", "LAVADORA", "Lavadora 30 libras", "Tamaño 30 libras", "", 12860, 0, 12860, 15},
		{"KN-560", "NEVERA", "Nevera 2 puertas", "Tamaño 20 pies", "SATINADA", 55940, 3, 54261.8, 43},
	}
	for _, p := range products {
		_, err := db.Exec(`
			INSERT INTO products (
				id, sku, name, type, description, color, list_price, discount_pct, net_price,
				stock_on_hand, active, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			uuid.NewString(), p.SKU, p.Name, p.Type, nullEmpty(p.Description), nullEmpty(p.Color),
			p.ListPrice, p.DiscountPct, p.NetPrice, p.Stock, now, now)
		if err != nil {
			return err
		}
	}

	_, err = db.Exec(`
		INSERT INTO app_settings (id, key, value) VALUES (?, 'reservation_hours', '48')`,
		uuid.NewString())
	return err
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

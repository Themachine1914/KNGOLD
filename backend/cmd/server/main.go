package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/kngold/sistema/internal/auth"
	"github.com/kngold/sistema/internal/config"
	"github.com/kngold/sistema/internal/db"
	"github.com/kngold/sistema/internal/handlers"
	"github.com/kngold/sistema/internal/imports"
	"github.com/kngold/sistema/internal/inventory"
	mw "github.com/kngold/sistema/internal/middleware"
)

func main() {
	cfg := config.Load()

	sqlDB, err := db.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer sqlDB.Close()

	root := findBackendRoot()
	mig := filepath.Join(root, "migrations", "001_init.sql")
	if err := db.Migrate(sqlDB, mig); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	if err := db.Seed(sqlDB); err != nil {
		log.Fatalf("seed: %v", err)
	}

	authSvc := &auth.Service{DB: sqlDB, Secret: []byte(cfg.JWTSecret)}
	invSvc := &inventory.Service{DB: sqlDB, ReservationHours: cfg.ReservationHours}
	impSvc := &imports.Service{DB: sqlDB}
	api := &handlers.API{Auth: authSvc, Inventory: invSvc, Imports: impSvc}

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))

	// Static product images from the Next.js public folder when available.
	productsDir := filepath.Join(root, "..", "public", "products")
	r.Handle("/products/*", http.StripPrefix("/products/", http.FileServer(http.Dir(productsDir))))

	r.Get("/health", api.Health)
	r.Post("/api/auth/login", api.Login)
	r.Post("/api/auth/logout", api.Logout)
	r.Get("/api/cron/expire-quotes", api.ExpireQuotes)

	r.Group(func(pr chi.Router) {
		pr.Use(mw.RequireAuth(authSvc))
		pr.Get("/api/me", api.Me)
		pr.Get("/api/products", api.ListProducts)
		pr.Get("/api/movements", api.ListMovements)
		pr.Post("/api/quotes", api.CreateQuote)
		pr.Post("/api/quotes/{id}/confirm", api.ConfirmQuote)
		pr.Post("/api/quotes/{id}/cancel", api.CancelQuote)

		pr.Group(func(or chi.Router) {
			or.Use(mw.RequireOwner)
			or.Post("/api/inventory/adjust", api.AdjustStock)
			or.Post("/api/imports", api.CreateImport)
			or.Post("/api/imports/{id}/transit", api.ImportTransit)
			or.Post("/api/imports/{id}/arrive", api.ImportArrive)
			or.Post("/api/imports/{id}/cancel", api.ImportCancel)
		})
	})

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>KN GOLD Go</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;background:#f6f3ec;color:#151311}
code{background:#fff;padding:.1rem .35rem;border-radius:.35rem}
.card{background:#fff;border:1px solid #e4ddd2;border-radius:1rem;padding:1rem;margin:1rem 0}
</style></head><body>
<h1>KN GOLD · Go</h1>
<p>API del sistema lista. El frontend Next.js sigue en el puerto 3000; este backend corre en <strong>:8080</strong>.</p>
<div class="card">
<p><strong>Health:</strong> <a href="/health">/health</a></p>
<p><strong>Login demo:</strong></p>
<pre>curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dueno@kngold.com.do","password":"kngold2026"}'</pre>
</div>
</body></html>`))
	})

	log.Printf("KN GOLD Go escuchando en %s (db=%s)", cfg.Addr, cfg.DatabasePath)
	if err := http.ListenAndServe(cfg.Addr, r); err != nil {
		log.Fatal(err)
	}
}

func findBackendRoot() string {
	candidates := []string{".", "..", filepath.Join("..", "backend")}
	wd, _ := os.Getwd()
	for _, c := range candidates {
		p := filepath.Join(wd, c)
		if _, err := os.Stat(filepath.Join(p, "migrations", "001_init.sql")); err == nil {
			abs, _ := filepath.Abs(p)
			return abs
		}
	}
	// fallback: directory of executable's parent expectations
	abs, _ := filepath.Abs(".")
	return abs
}

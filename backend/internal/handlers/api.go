package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kngold/sistema/internal/auth"
	"github.com/kngold/sistema/internal/imports"
	"github.com/kngold/sistema/internal/inventory"
	"github.com/kngold/sistema/internal/models"
)

type API struct {
	Auth      *auth.Service
	Inventory *inventory.Service
	Imports   *imports.Service
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"ok": "kngold-go"})
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	u, err := a.Auth.Authenticate(body.Email, body.Password)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	token, err := a.Auth.IssueToken(u)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "no se pudo crear sesión")
		return
	}
	auth.SetAuthCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id": u.ID, "name": u.Name, "email": u.Email, "role": u.Role,
		},
	})
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	auth.ClearAuthCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	writeJSON(w, http.StatusOK, u)
}

func (a *API) ListProducts(w http.ResponseWriter, r *http.Request) {
	_, _ = a.Inventory.ExpireReservedQuotes()
	products, err := a.Inventory.ProductsWithAvailability()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, products)
}

func (a *API) AdjustStock(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	var body struct {
		ProductID string `json:"productId"`
		QtyDelta  int    `json:"qtyDelta"`
		Note      string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	if err := a.Inventory.AdjustStock(body.ProductID, body.QtyDelta, u.ID, body.Note); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) CreateQuote(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	var body struct {
		Customer     inventory.CustomerInput  `json:"customer"`
		IncludeITBIS bool                     `json:"includeItbis"`
		Notes        string                   `json:"notes"`
		Lines        []inventory.QuoteLineInput `json:"lines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	q, err := a.Inventory.CreateReservedQuote(u.ID, body.Customer, body.IncludeITBIS, body.Notes, body.Lines)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "quote": q})
}

func (a *API) ConfirmQuote(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	id := chi.URLParam(r, "id")
	if err := a.Inventory.ConfirmQuote(id, u.ID); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) CancelQuote(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	id := chi.URLParam(r, "id")
	if err := a.Inventory.CancelQuote(id, u.ID); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) CreateImport(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	var body struct {
		Supplier string              `json:"supplier"`
		ETA      string              `json:"eta"`
		Notes    string              `json:"notes"`
		Status   models.ImportStatus `json:"status"`
		Lines    []imports.LineInput `json:"lines"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "json inválido")
		return
	}
	eta, err := time.Parse("2006-01-02", body.ETA)
	if err != nil {
		// try RFC3339
		eta, err = time.Parse(time.RFC3339, body.ETA)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "fecha ETA inválida")
			return
		}
	} else {
		eta = time.Date(eta.Year(), eta.Month(), eta.Day(), 12, 0, 0, 0, time.UTC)
	}
	order, err := a.Imports.Create(u.ID, body.Supplier, body.Notes, eta, body.Status, body.Lines)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "import": order})
}

func (a *API) ImportTransit(w http.ResponseWriter, r *http.Request) {
	if err := a.Imports.MarkInTransit(chi.URLParam(r, "id")); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) ImportArrive(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	if err := a.Imports.Receive(chi.URLParam(r, "id"), u.ID); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) ImportCancel(w http.ResponseWriter, r *http.Request) {
	if err := a.Imports.Cancel(chi.URLParam(r, "id")); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) ExpireQuotes(w http.ResponseWriter, r *http.Request) {
	n, err := a.Inventory.ExpireReservedQuotes()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "expired": n})
}

func (a *API) ListMovements(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	rows, err := a.Inventory.DB.Query(`
		SELECT m.id, m.product_id, m.type, m.qty, m.stock_after, m.available_after,
		       m.quote_id, m.user_id, COALESCE(m.note,''), m.created_at,
		       p.sku, p.name, COALESCE(u.name,''), q.number
		FROM inventory_movements m
		JOIN products p ON p.id = m.product_id
		LEFT JOIN users u ON u.id = m.user_id
		LEFT JOIN quotes q ON q.id = m.quote_id
		ORDER BY m.created_at DESC
		LIMIT ?`, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var out []map[string]any
	for rows.Next() {
		var (
			id, pid, typ, note, created, sku, pname, uname string
			qty, stockAfter, availAfter                    int
			quoteID, userID                                sql.NullString
			qnum                                           sql.NullInt64
		)
		if err := rows.Scan(&id, &pid, &typ, &qty, &stockAfter, &availAfter,
			&quoteID, &userID, &note, &created, &sku, &pname, &uname, &qnum); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		label, focusAvail := inventory.MovementDelta(models.MovementType(typ), qty)
		remaining := stockAfter
		if focusAvail {
			remaining = availAfter
		}
		item := map[string]any{
			"id": id, "productId": pid, "type": typ, "qty": qty,
			"stockAfter": stockAfter, "availableAfter": availAfter,
			"note": note, "createdAt": created, "deltaLabel": label, "remaining": remaining,
			"product": map[string]any{"sku": sku, "name": pname},
			"userName": uname,
		}
		if qnum.Valid {
			item["quoteNumber"] = qnum.Int64
		}
		out = append(out, item)
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, out)
}

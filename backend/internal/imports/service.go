package imports

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/kngold/sistema/internal/models"
)

type Service struct {
	DB *sql.DB
}

type LineInput struct {
	ProductID string `json:"productId"`
	Qty       int    `json:"qty"`
}

func (s *Service) Create(createdByID, supplier, notes string, eta time.Time, status models.ImportStatus, lines []LineInput) (*models.ImportOrder, error) {
	if len(lines) == 0 {
		return nil, errors.New("el pedido debe tener al menos un producto")
	}
	for _, l := range lines {
		if l.Qty <= 0 {
			return nil, errors.New("cantidad inválida")
		}
	}
	if status == "" {
		status = models.ImportOrdered
	}

	var last sql.NullInt64
	_ = s.DB.QueryRow(`SELECT MAX(number) FROM import_orders`).Scan(&last)
	number := int(last.Int64) + 1
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.Exec(`
		INSERT INTO import_orders (id, number, supplier, status, eta, notes, created_by_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, number, nullStr(supplier), status, eta.Format(time.RFC3339), nullStr(notes), createdByID, now, now)
	if err != nil {
		return nil, err
	}
	for _, l := range lines {
		_, err = tx.Exec(`
			INSERT INTO import_order_lines (id, import_id, product_id, qty)
			VALUES (?, ?, ?, ?)`, uuid.NewString(), id, l.ProductID, l.Qty)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &models.ImportOrder{
		ID: id, Number: number, Supplier: supplier, Status: status,
		ETA: eta, Notes: notes, CreatedByID: createdByID,
	}, nil
}

func (s *Service) MarkInTransit(id string) error {
	return s.setStatus(id, models.ImportInTransit)
}

func (s *Service) Cancel(id string) error {
	var status string
	if err := s.DB.QueryRow(`SELECT status FROM import_orders WHERE id = ?`, id).Scan(&status); err != nil {
		return err
	}
	if status == string(models.ImportArrived) {
		return errors.New("no se puede cancelar un pedido ya recibido")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.DB.Exec(`UPDATE import_orders SET status = 'CANCELLED', updated_at = ? WHERE id = ?`, now, id)
	return err
}

func (s *Service) setStatus(id string, status models.ImportStatus) error {
	var cur string
	if err := s.DB.QueryRow(`SELECT status FROM import_orders WHERE id = ?`, id).Scan(&cur); err != nil {
		return err
	}
	if cur == string(models.ImportArrived) {
		return errors.New("este pedido ya llegó; no se puede cambiar")
	}
	if cur == string(models.ImportCancelled) {
		return errors.New("este pedido está cancelado")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.DB.Exec(`UPDATE import_orders SET status = ?, updated_at = ? WHERE id = ?`, status, now, id)
	return err
}

func (s *Service) Receive(id, userID string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	var number int
	if err := tx.QueryRow(`SELECT status, number FROM import_orders WHERE id = ?`, id).Scan(&status, &number); err != nil {
		return err
	}
	if status == string(models.ImportArrived) {
		return errors.New("este pedido ya fue recibido")
	}
	if status == string(models.ImportCancelled) {
		return errors.New("no se puede recibir un pedido cancelado")
	}

	rows, err := tx.Query(`SELECT product_id, qty FROM import_order_lines WHERE import_id = ?`, id)
	if err != nil {
		return err
	}
	type line struct {
		pid string
		qty int
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.pid, &l.qty); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, l)
	}
	rows.Close()

	now := time.Now().UTC().Format(time.RFC3339)
	for _, l := range lines {
		var stock int
		if err := tx.QueryRow(`SELECT stock_on_hand FROM products WHERE id = ?`, l.pid).Scan(&stock); err != nil {
			return err
		}
		next := stock + l.qty
		if _, err := tx.Exec(`UPDATE products SET stock_on_hand = ?, updated_at = ? WHERE id = ?`, next, now, l.pid); err != nil {
			return err
		}
		var reserved int
		_ = tx.QueryRow(`
			SELECT COALESCE(SUM(ql.qty), 0)
			FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
			WHERE ql.product_id = ? AND q.status = 'RESERVED'`, l.pid).Scan(&reserved)
		_, err = tx.Exec(`
			INSERT INTO inventory_movements (
				id, product_id, type, qty, stock_after, available_after, user_id, note, created_at
			) VALUES (?, ?, 'ENTRADA', ?, ?, ?, ?, ?, ?)`,
			uuid.NewString(), l.pid, l.qty, next, next-reserved, userID,
			fmt.Sprintf("Importación #%d llegada", number), now)
		if err != nil {
			return err
		}
	}

	_, err = tx.Exec(`
		UPDATE import_orders SET status = 'ARRIVED', arrived_at = ?, updated_at = ? WHERE id = ?`,
		now, now, id)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

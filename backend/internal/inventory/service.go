package inventory

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/kngold/sistema/internal/models"
	"github.com/kngold/sistema/internal/pricing"
)

type Service struct {
	DB               *sql.DB
	ReservationHours int
}

func (s *Service) ReservedQty(productID string, excludeQuoteID string) (int, error) {
	q := `
		SELECT COALESCE(SUM(ql.qty), 0)
		FROM quote_lines ql
		JOIN quotes q ON q.id = ql.quote_id
		WHERE ql.product_id = ? AND q.status = 'RESERVED'`
	args := []any{productID}
	if excludeQuoteID != "" {
		q += ` AND q.id != ?`
		args = append(args, excludeQuoteID)
	}
	var n int
	err := s.DB.QueryRow(q, args...).Scan(&n)
	return n, err
}

func (s *Service) Available(productID string, excludeQuoteID string) (stock, reserved, available int, err error) {
	err = s.DB.QueryRow(`SELECT stock_on_hand FROM products WHERE id = ?`, productID).Scan(&stock)
	if err != nil {
		return
	}
	reserved, err = s.ReservedQty(productID, excludeQuoteID)
	if err != nil {
		return
	}
	available = stock - reserved
	return
}

func (s *Service) ProductsWithAvailability() ([]models.Product, error) {
	rows, err := s.DB.Query(`
		SELECT id, sku, name, type, COALESCE(description,''), COALESCE(color,''),
		       list_price, discount_pct, net_price, stock_on_hand, active
		FROM products WHERE active = 1
		ORDER BY type, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	reservedMap := map[string]int{}
	rrows, err := s.DB.Query(`
		SELECT ql.product_id, SUM(ql.qty)
		FROM quote_lines ql
		JOIN quotes q ON q.id = ql.quote_id
		WHERE q.status = 'RESERVED'
		GROUP BY ql.product_id`)
	if err != nil {
		return nil, err
	}
	for rrows.Next() {
		var pid string
		var qty int
		if err := rrows.Scan(&pid, &qty); err != nil {
			rrows.Close()
			return nil, err
		}
		reservedMap[pid] = qty
	}
	rrows.Close()

	var out []models.Product
	for rows.Next() {
		var p models.Product
		var active int
		if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Type, &p.Description, &p.Color,
			&p.ListPrice, &p.DiscountPct, &p.NetPrice, &p.StockOnHand, &active); err != nil {
			return nil, err
		}
		p.Active = active == 1
		p.Reserved = reservedMap[p.ID]
		p.Available = p.StockOnHand - p.Reserved
		out = append(out, p)
	}
	return out, rows.Err()
}

type QuoteLineInput struct {
	ProductID string `json:"productId"`
	Qty       int    `json:"qty"`
}

type CustomerInput struct {
	Name    string `json:"name"`
	RNC     string `json:"rnc"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
	Email   string `json:"email"`
}

func (s *Service) CreateReservedQuote(sellerID string, customer CustomerInput, includeITBIS bool, notes string, lines []QuoteLineInput) (*models.Quote, error) {
	if len(lines) == 0 {
		return nil, errors.New("la cotización debe tener al menos un producto")
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	type built struct {
		ProductID string
		Qty       int
		UnitPrice float64
		LineTotal float64
		Stock     int
	}
	var builtLines []built
	var lineTotals []float64

	for _, l := range lines {
		if l.Qty <= 0 {
			return nil, errors.New("cantidad inválida")
		}
		var sku string
		var stock int
		var net float64
		err := tx.QueryRow(`SELECT sku, stock_on_hand, net_price FROM products WHERE id = ?`, l.ProductID).
			Scan(&sku, &stock, &net)
		if err != nil {
			return nil, fmt.Errorf("producto no encontrado")
		}
		var reserved int
		err = tx.QueryRow(`
			SELECT COALESCE(SUM(ql.qty), 0)
			FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
			WHERE ql.product_id = ? AND q.status = 'RESERVED'`, l.ProductID).Scan(&reserved)
		if err != nil {
			return nil, err
		}
		avail := stock - reserved
		if l.Qty > avail {
			return nil, fmt.Errorf("stock insuficiente para %s: disponible %d, solicitado %d", sku, avail, l.Qty)
		}
		lt := net * float64(l.Qty)
		builtLines = append(builtLines, built{l.ProductID, l.Qty, net, lt, stock})
		lineTotals = append(lineTotals, lt)
	}

	customerID := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = tx.Exec(`
		INSERT INTO customers (id, name, rnc, phone, address, email, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		customerID, customer.Name, nullStr(customer.RNC), nullStr(customer.Phone),
		nullStr(customer.Address), nullStr(customer.Email), now, now)
	if err != nil {
		return nil, err
	}

	var lastNum sql.NullInt64
	_ = tx.QueryRow(`SELECT MAX(number) FROM quotes`).Scan(&lastNum)
	number := int(lastNum.Int64) + 1
	totals := pricing.CalcQuoteTotals(lineTotals, includeITBIS)
	hours := s.ReservationHours
	if hours <= 0 {
		hours = 48
	}
	until := time.Now().UTC().Add(time.Duration(hours) * time.Hour)
	quoteID := uuid.NewString()
	include := 0
	if includeITBIS {
		include = 1
	}

	_, err = tx.Exec(`
		INSERT INTO quotes (
			id, number, seller_id, customer_id, include_itbis, status,
			subtotal, itbis_amount, total, reserved_until, notes, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, 'RESERVED', ?, ?, ?, ?, ?, ?, ?)`,
		quoteID, number, sellerID, customerID, include,
		totals.Subtotal, totals.ITBISAmount, totals.Total,
		until.Format(time.RFC3339), nullStr(notes), now, now)
	if err != nil {
		return nil, err
	}

	for _, bl := range builtLines {
		lineID := uuid.NewString()
		_, err = tx.Exec(`
			INSERT INTO quote_lines (id, quote_id, product_id, qty, unit_price, line_total)
			VALUES (?, ?, ?, ?, ?, ?)`,
			lineID, quoteID, bl.ProductID, bl.Qty, bl.UnitPrice, bl.LineTotal)
		if err != nil {
			return nil, err
		}
		var reserved int
		err = tx.QueryRow(`
			SELECT COALESCE(SUM(ql.qty), 0)
			FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
			WHERE ql.product_id = ? AND q.status = 'RESERVED'`, bl.ProductID).Scan(&reserved)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(`
			INSERT INTO inventory_movements (
				id, product_id, type, qty, stock_after, available_after, quote_id, user_id, note, created_at
			) VALUES (?, ?, 'RESERVA', ?, ?, ?, ?, ?, ?, ?)`,
			uuid.NewString(), bl.ProductID, bl.Qty, bl.Stock, bl.Stock-reserved,
			quoteID, sellerID, fmt.Sprintf("Reserva cotización #%d", number), now)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &models.Quote{
		ID: quoteID, Number: number, SellerID: sellerID, CustomerID: customerID,
		IncludeITBIS: includeITBIS, Status: models.QuoteReserved,
		Subtotal: totals.Subtotal, ITBISAmount: totals.ITBISAmount, Total: totals.Total,
		ReservedUntil: &until,
	}, nil
}

func (s *Service) ConfirmQuote(quoteID, userID string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	var number int
	err = tx.QueryRow(`SELECT status, number FROM quotes WHERE id = ?`, quoteID).Scan(&status, &number)
	if err != nil {
		return err
	}
	if status != string(models.QuoteReserved) {
		return errors.New("solo se pueden confirmar cotizaciones reservadas")
	}

	rows, err := tx.Query(`SELECT product_id, qty FROM quote_lines WHERE quote_id = ?`, quoteID)
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
		var sku string
		if err := tx.QueryRow(`SELECT stock_on_hand, sku FROM products WHERE id = ?`, l.pid).Scan(&stock, &sku); err != nil {
			return err
		}
		if stock < l.qty {
			return fmt.Errorf("stock físico insuficiente para %s al confirmar", sku)
		}
		next := stock - l.qty
		if _, err := tx.Exec(`UPDATE products SET stock_on_hand = ?, updated_at = ? WHERE id = ?`, next, now, l.pid); err != nil {
			return err
		}
		var reservedOthers int
		_ = tx.QueryRow(`
			SELECT COALESCE(SUM(ql.qty), 0)
			FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
			WHERE ql.product_id = ? AND q.status = 'RESERVED' AND q.id != ?`, l.pid, quoteID).Scan(&reservedOthers)

		_, err = tx.Exec(`
			INSERT INTO inventory_movements (
				id, product_id, type, qty, stock_after, available_after, quote_id, user_id, note, created_at
			) VALUES (?, ?, 'CONFIRMACION_VENTA', ?, ?, ?, ?, ?, ?, ?)`,
			uuid.NewString(), l.pid, l.qty, next, next-reservedOthers, quoteID, userID,
			fmt.Sprintf("Confirmación cotización #%d", number), now)
		if err != nil {
			return err
		}
	}

	_, err = tx.Exec(`UPDATE quotes SET status = 'CONFIRMED', reserved_until = NULL, updated_at = ? WHERE id = ?`, now, quoteID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) CancelQuote(quoteID, userID string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	var number int
	err = tx.QueryRow(`SELECT status, number FROM quotes WHERE id = ?`, quoteID).Scan(&status, &number)
	if err != nil {
		return err
	}
	if status != string(models.QuoteReserved) && status != string(models.QuoteDraft) {
		return errors.New("esta cotización no se puede cancelar")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if status == string(models.QuoteReserved) {
		rows, err := tx.Query(`SELECT product_id, qty FROM quote_lines WHERE quote_id = ?`, quoteID)
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

		for _, l := range lines {
			var stock int
			_ = tx.QueryRow(`SELECT stock_on_hand FROM products WHERE id = ?`, l.pid).Scan(&stock)
			var reservedOthers int
			_ = tx.QueryRow(`
				SELECT COALESCE(SUM(ql.qty), 0)
				FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
				WHERE ql.product_id = ? AND q.status = 'RESERVED' AND q.id != ?`, l.pid, quoteID).Scan(&reservedOthers)
			_, err = tx.Exec(`
				INSERT INTO inventory_movements (
					id, product_id, type, qty, stock_after, available_after, quote_id, user_id, note, created_at
				) VALUES (?, ?, 'LIBERACION_RESERVA', ?, ?, ?, ?, ?, ?, ?)`,
				uuid.NewString(), l.pid, l.qty, stock, stock-reservedOthers, quoteID, userID,
				fmt.Sprintf("Cancelación cotización #%d", number), now)
			if err != nil {
				return err
			}
		}
	}

	_, err = tx.Exec(`UPDATE quotes SET status = 'CANCELLED', reserved_until = NULL, updated_at = ? WHERE id = ?`, now, quoteID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) AdjustStock(productID string, qtyDelta int, userID, note string) error {
	if qtyDelta == 0 {
		return errors.New("cantidad inválida")
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var stock int
	if err := tx.QueryRow(`SELECT stock_on_hand FROM products WHERE id = ?`, productID).Scan(&stock); err != nil {
		return err
	}
	next := stock + qtyDelta
	if next < 0 {
		return errors.New("el stock no puede quedar negativo")
	}
	var reserved int
	_ = tx.QueryRow(`
		SELECT COALESCE(SUM(ql.qty), 0)
		FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
		WHERE ql.product_id = ? AND q.status = 'RESERVED'`, productID).Scan(&reserved)
	if next < reserved {
		return fmt.Errorf("no se puede bajar el stock por debajo de las reservas activas (%d)", reserved)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.Exec(`UPDATE products SET stock_on_hand = ?, updated_at = ? WHERE id = ?`, next, now, productID); err != nil {
		return err
	}

	movType := models.MovAjuste
	if qtyDelta > 0 {
		movType = models.MovEntrada
	} else if qtyDelta < 0 {
		movType = models.MovSalida
	}
	qty := qtyDelta
	if qty < 0 {
		qty = -qty
	}
	if note == "" {
		sign := ""
		if qtyDelta > 0 {
			sign = "+"
		}
		note = fmt.Sprintf("Ajuste de inventario (%s%d)", sign, qtyDelta)
	}

	_, err = tx.Exec(`
		INSERT INTO inventory_movements (
			id, product_id, type, qty, stock_after, available_after, user_id, note, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uuid.NewString(), productID, movType, qty, next, next-reserved, userID, note, now)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) ExpireReservedQuotes() (int, error) {
	now := time.Now().UTC()
	rows, err := s.DB.Query(`
		SELECT id, number FROM quotes
		WHERE status = 'RESERVED' AND reserved_until IS NOT NULL AND reserved_until < ?`,
		now.Format(time.RFC3339))
	if err != nil {
		return 0, err
	}
	type qrow struct {
		id  string
		num int
	}
	var list []qrow
	for rows.Next() {
		var q qrow
		if err := rows.Scan(&q.id, &q.num); err != nil {
			rows.Close()
			return 0, err
		}
		list = append(list, q)
	}
	rows.Close()

	count := 0
	for _, q := range list {
		if err := s.expireOne(q.id, q.num); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func (s *Service) expireOne(quoteID string, number int) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.Query(`SELECT product_id, qty FROM quote_lines WHERE quote_id = ?`, quoteID)
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
		_ = tx.QueryRow(`SELECT stock_on_hand FROM products WHERE id = ?`, l.pid).Scan(&stock)
		var reservedOthers int
		_ = tx.QueryRow(`
			SELECT COALESCE(SUM(ql.qty), 0)
			FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id
			WHERE ql.product_id = ? AND q.status = 'RESERVED' AND q.id != ?`, l.pid, quoteID).Scan(&reservedOthers)
		_, err = tx.Exec(`
			INSERT INTO inventory_movements (
				id, product_id, type, qty, stock_after, available_after, quote_id, note, created_at
			) VALUES (?, ?, 'LIBERACION_RESERVA', ?, ?, ?, ?, ?, ?)`,
			uuid.NewString(), l.pid, l.qty, stock, stock-reservedOthers, quoteID,
			fmt.Sprintf("Expiración automática cotización #%d", number), now)
		if err != nil {
			return err
		}
	}
	_, err = tx.Exec(`UPDATE quotes SET status = 'EXPIRED', reserved_until = NULL, updated_at = ? WHERE id = ?`, now, quoteID)
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

func MovementDelta(t models.MovementType, qty int) (label string, availableFocus bool) {
	switch t {
	case models.MovEntrada:
		return fmt.Sprintf("+%d", qty), false
	case models.MovSalida, models.MovConfirmacionVenta:
		return fmt.Sprintf("−%d", qty), false
	case models.MovReserva:
		return fmt.Sprintf("−%d disp.", qty), true
	case models.MovLiberacionReserva:
		return fmt.Sprintf("+%d disp.", qty), true
	default:
		return fmt.Sprintf("%d", qty), false
	}
}

package models

import "time"

type Role string

const (
	RoleOwner  Role = "OWNER"
	RoleSeller Role = "SELLER"
)

type QuoteStatus string

const (
	QuoteDraft     QuoteStatus = "DRAFT"
	QuoteReserved  QuoteStatus = "RESERVED"
	QuoteConfirmed QuoteStatus = "CONFIRMED"
	QuoteCancelled QuoteStatus = "CANCELLED"
	QuoteExpired   QuoteStatus = "EXPIRED"
)

type MovementType string

const (
	MovEntrada           MovementType = "ENTRADA"
	MovSalida            MovementType = "SALIDA"
	MovAjuste            MovementType = "AJUSTE"
	MovReserva           MovementType = "RESERVA"
	MovLiberacionReserva MovementType = "LIBERACION_RESERVA"
	MovConfirmacionVenta MovementType = "CONFIRMACION_VENTA"
)

type ImportStatus string

const (
	ImportOrdered   ImportStatus = "ORDERED"
	ImportInTransit ImportStatus = "IN_TRANSIT"
	ImportArrived   ImportStatus = "ARRIVED"
	ImportCancelled ImportStatus = "CANCELLED"
)

type User struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Product struct {
	ID          string  `json:"id"`
	SKU         string  `json:"sku"`
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	Description string  `json:"description,omitempty"`
	Color       string  `json:"color,omitempty"`
	ListPrice   float64 `json:"listPrice"`
	DiscountPct float64 `json:"discountPct"`
	NetPrice    float64 `json:"netPrice"`
	StockOnHand int     `json:"stockOnHand"`
	Reserved    int     `json:"reserved,omitempty"`
	Available   int     `json:"available,omitempty"`
	Active      bool    `json:"active"`
}

type Customer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	RNC     string `json:"rnc,omitempty"`
	Phone   string `json:"phone,omitempty"`
	Address string `json:"address,omitempty"`
	Email   string `json:"email,omitempty"`
}

type Quote struct {
	ID            string      `json:"id"`
	Number        int         `json:"number"`
	SellerID      string      `json:"sellerId"`
	CustomerID    string      `json:"customerId"`
	IncludeITBIS  bool        `json:"includeItbis"`
	Status        QuoteStatus `json:"status"`
	Subtotal      float64     `json:"subtotal"`
	ITBISAmount   float64     `json:"itbisAmount"`
	Total         float64     `json:"total"`
	ReservedUntil *time.Time  `json:"reservedUntil,omitempty"`
	Notes         string      `json:"notes,omitempty"`
	CreatedAt     time.Time   `json:"createdAt"`
	Customer      *Customer   `json:"customer,omitempty"`
	Seller        *User       `json:"seller,omitempty"`
	Lines         []QuoteLine `json:"lines,omitempty"`
}

type QuoteLine struct {
	ID        string   `json:"id"`
	QuoteID   string   `json:"quoteId"`
	ProductID string   `json:"productId"`
	Qty       int      `json:"qty"`
	UnitPrice float64  `json:"unitPrice"`
	LineTotal float64  `json:"lineTotal"`
	Product   *Product `json:"product,omitempty"`
}

type InventoryMovement struct {
	ID             string       `json:"id"`
	ProductID      string       `json:"productId"`
	Type           MovementType `json:"type"`
	Qty            int          `json:"qty"`
	StockAfter     int          `json:"stockAfter"`
	AvailableAfter int          `json:"availableAfter"`
	QuoteID        *string      `json:"quoteId,omitempty"`
	UserID         *string      `json:"userId,omitempty"`
	Note           string       `json:"note,omitempty"`
	CreatedAt      time.Time    `json:"createdAt"`
	Product        *Product     `json:"product,omitempty"`
	UserName       string       `json:"userName,omitempty"`
	QuoteNumber    *int         `json:"quoteNumber,omitempty"`
}

type ImportOrder struct {
	ID          string            `json:"id"`
	Number      int               `json:"number"`
	Supplier    string            `json:"supplier,omitempty"`
	Status      ImportStatus      `json:"status"`
	ETA         time.Time         `json:"eta"`
	ArrivedAt   *time.Time        `json:"arrivedAt,omitempty"`
	Notes       string            `json:"notes,omitempty"`
	CreatedByID string            `json:"createdById"`
	CreatedAt   time.Time         `json:"createdAt"`
	Lines       []ImportOrderLine `json:"lines,omitempty"`
	CreatedBy   *User             `json:"createdBy,omitempty"`
}

type ImportOrderLine struct {
	ID        string   `json:"id"`
	ImportID  string   `json:"importId"`
	ProductID string   `json:"productId"`
	Qty       int      `json:"qty"`
	Product   *Product `json:"product,omitempty"`
}

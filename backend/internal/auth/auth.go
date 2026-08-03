package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/kngold/sistema/internal/models"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const userKey contextKey = "user"

type Claims struct {
	UserID string      `json:"uid"`
	Email  string      `json:"email"`
	Name   string      `json:"name"`
	Role   models.Role `json:"role"`
	jwt.RegisteredClaims
}

type Service struct {
	DB     *sql.DB
	Secret []byte
}

func (s *Service) Authenticate(email, password string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u models.User
	var active int
	err := s.DB.QueryRow(`
		SELECT id, name, email, password_hash, role, active
		FROM users WHERE email = ?`, email).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &active,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("credenciales inválidas")
	}
	if err != nil {
		return nil, err
	}
	if active == 0 {
		return nil, errors.New("usuario inactivo")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("credenciales inválidas")
	}
	u.Active = true
	return &u, nil
}

func (s *Service) IssueToken(u *models.User) (string, error) {
	claims := Claims{
		UserID: u.ID,
		Email:  u.Email,
		Name:   u.Name,
		Role:   u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(s.Secret)
}

func (s *Service) ParseToken(tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		return s.Secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, errors.New("token inválido")
	}
	return claims, nil
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	return string(b), err
}

func WithUser(ctx context.Context, u *models.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

func UserFromContext(ctx context.Context) (*models.User, bool) {
	u, ok := ctx.Value(userKey).(*models.User)
	return u, ok
}

func SetAuthCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "kngold_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 3600,
	})
}

func ClearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "kngold_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

func TokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie("kngold_token"); err == nil && c.Value != "" {
		return c.Value
	}
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

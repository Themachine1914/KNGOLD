package middleware

import (
	"net/http"

	"github.com/kngold/sistema/internal/auth"
	"github.com/kngold/sistema/internal/models"
)

func RequireAuth(svc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.TokenFromRequest(r)
			if token == "" {
				http.Error(w, `{"error":"no autorizado"}`, http.StatusUnauthorized)
				return
			}
			claims, err := svc.ParseToken(token)
			if err != nil {
				http.Error(w, `{"error":"sesión inválida"}`, http.StatusUnauthorized)
				return
			}
			u := &models.User{
				ID:    claims.UserID,
				Email: claims.Email,
				Name:  claims.Name,
				Role:  claims.Role,
			}
			next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
		})
	}
}

func RequireOwner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := auth.UserFromContext(r.Context())
		if !ok || u.Role != models.RoleOwner {
			http.Error(w, `{"error":"solo el dueño"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

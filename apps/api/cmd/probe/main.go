// Throwaway dev probe. Runs a small read-only SQL query against DATABASE_URL_DIRECT
// and prints the result. Not wired into builds. Delete after use.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load("../../.env", "../.env", ".env")

	url := os.Getenv("DATABASE_URL_DIRECT")
	if url == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL_DIRECT is empty")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	queries := []struct {
		label string
		sql   string
	}{
		{"auth-related schemas", `SELECT nspname FROM pg_namespace WHERE nspname LIKE '%auth%' OR nspname IN ('neon_auth','better_auth') ORDER BY nspname`},
		{"tables in neon_auth", `SELECT table_name FROM information_schema.tables WHERE table_schema='neon_auth' ORDER BY table_name`},
		{"views in neon_auth", `SELECT table_name FROM information_schema.views WHERE table_schema='neon_auth' ORDER BY table_name`},
	}

	for _, q := range queries {
		rows, err := conn.Query(ctx, q.sql)
		if err != nil {
			fmt.Printf("%-22s ERROR: %v\n", q.label, err)
			continue
		}
		var items []string
		for rows.Next() {
			var s string
			if scanErr := rows.Scan(&s); scanErr == nil {
				items = append(items, s)
			}
		}
		rows.Close()
		if len(items) == 0 {
			fmt.Printf("%-22s (none)\n", q.label)
		} else {
			fmt.Printf("%-22s %s\n", q.label, strings.Join(items, ", "))
		}
	}
}
